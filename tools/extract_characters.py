#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_characters.py —— 从《奥奇传说》精灵图鉴卡片里把角色抠出来

卡片版式固定（575x273），背景不是纯色，而是：
  · 白边卡框 + 圆角
  · 奶油黄渐变卡面
  · 角色脚下的召唤法阵（同心圆环）
  · 淡淡的「奥奇传说」水印文字与右下角 logo

== 走过的弯路（都实测过，别重走）==

  1) 四角泛洪 + 固定容差
     ❌ 抠不动。卡面是渐变，泛洪跨不过去，整张卡都留下。

  2) 「亮像素」泛洪（max(R,G,B) > 阈值）
     ❌ 把白色系角色整个吃掉。白毛的亮度和奶油卡面几乎一样。

  3) 「偏黄 = 背景」+ 分区判据
     ❌ **这条最坑，因为它大部分时候看起来是对的。**
        角色的金色部件（小诺头顶的星星、阿瑞的金冠）本身也是黄的，
        于是连同白毛一起被当成背景删掉 —— 结果就是「头没了一半」。
        阿修之所以没事，只是因为它恰好是深蓝配色，没有金白部件。

== 最终方案：连通性 + 描边，不看颜色阈值 ==

关键观察：**背景是一整块连通的区域，而且角色外面有一圈描边。**

  · 从图片四边开始泛洪
  · 每一步只和**紧挨着的前一个像素**比颜色（局部相似），
    这样能自然跟着渐变走，不需要任何全局颜色模型
  · 遇到**深色像素**（描边）一律不许穿过 —— 这是硬边界
  · 泛洪到的地方 = 背景；没泛洪到的 = 角色

颜色和背景一样的部分（白毛、金冠）之所以不会被误删，是因为它们
**被描边围起来了**，泛洪根本进不去 —— 判据从「什么颜色」变成了
「连不连得通」，这才是这类图的正确打开方式。

剩下的零碎（法阵残环、水印、卡框描边）由连通域分析收尾：
只保留画面中央最大的那一块，以及紧挨着它的小块（尾巴尖、飘带）。

用法：
    python tools/extract_characters.py             # 处理 aqcs/ 下全部
    python tools/extract_characters.py --preview   # 输出棋盘底对比图
    python tools/extract_characters.py --debug     # 输出「被删掉的像素」染色图
"""

import os
import sys
import glob
import argparse
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'aqcs')
OUT_DIR = os.path.join(ROOT, 'assets', 'characters')
DBG_DIR = os.path.join(ROOT, '_dbg')

TOL = 40          # （已弃用，保留给旧命令行参数）
DARK = 190        # 暗于此 = 角色轮廓，屏障
BRIGHT = 195      # 亮于此 = 背景
DILATE = 2        # 屏障加粗圈数：JPEG 会把描边糊开，不加粗就漏
EXPAND = 5        # 回收角色附近碎片的距离（像素）。
                  # 别调大：精灵名字就在角色上方约 13px 处，
                  # 设成 14 会把「小诺」两个字一起抠进来（实测踩过）。
OUT_MAX = 512     # 输出最长边
PAD = 3           # 裁剪时四周留一点余量，免得贴着边

# 中文文件名在 file:// 下要过 URL 编码，容易踩坑；统一换成 ASCII 文件名
SLUG = {
    '小诺': 'xiaonuo',
    '阿修': 'axiu',
    '小天': 'xiaotian',
    '炎阿瑞': 'yanarui',
    '阿瑞': 'arui',
    '小炎': 'xiaoyan',
}

# 角色大致所在的水平范围（相对比例）。只用来给连通域筛选兜底，
# 不参与抠图本身 —— 抠图完全靠连通性。
CORE_X = (0.28, 0.72)


def dilate(mask, W, H, times=1):
    """把屏障加粗，堵住 JPEG 压缩糊出来的小缺口"""
    cur = mask
    for _ in range(times):
        nxt = bytearray(cur)
        for y in range(H):
            base = y * W
            for x in range(W):
                i = base + x
                if cur[i]:
                    continue
                if ((x > 0 and cur[i - 1]) or (x < W - 1 and cur[i + 1]) or
                        (y > 0 and cur[i - W]) or (y < H - 1 and cur[i + W])):
                    nxt[i] = 1
        cur = nxt
    return cur


def flood_background(img, bright=None, dark=None, dilate_times=None):
    """
    判据只有两条：**亮的算背景，暗的算角色轮廓**。剩下全靠连通性。

    为什么这样反而最稳（前面几条路都试过，全失败）：
      · 「偏黄 = 背景」   -> 角色的金冠、金饰也是黄的，被一起删掉（头没了一半）
      · 「饱和 = 角色」   -> 卡面本身就是饱和金色 sat≈0.43，整张卡都算角色
      · 「逐像素比色差」   -> JPEG 把描边糊开 2~3 像素，色差被"温水煮青蛙"，
                            泛洪一路渗进角色内部，5 个角色全被啃光

    关键认识：角色内部那些「和背景同色」的部分（白毛、金冠）之所以不会被误删，
    **不是因为颜色判得准，而是因为它们在角色的深色描边里面** —— 泛洪进不去。
    所以判据从「这是什么颜色」换成了「连不连得通」。

    屏障必须加粗（DILATE=2）：实测只加粗 1 圈时，小诺的描边仍有一处
    JPEG 缺口，泛洪钻进去把整个身子掏空了，只剩一圈轮廓线。

    注意参数默认值写成 None 再在函数体里取全局：
    Python 的默认参数是**定义时**求值一次的，写成 `dilate_times=DILATE`
    之后，命令行再改 DILATE 也不会生效（这个坑真踩过，--dilate 变成空操作）。
    """
    if bright is None: bright = BRIGHT
    if dark is None: dark = DARK
    if dilate_times is None: dilate_times = DILATE

    rgb = img.convert('RGB')
    W, H = rgb.size
    px = rgb.load()

    barrier = bytearray(W * H)
    for y in range(H):
        base = y * W
        for x in range(W):
            if max(px[x, y]) < dark:
                barrier[base + x] = 1
    if dilate_times:
        barrier = dilate(barrier, W, H, dilate_times)

    marked = bytearray(W * H)
    q = deque()

    def seed(x, y):
        i = y * W + x
        if marked[i] or barrier[i]:
            return
        if max(px[x, y]) <= bright:
            return
        marked[i] = 1
        q.append((x, y))

    for x in range(W):
        seed(x, 0)
        seed(x, H - 1)
    for y in range(H):
        seed(0, y)
        seed(W - 1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= W or ny >= H:
                continue
            i = ny * W + nx
            if marked[i] or barrier[i]:
                continue
            if max(px[nx, ny]) <= bright:
                continue
            marked[i] = 1
            q.append((nx, ny))

    return marked, W, H


def find_components(alpha, w, h):
    """把不透明像素切成连通域，每个返回 (面积, 包围盒, 像素下标列表)"""
    seen = bytearray(w * h)
    comps = []
    for start in range(w * h):
        if alpha[start] == 0 or seen[start]:
            continue
        comp = []
        q = deque([start])
        seen[start] = 1
        minx = maxx = start % w
        miny = maxy = start // w
        while q:
            i = q.popleft()
            comp.append(i)
            x, y = i % w, i // w
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if alpha[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
        comps.append((len(comp), (minx, miny, maxx, maxy), comp))
    return comps


def keep_character(alpha, w, h, min_area=30, expand=EXPAND):
    """
    只留下角色那一块。

    泛洪之后还留着的是：角色 + 卡框描边 + 精灵名字 + 属性角标 + logo。
    角色总是「画面中央最大的那一块非背景区域」，但也可能被拆成几块
    （尾巴尖、飘带断开了），所以再按**真实像素距离**回收它附近的小块。

    不能只按包围盒判断邻近：包围盒是矩形，卡框的弧线只要落在矩形里
    就会被一起收回来，裁剪框会被撑得很大（实测踩过）。
    """
    comps = find_components(alpha, w, h)
    if not comps:
        return 0, 0, None

    x0, x1 = CORE_X[0] * w, CORE_X[1] * w

    def character_like(c):
        n, (minx, miny, maxx, maxy), comp = c
        if n < 120:
            return False
        if (maxx - minx) > w * 0.55:        # 横跨大半张卡 -> 是卡框，不是角色
            return False
        if (maxy - miny) > h * 0.92:
            return False
        # 质心要落在中央
        sx = sum(i % w for i in comp) / n
        return x0 <= sx <= x1

    cands = [c for c in comps if character_like(c)]
    if not cands:
        return 0, 0, None
    big = max(cands, key=lambda c: c[0])
    big_id = comps.index(big)

    # 给每个像素标上所属块编号，便于按真实距离判断邻近
    comp_of = [0] * (w * h)
    for idx, (n, bb, comp) in enumerate(comps):
        cid = idx + 1
        for i in comp:
            comp_of[i] = cid

    # 从最大块向外 BFS（可以穿过任何像素），把 expand 步内的块视为角色的一部分
    near = set()
    dist = bytearray([255]) * 1
    dist = [255] * (w * h)
    q = deque()
    for i in big[2]:
        dist[i] = 0
        q.append(i)
    while q:
        i = q.popleft()
        d = dist[i]
        if d >= expand:
            continue
        y, x = divmod(i, w)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if dist[j] <= d + 1:
                    continue
                dist[j] = d + 1
                cid = comp_of[j]
                if cid and cid != big_id + 1:
                    near.add(cid)
                q.append(j)

    kept = 0
    dropped = 0
    for idx, (n, (minx, miny, maxx, maxy), comp) in enumerate(comps):
        cid = idx + 1
        frame_like = (maxx - minx) > w * 0.55 or (maxy - miny) > h * 0.92
        if cid == big_id + 1 or (cid in near and n >= min_area and not frame_like):
            kept += n
        else:
            for i in comp:
                alpha[i] = 0
            dropped += 1

    return dropped, kept, big[1]


def sanity_check(out):
    """
    抠完之后自检，返回 (问题列表, 指标字典)。

    这几条判据都是被坑出来的：前几版算法会把角色「掏空」（只剩一圈轮廓线）
    或者「砍头」，而那两种结果**看起来都是"有图的"**，不逐个盯着看根本发现不了
    —— 实际上就是这么漏过去的。所以把「什么样的结果算坏」写成硬判据。

    阈值是实测定的（同一张 小诺 卡片）：
        指标            正常(屏障2圈)   掏空(屏障1圈)
        整块填充率         0.563          0.246
        中段行覆盖率均值    0.686          0.278
        中段列覆盖率均值    0.754          0.301
    取在两者中间，两边都留足余量。
    """
    a = out.getchannel('A')
    px = a.load()
    w, h = out.size
    problems = []
    m = {}

    if w < 60 or h < 60:
        problems.append(f'尺寸太小 {w}x{h}')

    opaque = sum(1 for y in range(h) for x in range(w) if px[x, y] > 32)
    m['fill'] = opaque / (w * h)
    if m['fill'] < 0.33:
        problems.append(f'整块填充率只有 {m["fill"]:.2f}（<0.33），像是被掏空了')
    if m['fill'] > 0.92:
        problems.append(f'整块填充率高达 {m["fill"]:.2f}，背景可能没抠掉')

    # 只看中间 50%，避开头顶和脚尖本来就细的地方
    ys = range(int(h * 0.25), int(h * 0.75))
    xs = range(int(w * 0.25), int(w * 0.75))
    rowcov = [sum(1 for x in range(w) if px[x, y] > 32) / w for y in ys]
    colcov = [sum(1 for y in range(h) if px[x, y] > 32) / h for x in xs]
    m['rowMin'] = min(rowcov) if rowcov else 0
    m['rowAvg'] = sum(rowcov) / len(rowcov) if rowcov else 0
    m['colMin'] = min(colcov) if colcov else 0
    m['colAvg'] = sum(colcov) / len(colcov) if colcov else 0

    if m['rowAvg'] < 0.45:
        problems.append(f'中段行覆盖率均值只有 {m["rowAvg"]:.2f}（<0.45），身体像是被切掉了')
    if m['colAvg'] < 0.45:
        problems.append(f'中段列覆盖率均值只有 {m["colAvg"]:.2f}（<0.45），像是被竖着切了一刀')
    if m['rowMin'] < 0.12:
        problems.append(f'中段有整行几乎空白（最低 {m["rowMin"]:.2f}）')

    return problems, m


def extract(path, preview_dir=None, debug_dir=None, verbose=True):
    cn = os.path.splitext(os.path.basename(path))[0]
    name = SLUG.get(cn, cn)
    img = Image.open(path).convert('RGB')
    W, H = img.size

    visited, w, h = flood_background(img)
    alpha = bytearray(0 if visited[i] else 255 for i in range(W * H))

    if debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        dbg = img.copy()
        dpx = dbg.load()
        for y in range(H):
            for x in range(W):
                if visited[y * W + x]:
                    dpx[x, y] = (255, 60, 60)
        dbg.resize((W * 2, H * 2), Image.LANCZOS).save(
            os.path.join(debug_dir, name + '-removed.png'))

    dropped, kept, bbox = keep_character(alpha, W, H)

    out = img.convert('RGBA')
    out.putalpha(Image.frombytes('L', (W, H), bytes(alpha)))

    ab = out.getchannel('A').getbbox()
    if not ab:
        if verbose:
            print(f'  {name}: 全被删光了，参数需要调整')
        return None
    # 四周留一点余量
    ab = (max(0, ab[0] - PAD), max(0, ab[1] - PAD),
          min(W, ab[2] + PAD), min(H, ab[3] + PAD))
    out = out.crop(ab)

    if max(out.size) > OUT_MAX:
        s = OUT_MAX / max(out.size)
        out = out.resize((max(1, round(out.size[0] * s)),
                          max(1, round(out.size[1] * s))), Image.LANCZOS)

    out.putalpha(out.getchannel('A').filter(ImageFilter.GaussianBlur(0.5)))

    os.makedirs(OUT_DIR, exist_ok=True)
    out.save(os.path.join(OUT_DIR, name + '.png'))
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        out.save(os.path.join(preview_dir, name + '.png'))

    problems, metrics = sanity_check(out)
    if verbose:
        pct = kept / (W * H) * 100
        flag = ('  ⚠ ' + ' / '.join(problems)) if problems else ''
        print(f'  {name:9s} -> {out.size[0]:4d}x{out.size[1]:<4d}  '
              f'占比 {pct:4.1f}%  填充 {metrics["fill"]:.2f}  '
              f'行均 {metrics["rowAvg"]:.2f}  列均 {metrics["colAvg"]:.2f}{flag}')
    return out, problems


def main():
    global DARK, BRIGHT, DILATE, EXPAND

    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true', help='输出棋盘底对比图')
    ap.add_argument('--debug', action='store_true', help='输出「被删掉的像素」染色图')
    ap.add_argument('--src', default=SRC_DIR)
    ap.add_argument('--bright', type=int, default=BRIGHT, help='亮于此 = 背景')
    ap.add_argument('--dark', type=int, default=DARK, help='暗于此 = 角色轮廓（屏障）')
    ap.add_argument('--dilate', type=int, default=DILATE, help='屏障加粗圈数')
    ap.add_argument('--expand', type=int, default=EXPAND, help='回收角色附近碎片的距离')
    args = ap.parse_args()

    DARK, BRIGHT, DILATE = args.dark, args.bright, args.dilate
    EXPAND = args.expand

    files = sorted(glob.glob(os.path.join(args.src, '*.jpg')) +
                   glob.glob(os.path.join(args.src, '*.png')))
    if not files:
        print('没找到图片:', args.src)
        return 1

    print(f'处理 {len(files)} 张卡片 -> {OUT_DIR}   '
          f'(背景亮度>{BRIGHT} / 轮廓亮度<{DARK} / 屏障加粗{DILATE}圈)')

    results, all_problems = [], []
    for f in files:
        r = extract(f, '_dbg/prev' if args.preview else None,
                    DBG_DIR if args.debug else None)
        if r and r[0] is not None:
            results.append(r[0])
            if r[1]:
                all_problems.append((os.path.basename(f), r[1]))
    print(f'成功 {len(results)}/{len(files)}')

    if all_problems:
        print('\n⚠ 自检没过的：')
        for fn, ps in all_problems:
            print(f'  {fn}: ' + '；'.join(ps))
        print('  这些角色在游戏里大概率会显示不全，别急着用。')
    else:
        print('自检：全部通过（尺寸 / 不透明占比 / 中段行列都得有内容）')

    if args.preview and results:
        sheet = contact_sheet(results)
        print('对比图:', sheet)

    return 0 if (len(results) == len(files) and not all_problems) else 2


def contact_sheet(results, scale=2, path=None):
    SC = scale
    tiles = [(r.resize((r.width * SC, r.height * SC), Image.LANCZOS)) for r in results]
    cw = max(t.width for t in tiles) + 24
    ch = max(t.height for t in tiles) + 24
    cols = min(5, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cw * cols, ch * rows), (255, 255, 255))
    sq = 14
    for y in range(0, sheet.height, sq):
        for x in range(0, sheet.width, sq):
            if (x // sq + y // sq) % 2 == 0:
                sheet.paste((203, 208, 218),
                            (x, y, min(x + sq, sheet.width), min(y + sq, sheet.height)))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * cw + 12, (i // cols) * ch + 12), t)
    out = path or os.path.join(DBG_DIR, 'extracted.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)
    return out


if __name__ == '__main__':
    sys.exit(main())
