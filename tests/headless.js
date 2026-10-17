/* ============================================================
 * tests/headless.js —— 无头逻辑测试（Node 直接跑，不需要浏览器）
 *
 *   node tests/headless.js
 *
 * 只加载不依赖 DOM 的模块：config / rng / grid / levelgen / motion / rules
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
global.window = global;   // 让 IIFE 里的 window.BI 能挂上

const MODULES = [
  'src/core/config.js',
  'src/core/rng.js',
  'src/game/grid.js',
  'src/game/levelgen.js',
  'src/game/motion.js',
  'src/game/rules.js',
  'src/game/danger.js',
  'src/game/entities.js',
  'src/game/ai.js',
  'src/game/match.js',
  'src/render/draw.js',
  'src/render/effects.js',
  'src/audio/sfx.js',
  'src/audio/music.js'
];

for (const f of MODULES) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}

const BI = global.BI;
const CFG = BI.config, G = BI.grid, T = BI.T, R = BI.rules, MO = BI.motion;

/* ---------------- 迷你断言框架 ---------------- */
let passed = 0, failed = 0;
const failures = [];

function ok(cond, label, detail) {
  if (cond) { passed++; }
  else {
    failed++;
    failures.push(label + (detail ? '  →  ' + detail : ''));
    console.log('  ✗ ' + label + (detail ? '  →  ' + detail : ''));
  }
}
function group(name) { console.log('\n' + name); }

/* ---------------- 工具 ---------------- */

/** 用字符画构造地图：# 硬墙  B 软砖  . 空地 */
function artMap(rows) {
  const ROWS = rows.length, COLS = rows[0].length;
  if (COLS !== CFG.COLS || ROWS !== CFG.ROWS) {
    throw new Error(`artMap 尺寸必须是 ${CFG.COLS}x${CFG.ROWS}，收到 ${COLS}x${ROWS}`);
  }
  const map = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = rows[r][c];
      map[r * COLS + c] = ch === '#' ? T.HARD : ch === 'B' ? T.BRICK : T.EMPTY;
    }
  }
  return map;
}

/** 生成一张只有外围硬墙的空地图 */
function emptyMap() {
  const rows = [];
  for (let r = 0; r < CFG.ROWS; r++) {
    let s = '';
    for (let c = 0; c < CFG.COLS; c++) {
      s += (r === 0 || c === 0 || r === CFG.ROWS - 1 || c === CFG.COLS - 1) ? '#' : '.';
    }
    rows.push(s);
  }
  return artMap(rows);
}

function makePlayer(id, c, r) {
  return {
    id, keyId: id, color: '#fff',
    x: G.centerX(c), y: G.centerY(r), px: G.centerX(c), py: G.centerY(r),
    facing: 1, moving: false, axisPref: 'x',
    power: CFG.START_POWER, maxBombs: CFG.START_BOMBS, bombsOut: 0,
    speedBonus: 0, shield: 0, starTime: 0, kick: false, invuln: 0, squash: 0,
    alive: true, deadAt: 0, lives: 3, picked: {}
  };
}

function makeWorld(map, players) {
  const w = {
    mode: 'solo', map, bombs: [], flames: [], items: [], players: players || [],
    enemies: [], danger: null, time: 0, rng: BI.makeRng(12345),
    burnItems: CFG.BURN_ITEMS, itemPool: 'core',
    stats: { explosions: 0, kills: 0 },
    playerById(id) { return this.players.find(p => p.id === id) || null; },
    onExplode() { this.stats.explosions++; },
    /* 必须和 main.js 的接线保持一致，否则测出来的不是真实行为：
       扣命 / 记时间，然后把死亡入队交给 match 批量结算 */
    onDeath(p) {
      p.deadAt = this.time;
      if (this.mode !== 'versus') R.changeLives(p, -1);
      if (this.match) BI.match.onDeath(this, p);
    },
    onEnemyDeath(e) { this.stats.kills++; },
    onEnemyBomb() {},
    onPickup() {}, onShieldBreak() {},
    onNewRound() {}, onNextLevel() {}
  };
  return w;
}

/** 只推进敌人 AI（不跑炸弹/伤害），用于单独验证走位 */
function runAI(w, seconds) {
  const DG = BI.danger, AI = BI.ai;
  const n = Math.max(1, Math.round(seconds / (1 / 60)));
  for (let i = 0; i < n; i++) {
    w.time += 1 / 60;
    DG.compute(w);
    for (const e of w.enemies) AI.updateEnemy(w, e, 1 / 60);
  }
}

/** 触发一次爆炸（模拟引信烧完） */
function boom(world, bomb) {
  const i = world.bombs.indexOf(bomb);
  if (i >= 0) world.bombs.splice(i, 1);
  R.detonate(world, bomb);
}

function flameCount(world) {
  let n = 0;
  for (const f of world.flames) n += f.cells.length;
  return n;
}

/* ============================================================
 * 1. 地图生成
 * ============================================================ */
group('1. 地图生成（三种模式 × 300 个种子）');
{
  let degraded = 0, total = 0, badSpawn = 0, badConnect = 0, deadBrick = 0, bricks = 0;
  const spawns = [[1, 1], [CFG.COLS - 2, CFG.ROWS - 2]];

  for (const mode of ['dig', 'versus', 'adventure']) {
    for (let s = 1; s <= 300; s++) {
      total++;
      const lvl = BI.levelgen.generate(BI.makeRng(s * 7919 + mode.length), { mode, spawns });
      if (lvl.degraded) degraded++;

      for (const [c, r] of spawns) {
        if (lvl.map[r * CFG.COLS + c] !== T.EMPTY) badSpawn++;
      }
      const v = BI.levelgen.validate(lvl.map, spawns, mode);
      if (!v.spawnsOk) badConnect++;
      // 死局检查：不能有「永远炸不到」的软砖
      if (v.deadBricks > 0) deadBrick++;
      bricks += v.bricks;
    }
  }

  ok(badSpawn === 0, '所有出生点都是空地', `${badSpawn}/${total * 2} 个出生点被占用`);
  ok(badConnect === 0, '所有出生点互相连通', `${badConnect} 张图不连通`);
  ok(deadBrick === 0, '没有「永远炸不到的软砖」死局', `${deadBrick} 张图有死砖`);
  ok(degraded / total < 0.05, '降级率低于 5%（不能动辄退化成空白地图）',
     `实际 ${(degraded / total * 100).toFixed(1)}%`);
  console.log(`  · 生成 ${total} 张图，降级 ${degraded} 张，平均软砖 ${(bricks / total).toFixed(0)} 块`);
}

/* ============================================================
 * 1b. 随机硬墙：不出死路、全图畅通、每张都不一样
 * ============================================================ */
group('1b. 随机硬墙（不出死路 / 全图畅通 / 每张图都不一样）');
{
  const L = BI.levelgen;
  const spawns = [[1, 1], [CFG.COLS - 2, CFG.ROWS - 2]];

  /** 独立复核：从某个非硬墙格出发能不能走遍所有非硬墙格 */
  function reachableCells(map) {
    let start = -1, total = 0;
    for (let i = 0; i < map.length; i++) {
      if (map[i] !== T.HARD) { total++; if (start < 0) start = i; }
    }
    const vis = new Uint8Array(map.length);
    const q = [start];
    vis[start] = 1;
    let seen = 1;
    while (q.length) {
      const cur = q.pop(), c = cur % CFG.COLS, r = (cur - c) / CFG.COLS;
      for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
        if (nc < 0 || nr < 0 || nc >= CFG.COLS || nr >= CFG.ROWS) continue;
        const ni = nr * CFG.COLS + nc;
        if (vis[ni] || map[ni] === T.HARD) continue;
        vis[ni] = 1; seen++; q.push(ni);
      }
    }
    return { seen, total };
  }

  let deadEnd = 0, notConn = 0, minExitsSeen = 9, notRandom = 0, walls = [];
  let withDeadEnd = 0;              // 含"一条进出的走廊"的图有多少张
  const shapes = new Set();

  for (let s = 1; s <= 200; s++) {
    const lvl = L.generate(BI.makeRng(s * 104729 + 13), { mode: 'versus', spawns });
    const map = lvl.map;
    let thisDeadEnd = false;

    // 统计每个可走格子的出口数
    for (let r = 1; r < CFG.ROWS - 1; r++) {
      for (let c = 1; c < CFG.COLS - 1; c++) {
        if (map[r * CFG.COLS + c] === T.HARD) continue;
        const ex = L.openExits(map, c, r);
        if (ex < minExitsSeen) minExitsSeen = ex;
        if (ex < CFG.MIN_EXITS) deadEnd++;
        if (ex === 1) thisDeadEnd = true;      // 只有一条进出的走廊 —— 现在允许
      }
    }
    if (thisDeadEnd) withDeadEnd++;

    const rc = reachableCells(map);
    if (rc.seen !== rc.total) notConn++;

    // 硬墙骨架签名：用来确认每张图的布局确实不同
    let sig = '', n = 0;
    for (let i = 0; i < map.length; i++) {
      if (map[i] === T.HARD) { sig += '1'; n++; } else sig += '0';
    }
    if (shapes.has(sig)) notRandom++;
    shapes.add(sig);
    walls.push(n);
  }

  console.log(`  · 200 张图，硬墙 ${Math.min(...walls)}~${Math.max(...walls)} 块，` +
              `最小出口数 ${minExitsSeen}，不同布局 ${shapes.size} 种，` +
              `含单出口走廊 ${withDeadEnd} 张`);

  ok(notConn === 0, '每一张图都是连通的：不存在走不到的格点（这是硬要求）',
     `${notConn} 张图不连通`);
  ok(deadEnd === 0, '没有出口数为 0 的格子（不会被彻底封死）',
     `${deadEnd} 个格子被封死`);
  ok(minExitsSeen >= 1, '实测最小出口数 >= 1', String(minExitsSeen));
  ok(shapes.size === 200, '200 个种子生成了 200 种不同布局（不是千篇一律）',
     `只有 ${shapes.size} 种`);
  ok(notRandom === 0, '没有两张图撞成同一副骨架');

  // 随机布局 ≠ 经典棋盘格：抽查硬墙不再落在 2 的倍数格子上
  {
    let offGrid = 0;
    const lvl = L.generate(BI.makeRng(999), { mode: 'versus', spawns });
    for (let r = 1; r < CFG.ROWS - 1; r++) {
      for (let c = 1; c < CFG.COLS - 1; c++) {
        if (lvl.map[r * CFG.COLS + c] === T.HARD && !(c % 2 === 0 && r % 2 === 0)) offGrid++;
      }
    }
    ok(offGrid > 0, '硬墙不再整齐排在棋盘格上（确实随机了）',
       `这颗种子的硬墙全都在 2 的倍数格上`);
  }

  // 关掉开关要能回到经典棋盘格
  {
    const saved = CFG.RANDOM_WALLS;
    CFG.RANDOM_WALLS = false;
    const lvl = L.generate(BI.makeRng(999), { mode: 'versus', spawns });
    let odd = 0;
    for (let r = 1; r < CFG.ROWS - 1; r++) {
      for (let c = 1; c < CFG.COLS - 1; c++) {
        if (lvl.map[r * CFG.COLS + c] === T.HARD && !L.isCore(lvl.theme,c,r) && !(c % 2 === 0 && r % 2 === 0)) odd++;
      }
    }
    CFG.RANDOM_WALLS = saved;
    ok(odd === 0, '经典模式在中央设施之外使用棋盘格柱子', `${odd} 块不在格点上`);
  }

  // 结构校验函数本身要能抓出坏图
  {
    const good = BI.levelgen.buildMap(BI.makeRng(5), 0, spawns);
    ok(BI.levelgen.structureOk(good, CFG.MIN_EXITS) === true,
       'structureOk 认得出好图（按当前 MIN_EXITS=' + CFG.MIN_EXITS + '）');

    // 造一条死路：把 (3,3) 周围堵到只剩一个出口
    const bad = emptyMap();
    bad[G.idx(2, 3)] = T.HARD;
    bad[G.idx(4, 3)] = T.HARD;
    bad[G.idx(3, 2)] = T.HARD;
    ok(BI.levelgen.structureOk(bad, 2) === false, 'MIN_EXITS=2 时抓得出死路');
    ok(BI.levelgen.structureOk(bad, 1) === true,
       'MIN_EXITS=1 时允许「只有一条进出的走廊」（当前默认）');

    // 造一个孤岛：四面封死，谁也走不到 —— 这个任何设置下都不许有
    const island = emptyMap();
    island[G.idx(3, 3)] = T.EMPTY;
    island[G.idx(2, 3)] = T.HARD;
    island[G.idx(4, 3)] = T.HARD;
    island[G.idx(3, 2)] = T.HARD;
    island[G.idx(3, 4)] = T.HARD;
    ok(BI.levelgen.structureOk(island, 1) === false,
       '被封死的孤岛在任何设置下都会被拒（不连通）');
    ok(BI.levelgen.structureOk(island, 0) === false,
       '就算把出口数要求关掉，连通性也会拦住孤岛');
  }
}

/* ============================================================
 * 2. 爆炸几何
 * ============================================================ */
group('2. 爆炸几何：火焰长度 / 硬墙挡火 / 软砖吸火');
{
  const map = emptyMap();
  map[G.idx(7, 5)] = T.BRICK;          // 右边第 2 格放一块软砖（火力 3 本可够到第 3 格）

  const w = makeWorld(map);
  const bomb = { cx: 5, cy: 5, power: 3, ownerId: 'p1', freeFor: null, fuse: 0 };
  boom(w, bomb);

  // 中心 1 + 右 2（第 2 格软砖吃火后停）+ 左 3 + 上 3 + 下 3 = 12
  ok(flameCount(w) === 12, '火焰格数正确（12 格）', `实际 ${flameCount(w)} 格`);
  ok(w.map[G.idx(7, 5)] === T.EMPTY, '软砖被炸掉');
  ok(R.flameAt(w, 7, 5) === true, '软砖那一格本身显示火焰');

  const cells = w.flames[0].cells.map(c => c[0] + ',' + c[1]);
  ok(cells.includes('6,5'), '右侧第 1 格有火焰');
  ok(!cells.includes('8,5'), '软砖吸掉了火焰，后面那格没被烧到（虽然火力本来是够的）');

  // 硬墙挡火
  const map2 = emptyMap();
  map2[G.idx(7, 5)] = T.HARD;
  const w2 = makeWorld(map2);
  boom(w2, { cx: 5, cy: 5, power: 3, ownerId: 'p1', freeFor: null, fuse: 0 });
  const cells2 = w2.flames[0].cells.map(c => c[0] + ',' + c[1]);
  ok(!cells2.includes('7,5'), '硬墙那一格不显示火焰');
  ok(cells2.includes('6,5'), '硬墙之前仍有火焰');
}

/* ============================================================
 * 3. 连锁引爆
 * ============================================================ */
group('3. 连锁引爆：A 的火焰碰到 B，B 当帧立即炸');
{
  const map = emptyMap();
  const w = makeWorld(map);
  const a = { cx: 3, cy: 5, power: 2, ownerId: 'p1', freeFor: null, fuse: 0 };
  const b = { cx: 5, cy: 5, power: 1, ownerId: 'p2', freeFor: null, fuse: 9 };
  w.bombs.push(a, b);

  boom(w, a);

  ok(w.bombs.length === 0, '连锁后两颗炸弹都没了', `剩 ${w.bombs.length} 颗`);
  ok(w.flames.length === 2, '产生了 2 次爆炸（原爆 + 连锁）', `实际 ${w.flames.length} 次`);
  const all = [];
  w.flames.forEach(f => f.cells.forEach(c => all.push(c[0] + ',' + c[1])));
  ok(all.includes('5,5'), '第二颗炸弹的位置有火焰');
  ok(all.includes('6,5'), '连锁爆炸也向外延伸了（B 的火力 1）');
}

/* ============================================================
 * 4. 站在自己炸弹上的规则
 * ============================================================ */
group('4. 站在自己刚放的炸弹上能走出去，走出去后不能再回来');
{
  const map = emptyMap();
  const p1 = makePlayer('p1', 5, 5);
  const p2 = makePlayer('p2', 9, 9);
  const w = makeWorld(map, [p1, p2]);

  ok(R.tryPlaceBomb(w, p1) === true, '放炸弹成功');
  const bomb = w.bombs[0];
  ok(bomb.freeFor === 'p1', '炸弹记录了自己的主人');

  ok(G.canStand(map, w.bombs, p1.x, p1.y, CFG.BOX, 'p1') === true, '主人可以踩着自己的炸弹');
  ok(G.canStand(map, w.bombs, p1.x, p1.y, CFG.BOX, 'p2') === false, '对其他人立刻就是实体障碍');

  // 主人走开
  p1.x = G.centerX(3);
  R.updateBombs(w, 1 / 60);
  ok(bomb.freeFor === null, '主人离开后炸弹变成实体');
  ok(G.canStand(map, w.bombs, bomb.cx * CFG.TILE + 24, bomb.cy * CFG.TILE + 24, CFG.BOX, 'p1') === false,
     '主人也不能再走回炸弹那一格');

  // 配额限制
  const w2 = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
  const q = w2.players[0];
  ok(R.tryPlaceBomb(w2, q) === true, '第 1 颗放得下（配额 1）');
  q.x = G.centerX(7);
  ok(R.tryPlaceBomb(w2, q) === false, '配额用完放不下第 2 颗');
  q.maxBombs = 2;
  ok(R.tryPlaceBomb(w2, q) === true, '吃到炸弹道具后放得下第 2 颗');
}

/* ============================================================
 * 5. 移动与碰撞
 * ============================================================ */
group('5. 移动：走得动 / 撞得停 / 不会穿墙');
{
  const map = emptyMap();
  map[G.idx(6, 5)] = T.HARD;            // 正前方一堵硬墙
  const p = makePlayer('p1', 2, 5);
  const w = makeWorld(map, [p]);

  const startX = p.x;
  for (let i = 0; i < 60; i++) MO.step(w, p, 1, 0, 1 / 60);
  ok(p.x > startX, '向右走动了', `x: ${startX.toFixed(1)} -> ${p.x.toFixed(1)}`);
  ok(G.canStand(map, w.bombs, p.x, p.y, CFG.BOX, p.id), '移动后没有卡进墙里');
  ok(p.x < G.centerX(6), '被硬墙挡住了，没有穿过去', `x=${p.x.toFixed(1)}, 墙在 ${G.centerX(6)}`);

  // 上边界不能穿
  const p2 = makePlayer('p2', 5, 1);
  const w2 = makeWorld(emptyMap(), [p2]);
  for (let i = 0; i < 120; i++) MO.step(w2, p2, 0, -1, 1 / 60);
  ok(p2.y > CFG.TILE, '顶到最外圈硬墙就停住，没穿出地图', `y=${p2.y.toFixed(1)}`);
}

/* ============================================================
 * 6. 转角辅助（键盘玩网格游戏手感的分水岭）
 * ============================================================ */
group('6. 转角辅助：偏差 10px 能自动对齐通过，偏差 20px 过不去');
{
  // 第 5 行是通道，第 6 行在第 3 列是硬墙
  const rows = [];
  for (let r = 0; r < CFG.ROWS; r++) {
    let s = '';
    for (let c = 0; c < CFG.COLS; c++) {
      if (r === 0 || c === 0 || r === CFG.ROWS - 1 || c === CFG.COLS - 1) s += '#';
      else if (r === 6 && c === 3) s += '#';
      else s += '.';
    }
    rows.push(s);
  }
  const map = artMap(rows);

  // 偏差 10px（在 ASSIST=12 之内）
  const near = makePlayer('p1', 2, 5);
  const wn = makeWorld(map, [near]);
  near.y = G.centerY(5) + 10;
  const x0 = near.x;
  for (let i = 0; i < 40; i++) MO.step(wn, near, 1, 0, 1 / 60);
  ok(near.x > x0 + 20, '偏差 10px：自动对齐后顺利通过', `x: ${x0.toFixed(1)} -> ${near.x.toFixed(1)}`);
  ok(near.y < G.centerY(5) + 10, '被自动朝通道中线拉回', `y=${near.y.toFixed(2)}, 中线=${G.centerY(5)}`);

  // 偏差 20px（超出 ASSIST）
  const far = makePlayer('p2', 2, 5);
  const wf = makeWorld(map, [far]);
  far.y = G.centerY(5) + 20;
  const x1 = far.x;
  for (let i = 0; i < 40; i++) MO.step(wf, far, 1, 0, 1 / 60);
  ok(Math.abs(far.y - (G.centerY(5) + 20)) < 0.01, '偏差 20px：不会被垂直「吸」到中线',
     `y 变化 ${(far.y - (G.centerY(5) + 20)).toFixed(3)}`);
  ok(far.x < G.centerX(3), '偏差 20px：卡在拐角上过不去',
     `x=${far.x.toFixed(1)}，下一格中心=${G.centerX(3)}`);
}

/* ============================================================
 * 7. 道具与伤害
 * ============================================================ */
group('7. 道具拾取 / 伤害 / 护盾');
{
  const p = makePlayer('p1', 5, 5);
  const w = makeWorld(emptyMap(), [p]);

  const before = p.power;
  R.applyItem(p, 'fire');
  ok(p.power === before + 1, '火力道具 +1 格');
  for (let i = 0; i < 20; i++) R.applyItem(p, 'fire');
  ok(p.power === CFG.MAX_POWER, '火力有上限，不会无限叠加', `power=${p.power}`);

  p.speedBonus = 0;
  for (let i = 0; i < 50; i++) R.applyItem(p, 'speed');
  ok(Math.abs(p.speedBonus - CFG.SPEED_MAX_BONUS) < 1e-9, '速度加成封顶 +50%', `bonus=${p.speedBonus}`);

  // 拾取
  const w2 = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
  w2.items.push({ c: 5, r: 5, type: 'fire' });
  R.updateItems(w2, 1 / 60);
  ok(w2.items.length === 0, '走过去就把道具捡了');
  ok(w2.players[0].power === CFG.START_POWER + 1, '捡到的火力生效了');

  // 被火烧死
  const w3 = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
  w3.flames.push({ cells: [[5, 5]], t: 0.4, total: 0.4 });
  R.updateDamage(w3, 1 / 60);
  ok(w3.players[0].alive === false, '踩在火焰上会死');

  // 护盾挡一次
  const w4 = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
  R.applyItem(w4.players[0], 'shield');
  w4.flames.push({ cells: [[5, 5]], t: 0.4, total: 0.4 });
  R.updateDamage(w4, 1 / 60);
  ok(w4.players[0].alive === true, '有护盾时被炸不死');
  ok(w4.players[0].shield === 0, '护盾碎掉了');

  // 无敌帧保护
  const w5 = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
  w5.players[0].invuln = 1.0;
  w5.flames.push({ cells: [[5, 5]], t: 0.4, total: 0.4 });
  R.updateDamage(w5, 1 / 60);
  ok(w5.players[0].alive === true, '无敌帧内不会被二次伤害');
}

/* ============================================================
 * 8. 踢弹
 * ============================================================ */
group('8. 踢弹：炸弹沿方向滑行，撞到障碍停下');
{
  const map = emptyMap();
  map[G.idx(9, 5)] = T.HARD;
  const p = makePlayer('p1', 5, 5);
  p.kick = true;
  const w = makeWorld(map, [p]);

  R.tryPlaceBomb(w, p);
  const bomb = w.bombs[0];
  bomb.freeFor = null;

  // 站到炸弹左边，往右踢
  p.x = G.centerX(5) - 32;
  ok(MO.kickCheck(w, p, 1, 0) === true, '撞到炸弹触发了踢弹');
  ok(bomb.slide && bomb.slide.dc === 1, '滑行方向正确');

  for (let i = 0; i < 300; i++) R.updateBombs(w, 1 / 60);
  ok(bomb.slide === null, '滑行在某一刻停下来了');
  // 从 (5,5) 一直滑到硬墙 (9,5) 前面 = (8,5)
  ok(bomb.cx === 8 && bomb.cy === 5, '停在硬墙前一格 (8,5)', `实际停在 (${bomb.cx},${bomb.cy})`);
}

/* ============================================================
 * 9. 固定步长一致性（不同帧率下速度必须一致）
 * ============================================================ */
group('9. 固定步长：同样的逻辑步数走同样的距离');
{
  function walk(steps) {
    const p = makePlayer('p1', 2, 5);
    const w = makeWorld(emptyMap(), [p]);
    const x0 = p.x;
    for (let i = 0; i < steps; i++) MO.step(w, p, 1, 0, 1 / 60);
    return p.x - x0;
  }
  const a = walk(30), b = walk(60);
  ok(Math.abs(b - a * 2) < 1e-6, '60 步的距离正好是 30 步的 2 倍（时间可加）',
     `${a.toFixed(4)} vs ${b.toFixed(4)}`);
  const expect = CFG.SPEED_BASE * CFG.TILE * 0.5;
  ok(Math.abs(a - expect) < 0.5, `30 步走了半秒的距离 ≈ ${expect.toFixed(1)}px`, `实际 ${a.toFixed(2)}px`);
}

/* ============================================================
 * 10. 胜负判定（计时拆砖）
 * ============================================================ */
group('10. 胜负判定 · 单人计时拆砖');
{
  const MA = BI.match;

  function digWorld() {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
    w.mode = 'dig';
    w.match = MA.create('dig');
    MA.beginRound(w);
    return w;
  }

  // ① 炸光所有软砖 -> 胜
  {
    const w = digWorld();
    w.map[G.idx(3, 3)] = T.BRICK;
    w.map[G.idx(4, 3)] = T.BRICK;
    MA.beginRound(w);
    ok(w.match.startBricks === 2, '开局记下了软砖数（2 块）', String(w.match.startBricks));
    MA.update(w, 1 / 60);
    ok(!w.match.over, '还有软砖时比赛没结束');
    w.map[G.idx(3, 3)] = T.EMPTY;
    MA.update(w, 1 / 60);
    ok(!w.match.over, '还剩 1 块时也没结束');
    w.map[G.idx(4, 3)] = T.EMPTY;
    const justEnded = MA.update(w, 1 / 60);
    ok(justEnded === true, '最后一块拆完的那一刻返回「刚结束」');
    ok(w.match.over && w.match.winner === 'p1', '玩家获胜', w.match.winner);
    ok(w.match.title==='挑战完成', '挑战完成标题统一', w.match.title);
  }

  // ② 时间耗尽 -> 负
  {
    const w = digWorld();
    w.map[G.idx(3, 3)] = T.BRICK;
    MA.beginRound(w);
    MA.update(w, w.match.timeLimit - 0.5);
    ok(!w.match.over, '时间还剩 0.5 秒时没结束');
    MA.update(w, 1.0);
    ok(w.match.over && w.match.winner === 'p2', '时间到判负', w.match.winner);
    ok(w.match.remaining === 0, '倒计时不会变成负数', String(w.match.remaining));
    ok(w.match.subtitle==='剩余障碍 1', '副标题报出剩余障碍数', w.match.subtitle);
  }

  // ③ 命用光 -> 负
  {
    const w = digWorld();
    w.map[G.idx(3, 3)] = T.BRICK;      // 留一块砖，否则「拆完即胜」会先触发
    MA.beginRound(w);
    w.players[0].lives = 0;
    MA.update(w, 1 / 60);
    ok(w.match.over && w.match.winner === 'p2', '命用光判负', String(w.match.winner));
  }

  // ④ 结算数据
  {
    const w = digWorld();
    w.map[G.idx(3, 3)] = T.BRICK;
    MA.beginRound(w);
    w.map[G.idx(3, 3)] = T.EMPTY;
    w.stats.explosions = 7;
    MA.update(w, 2.5);
    const s = MA.summary(w);
    ok(s.mode === 'dig', '结算数据带上模式');
    ok(s.startBricks === 1 && s.bricksCleared === 1, '结算数据算对了拆除数',
       `start=${s.startBricks} cleared=${s.bricksCleared}`);
    ok(s.explosions === 7, '结算数据带上爆炸次数');
    ok(s.players.length === 1, '结算数据带上一名玩家');
  }
}

/* ============================================================
 * 11. 胜负判定（双人对战）
 * ============================================================ */
group('11. 胜负判定 · 双人同屏对战');
{
  const MA = BI.match;

  function vsWorld() {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1), makePlayer('p2', 13, 11)]);
    w.mode = 'versus';
    w.match = MA.create('versus');
    MA.beginRound(w);
    return w;
  }
  /** 登记一次死亡并结算（死亡是入队的，必须走一帧 update 才会计分） */
  function kill(w, p) { MA.onDeath(w, p); MA.update(w, 1 / 60); }

  // ① 一方阵亡 -> 对手得分
  {
    const w = vsWorld();
    kill(w, w.players[0]);
    ok(w.match.scores.p2 === 1, '1P 阵亡后 2P 得 1 分', JSON.stringify(w.match.scores));
    ok(w.match.scores.p1 === 0, '1P 没得分');
    ok(!w.match.over, '才 1 分，比赛还没结束');
    ok(w.match.roundEndsAt > 0, '进入回合间隔');
    ok(MA.canRespawn(w, w.players[0]) === false, '回合间隔内不重生');
  }

  // ② 先得 2 分者胜
  {
    const w = vsWorld();
    kill(w, w.players[0]);                // 2P 得 1
    w.match.roundEndsAt = 0;              // 跳过间隔
    kill(w, w.players[0]);                // 2P 得 2
    ok(w.match.over === true, '拿到第 2 分后比赛结束');
    ok(w.match.winner === 'p2', '2P 获胜', String(w.match.winner));
    ok(w.match.scores.p2 === CFG.VERSUS_TARGET, '比分达到目标分', String(w.match.scores.p2));
    ok(/2P/.test(w.match.title) && /获胜/.test(w.match.title), '标题文案正确', w.match.title);
    ok(/1 : 2|0 : 2/.test(w.match.subtitle), '副标题报出比分', w.match.subtitle);
  }

  // ③ 回合间隔结束后自动开新回合
  {
    const w = vsWorld();
    let newRound = 0;
    w.onNewRound = function () { newRound++; };
    MA.onDeath(w, w.players[0]);
    MA.update(w, 1 / 60);                 // 结算 -> 设置 roundEndsAt
    const until = w.match.roundEndsAt;
    ok(until > 0, '回合间隔时间被设置', String(until));
    w.time = until - 0.1;
    MA.update(w, 1 / 60);
    ok(newRound === 0, '时间没到不开新回合');
    w.time = until + 0.1;
    MA.update(w, 1 / 60);
    ok(newRound === 1, '时间到了触发开新回合', String(newRound));
    ok(w.match.roundEndsAt === 0, '间隔标记被清掉');
  }

  // ④ 超时进入「死亡加速」：软砖全清
  {
    const w = vsWorld();
    for (let i = 0; i < 30; i++) w.map[i] = T.BRICK;
    let sudden = 0;
    w.onSuddenDeath = function () { sudden++; };
    MA.update(w, w.match.timeLimit + 0.1);
    ok(w.match.sudden === true, '进入了死亡加速阶段');
    ok(sudden === 1, '触发了加速回调');
    ok(MA.countBricks(w.map) === 0, '软砖被全部清空', String(MA.countBricks(w.map)));
    ok(!w.match.over, '加速阶段还没结束比赛');
  }

  // ⑤ 加速阶段也没分出胜负 -> 平局，双方各加一分
  {
    const w = vsWorld();
    MA.update(w, w.match.timeLimit + 0.1);
    MA.update(w, CFG.VERSUS_SUDDEN_TIME + 0.1);
    ok(w.match.over && w.match.winner === 'draw', '判平局', String(w.match.winner));
    ok(w.match.scores.p1 === 1 && w.match.scores.p2 === 1, '双方各加 1 分',
       JSON.stringify(w.match.scores));
  }

  // ⑥ 比赛结束后不再接受新的死亡结算
  {
    const w = vsWorld();
    kill(w, w.players[0]);
    w.match.roundEndsAt = 0;
    kill(w, w.players[0]);
    const after = JSON.stringify(w.match.scores);
    MA.onDeath(w, w.players[1]);           // 结束后又来一次
    MA.update(w, 1 / 60);
    ok(JSON.stringify(w.match.scores) === after, '比赛结束后死亡不再计分',
       after + ' -> ' + JSON.stringify(w.match.scores));
    ok(MA.canRespawn(w, w.players[0]) === false, '比赛结束后不重生');
  }

  // ⑦ 同一帧双方都被炸死 -> 两边各得 1 分（设计方案 §4.7 的平局处理）
  {
    const w = vsWorld();
    // 两颗炸弹分别放在两人脚下，同时引爆 -> updateDamage 在同一帧干掉两人
    w.flames.push({ cells: [[1, 1]], t: 0.4, total: 0.4 });
    w.flames.push({ cells: [[13, 11]], t: 0.4, total: 0.4 });
    R.updateDamage(w, 1 / 60);
    ok(w.players[0].alive === false && w.players[1].alive === false, '同一帧两人都被炸死');
    MA.update(w, 1 / 60);
    ok(w.match.scores.p1 === 1 && w.match.scores.p2 === 1, '双方各得 1 分（同帧双死不漏算）',
       JSON.stringify(w.match.scores));
    ok(!w.match.over, '各得 1 分后比赛继续（还没到目标分）');
  }

  // ⑧ 同时双死且双方都到目标分 -> 平局
  {
    const w = vsWorld();
    w.match.scores.p1 = 1;
    w.match.scores.p2 = 1;
    w.flames.push({ cells: [[1, 1]], t: 0.4, total: 0.4 });
    w.flames.push({ cells: [[13, 11]], t: 0.4, total: 0.4 });
    R.updateDamage(w, 1 / 60);
    MA.update(w, 1 / 60);
    ok(w.match.scores.p1 === 2 && w.match.scores.p2 === 2, '双方都到 2 分',
       JSON.stringify(w.match.scores));
    ok(w.match.over === true, '比赛结束');
    ok(w.match.winner === 'draw', '同帧双死且都够分 -> 判平局', String(w.match.winner));
    ok(/平局/.test(w.match.title), '标题是「平局」', w.match.title);
  }
}

/* ============================================================
 * 12. 威胁图（敌人 AI 的眼睛）
 * ============================================================ */
group('12. 威胁图：谁会挨炸、还有多久');
{
  const DG = BI.danger;

  // ① 炸弹十字范围
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    w.bombs.push({ cx: 5, cy: 5, power: 2, fuse: 2.0, ownerId: 'p1', freeFor: null });
    DG.compute(w);
    ok(Math.abs(DG.at(w, 5, 5) - 2.0) < 1e-6, '炸弹格自身的引信时间', String(DG.at(w, 5, 5)));
    ok(Math.abs(DG.at(w, 7, 5) - 2.0) < 1e-6, '火力 2 能覆盖到 2 格外');
    ok(DG.at(w, 8, 5) === 0, '火力 2 覆盖不到第 3 格');
    ok(DG.at(w, 5, 3) === 2, '上下方向也覆盖');
    ok(DG.at(w, 4, 4) === 0, '斜角不受影响');
  }

  // ② 硬墙挡火
  {
    const map = emptyMap();
    map[G.idx(7, 5)] = T.HARD;
    const w = makeWorld(map, [makePlayer('p1', 1, 1)]);
    w.bombs.push({ cx: 5, cy: 5, power: 3, fuse: 2.0, ownerId: 'p1', freeFor: null });
    DG.compute(w);
    ok(DG.at(w, 6, 5) === 2, '硬墙前仍有威胁');
    ok(DG.at(w, 7, 5) === 0, '硬墙自身没威胁');
    ok(DG.at(w, 8, 5) === 0, '硬墙后面安全');
  }

  // ③ 软砖吸火：砖本身会被炸到，后面的格子烧不到
  {
    const map = emptyMap();
    map[G.idx(7, 5)] = T.BRICK;
    const w = makeWorld(map, [makePlayer('p1', 1, 1)]);
    w.bombs.push({ cx: 5, cy: 5, power: 3, fuse: 2.0, ownerId: 'p1', freeFor: null });
    DG.compute(w);
    ok(DG.at(w, 7, 5) === 2, '软砖那块会被炸到');
    ok(DG.at(w, 8, 5) === 0, '软砖后面的格子炸不到');
  }

  // ④ 正在燃烧的格子是立刻致命
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    w.flames.push({ cells: [[3, 3]], t: 0.4, total: 0.4 });
    DG.compute(w);
    ok(DG.at(w, 3, 3) === -1, '正在燃烧的格子标成 -1（立刻致命）');
  }

  // ⑤ isHot 的安全余量
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    w.bombs.push({ cx: 5, cy: 5, power: 1, fuse: 0.3, ownerId: 'p1', freeFor: null });
    DG.compute(w);
    ok(DG.isHot(w, 5, 5) === true, '还剩 0.3 秒就炸 -> 危险');
    w.bombs[0].fuse = 2.0;
    DG.compute(w);
    ok(DG.isHot(w, 5, 5) === false, '还剩 2 秒 -> 暂时不算危险（有余量）');
    ok(DG.isHot(w, 5, 5, 3.0) === true, '把安全余量调到 3 秒 -> 又算危险');
  }

  // ⑥ 多颗炸弹时取「最危险」的那个
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    w.bombs.push({ cx: 5, cy: 5, power: 1, fuse: 2.0, ownerId: 'p1', freeFor: null });
    DG.compute(w);
    ok(Math.abs(DG.at(w, 5, 5) - 2.0) < 1e-6, '第一颗炸弹 2.0 秒');
    w.bombs.push({ cx: 5, cy: 5, power: 1, fuse: 0.5, ownerId: 'p2', freeFor: null });
    DG.compute(w);
    ok(Math.abs(DG.at(w, 5, 5) - 0.5) < 1e-6, '同一格再来一颗更急的，取更短的引信',
       String(DG.at(w, 5, 5)));
  }
}

/* ============================================================
 * 13. 敌人 AI
 * ============================================================ */
group('13. 敌人 AI：走位 / 躲炸弹 / 追人 / 放弹');
{
  const DG = BI.danger, AI = BI.ai, EN = BI.entities;

  // ① 敌人在格子之间平滑移动，不会走歪
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    const e = EN.create('gugu', 5, 5, 1);
    w.enemies.push(e);
    AI.wake(w, e);
    ok(!!e.dir, '敌人一开始就有方向（不会站着不动）');
    const x0 = e.x, y0 = e.y;
    runAI(w, 0.5);
    ok(e.x !== x0 || e.y !== y0, '敌人确实动了',
       `(${x0.toFixed(1)},${y0.toFixed(1)}) -> (${e.x.toFixed(1)},${e.y.toFixed(1)})`);
    ok(G.canStand(w.map, w.bombs, e.x, e.y, CFG.ENEMY_BOX, 'nobody'),
       '敌人没有卡进墙里');
    // 永远在格线上：要么 x 对齐，要么 y 对齐
    const onLane = Math.abs(e.x - G.laneX(e.x)) < 0.01 || Math.abs(e.y - G.laneY(e.y)) < 0.01;
    ok(onLane, '敌人始终走在格子中线上（格子锁定移动）',
       `x=${e.x.toFixed(2)} y=${e.y.toFixed(2)}`);
  }

  // ② 躲炸弹：不会踏进危险格
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    const e = EN.create('gugu', 5, 5, 1);
    w.enemies.push(e);
    e.x = G.centerX(5); e.y = G.centerY(5);
    // 炸弹在正上方 2 格：威胁覆盖 (5,3) 和 (5,4)，但 (5,5) 自己安全
    w.bombs.push({ cx: 5, cy: 3, power: 1, fuse: 2.0, ownerId: 'p1', freeFor: null });
    DG.compute(w);
    ok(DG.at(w, 5, 4) > 0, '1P 上方那格确实有威胁', String(DG.at(w, 5, 4)));

    let stepped = 0;
    for (let i = 0; i < 40; i++) {
      AI.decide(w, e);
      if (!AI.safeDuring(DG.timeline(w), e.tc, e.tr, 0, 1 / e.speed + .18)) stepped++;
      e.x = G.centerX(e.tc); e.y = G.centerY(e.tr);   // 假装走过去了
    }
    ok(stepped === 0, '40 次决策里一次都没往危险格走', '踏进危险格 ' + stepped + ' 次');
  }

  // ③ 已经站在危险里就往安全处跑
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    const e = EN.create('gugu', 5, 5, 1);
    w.enemies.push(e);
    e.x = G.centerX(5); e.y = G.centerY(5);
    // 炸弹放在右边两格、火力 2：威胁向右覆盖到 (5,5)，
    // 但左边 (4,5) 和上下 (5,4)/(5,6) 都是安全的 —— 有活路
    w.bombs.push({ cx: 7, cy: 5, power: 2, fuse: 0.3, ownerId: 'p1', freeFor: null });
    DG.compute(w);
    ok(DG.isHot(w, 5, 5) === true, '敌人脚下确实是危险的', String(DG.at(w, 5, 5)));
    ok(!DG.isHot(w, 4, 5), '左边那格是安全的（有活路）', String(DG.at(w, 4, 5)));
    AI.decide(w, e);
    ok(!DG.isHot(w, e.tc, e.tr), '敌人选了安全格逃跑',
       `跑向 (${e.tc},${e.tr})，威胁值 ${DG.at(w, e.tc, e.tr)}`);
  }

  // ③-b 四面都被自己那颗炸弹覆盖时，挑「剩余时间最多」的格，不乱撞
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    const e = EN.create('gugu', 5, 5, 1);
    w.enemies.push(e);
    e.x = G.centerX(5); e.y = G.centerY(5);
    // 火力 1 的炸弹就在脚下：十字覆盖，没有一格是安全的
    w.bombs.push({ cx: 5, cy: 5, power: 1, fuse: 0.3, ownerId: 'p1', freeFor: null });
    DG.compute(w);
    let safeCount = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const d of dirs) if (!DG.isHot(w, 5 + d[0], 5 + d[1])) safeCount++;
    ok(safeCount === 0, '这一局确实四面楚歌（构造正确）', String(safeCount));

    AI.decide(w, e);
    ok(e.tc !== undefined, '依然选出了一格（不会卡死不动）');
    ok(!DG.isHot(w, e.tc, e.tr, 0.29) || DG.at(w, e.tc, e.tr) >= 0.3,
       '选的是剩余时间最多的那格', String(DG.at(w, e.tc, e.tr)));
  }

  // ④ 克劳德德会缩短与玩家的距离
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    const e = EN.create('claude', 12, 10, 1);
    w.enemies.push(e);
    AI.wake(w, e);
    const d0 = Math.abs(G.col(e.x) - 1) + Math.abs(G.row(e.y) - 1);
    runAI(w, 3.0);
    const d1 = Math.abs(G.col(e.x) - 1) + Math.abs(G.row(e.y) - 1);
    ok(d1 < d0, '3 秒后离玩家更近了', d0 + ' -> ' + d1 + ' 格');
  }

  // ⑤ 克劳德德用的是 BFS 距离场，会绕过墙而不是撞上去
  {
    const rows = [];
    for (let r = 0; r < CFG.ROWS; r++) {
      let s = '';
      for (let c = 0; c < CFG.COLS; c++) {
        // 在第 7 列竖一道墙，只留第 3 行一个缺口
        if (r === 0 || c === 0 || r === CFG.ROWS - 1 || c === CFG.COLS - 1) s += '#';
        else if (c === 7 && r !== 3) s += '#';
        else s += '.';
      }
      rows.push(s);
    }
    const map = artMap(rows);
    const w = makeWorld(map, [makePlayer('p1', 2, 6)]);
    const e = EN.create('claude', 12, 6, 1);
    w.enemies.push(e);
    AI.wake(w, e);

    const field = AI.buildField(w, 2, 6);
    ok(field[6 * CFG.COLS + 12] > 0, '距离场算得出从玩家到敌人的步数',
       String(field[6 * CFG.COLS + 12]));

    runAI(w, 4.0);
    ok(e.x > G.centerX(7) || Math.abs(G.row(e.y) - 3) <= 1,
       '克劳德德朝墙上的缺口绕行（没有卡在墙边）',
       `位置 col=${G.col(e.x)} row=${G.row(e.y)}`);
  }

  // ⑥ 偶喷诶艾会在合适距离放炸弹，并往后撤
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
    const e = EN.create('oupao', 5, 7, 1);      // 距玩家 2 格
    w.enemies.push(e);
    e.bombCd = 0;
    AI.decide(w, e);
    ok(e.windup > 0 && w.bombs.length === 0, '投弹前先给预警');
    runAI(w, .72);
    ok(w.bombs.length === 1, '偶喷诶艾放了一颗炸弹', String(w.bombs.length));
    if (w.bombs.length) {
      const b = w.bombs[0];
      ok(b.cx === 5 && b.cy === 7, '炸弹放在它自己那一格', `(${b.cx},${b.cy})`);
      ok(b.byEnemy === true, '标记成敌人放的');
      ok(b.fuse > CFG.FUSE, '敌人炸弹引信更长，给玩家反应时间',
         b.fuse.toFixed(1) + ' vs ' + CFG.FUSE);
      ok(b.ownerId === e.id, '归属正确');
    }
    // 放完应该朝反方向撤，而不是继续贴脸
    const away = Math.abs(e.tc - 5) + Math.abs(e.tr - 5);
    ok(away > 2, '放完弹朝远离玩家的方向撤', `撤到 (${e.tc},${e.tr})，距玩家 ${away}`);
  }

  // ⑦ 偶喷诶艾距离不对时不会乱放
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    const e = EN.create('oupao', 13, 11, 1);    // 离得很远
    w.enemies.push(e);
    e.bombCd = 0;
    AI.decide(w, e);
    ok(w.bombs.length === 0, '离太远就不放弹', String(w.bombs.length));
  }

  // ⑧ 敌人不会穿墙
  {
    const map = emptyMap();
    map[G.idx(6, 5)] = T.HARD;
    const w = makeWorld(map, [makePlayer('p1', 1, 1)]);
    const e = EN.create('claude', 5, 5, 1);
    w.enemies.push(e);
    AI.wake(w, e);
    for (let i = 0; i < 240; i++) {
      w.time += 1 / 60;
      DG.compute(w);
      AI.updateEnemy(w, e, 1 / 60);
      if (G.at(w.map, G.col(e.x), G.row(e.y)) === T.HARD) break;
    }
    ok(G.at(w.map, G.col(e.x), G.row(e.y)) !== T.HARD, '敌人从没穿进硬墙',
       `col=${G.col(e.x)} row=${G.row(e.y)}`);
  }

  // ⑨ 数量与速度随关卡上升，但有上限
  {
    ok(EN.countFor(1) === 2 && EN.countFor(3) === 3, '第 1 关 2 只、第 3 关 3 只',
       EN.countFor(1) + ' / ' + EN.countFor(3));
    ok(EN.countFor(21) === 5 && EN.countFor(5) === 3 && EN.countFor(20) === 5, '普通关最多五只，第五关 BOSS 带两只随从，后期最多四只随从', String(EN.countFor(20)));
    ok(EN.speedScale(1) === 1, '第 1 关速度系数为 1');
    ok(EN.speedScale(2) > 1, '第 2 关变快');
    ok(EN.speedScale(50) <= 1.45, '速度系数有上限', String(EN.speedScale(50)));
  }

  // ⑩ 敌人出生点离玩家足够远
  {
    const rng = BI.makeRng(777);
    const lvl = BI.levelgen.generate(rng, {
      mode: 'adventure', spawns: [[1, 1], [CFG.COLS - 2, CFG.ROWS - 2]]
    });
    const w = makeWorld(lvl.map, [makePlayer('p1', 1, 1)]);
    const made = EN.spawn(w, 8, 1, rng);
    ok(made > 0, '撒出了敌人', String(made) + ' 只');
    let tooClose = 0;
    for (const e of w.enemies) {
      const d = Math.abs(G.col(e.x) - 1) + Math.abs(G.row(e.y) - 1);
      if (d < 6) tooClose++;
    }
    ok(tooClose === 0, '没有敌人刷在玩家身边 6 格内', tooClose + ' 只太近');
  }
}

/* ============================================================
 * 14. 敌人伤害与闯关胜负
 * ============================================================ */
group('14. 敌人伤害 / 闯关模式胜负');
{
  const MA = BI.match, EN = BI.entities, DG = BI.danger;

  function advWorld(map) {
    const w = makeWorld(map || emptyMap(), [makePlayer('p1', 1, 1)]);
    w.mode = 'adventure';
    w.match = MA.create('adventure');
    MA.beginRound(w);
    return w;
  }

  // ① 火烧死敌人
  {
    const w = advWorld();
    w.enemies.push(EN.create('gugu', 5, 5, 1));
    ok(MA.countEnemies(w) === 1, '场上有 1 只敌人');
    w.flames.push({ cells: [[5, 5]], t: 0.4, total: 0.4 });
    R.updateEnemies(w, 1 / 60);
    ok(w.enemies[0].alive === false, '谷谷歌歌被火烧死（1 血）');
    ok(w.stats.kills === 1, '击杀计数 +1', String(w.stats.kills));
    ok(MA.countEnemies(w) === 0, '存活数为 0');
  }

  // ② 多血敌人要打多次，且中间有无敌时间
  {
    const w = advWorld();
    w.enemies.push(EN.create('boss', 5, 5, 1));
    const boss = w.enemies[0];
    ok(boss.maxHp === 8, '鲁鲁旦有 8 点生命', String(boss.maxHp));
    w.flames.push({ cells: [[5, 5]], t: 0.4, total: 0.4 });
    R.updateEnemies(w, 1 / 60);
    ok(boss.hp === 7, '第一次烧到掉 1 血', String(boss.hp));
    R.updateEnemies(w, 1 / 60);
    ok(boss.hp === 7, '无敌时间内不会被连续扣血', String(boss.hp));
    R.updateEnemies(w, CFG.ENEMY_HIT_INVULN + 0.01);
    R.updateEnemies(w, 1 / 60);
    ok(boss.hp === 6, '无敌过后再掉 1 血', String(boss.hp));
    R.updateEnemies(w, CFG.ENEMY_HIT_INVULN + 0.01);
    R.updateEnemies(w, 1 / 60);
    for (let i = 0; i < 5; i++) { R.updateEnemies(w, CFG.ENEMY_HIT_INVULN + .01); R.updateEnemies(w, 1 / 60); }
    ok(boss.alive === false && w.stats.kills === 1, '第 8 次独立命中后击败鲁鲁旦，仅记一次击杀');
  }

  // ③ 玩家碰到敌人会死
  {
    const w = advWorld();
    const p = w.players[0];
    w.enemies.push(EN.create('gugu', G.col(p.x), G.row(p.y), 1));
    w.enemies[0].x = p.x; w.enemies[0].y = p.y;
    R.updateDamage(w, 1 / 60);
    ok(p.alive === true, '撞到 NPC 不会受伤');
    w.flames.length = 0;
  }

  // ④ 离得远就不会误判
  {
    const w = advWorld();
    const p = w.players[0];
    const e = EN.create('gugu', 12, 10, 1);
    w.enemies.push(e);
    R.updateDamage(w, 1 / 60);
    ok(p.alive, '远处敌人不会造成伤害');
  }

  // ⑤ 清光敌人 -> 过关 -> 进入下一关
  {
    const w = advWorld();
    let nextLevel = 0;
    w.onNextLevel = function () { nextLevel++; };
    ok(w.match.level === 1, '开局是第 1 关');
    MA.update(w, 1 / 60);
    ok(w.match.levelClearAt > 0, '没敌人时进入「清场等待」', String(w.match.levelClearAt));
    ok(nextLevel === 0, '等待期间还没进下一关');
    w.time = w.match.levelClearAt + 0.01;
    MA.update(w, 1 / 60);
    ok(w.match.level === 2, '进入第 2 关', String(w.match.level));
    ok(nextLevel === 1, '触发了进下一关的回调');
  }

  // ⑥ 还有敌人时不会过关
  {
    const w = advWorld();
    w.enemies.push(EN.create('gugu', 10, 10, 1));
    MA.update(w, 1 / 60);
    ok(w.match.levelClearAt === 0, '还有敌人就不算清场');
    ok(w.match.level === 1, '关卡数不变');
    ok(!w.match.over, '比赛继续');
  }

  // ⑦ 命用光 -> 结束
  {
    const w = advWorld();
    w.enemies.push(EN.create('gugu', 10, 10, 1));
    w.players[0].lives = 0;
    MA.onDeath(w, w.players[0]);
    MA.update(w, 1 / 60);
    ok(w.match.over === true, '命用光比赛结束');
    ok(w.match.winner === 'p2', '判负', String(w.match.winner));
    ok(/第 1 关/.test(w.match.subtitle), '副标题报出闯到的关卡', w.match.subtitle);
  }

  // ⑧ 结算数据带上关卡
  {
    const w = advWorld();
    w.match.level = 4;
    const s = MA.summary(w);
    ok(s.level === 4, '结算数据有关卡数', String(s.level));
    ok(s.enemiesLeft === 0, '结算数据有剩余敌人数');
    ok(s.mode === 'adventure', '结算数据标明是闯关模式');
  }

  // ⑨ 打死敌人有概率掉道具
  {
    const rng = BI.makeRng(4242);
    let drops = 0, trials = 200;
    for (let i = 0; i < trials; i++) {
      const w = advWorld();
      w.rng = rng;
      const e = EN.create('gugu', 5, 5, 1);
      w.enemies.push(e);
      w.flames.push({ cells: [[5, 5]], t: 0.4, total: 0.4 });
      R.updateEnemies(w, 1 / 60);
      if (w.items.length) drops++;
    }
    const rate = drops / trials;
    ok(rate > 0.3 && rate < 0.6, '掉落率落在合理区间（约 45%）',
       (rate * 100).toFixed(0) + '%');
  }
}

/* ============================================================
 * 15. 页面装配一致性
 *
 * 这个测试是被坑出来的：index.html / tests/browser.html /
 * tools/showcase.html 各自手写了一份 <script> 清单，
 * 加新模块时很容易漏掉某一个 —— 漏了不会在加载时报错，
 * 而是运行到一半才炸「Cannot read properties of undefined」。
 * 这里直接比对三份清单，把这类漂移挡在提交之前。
 * ============================================================ */
group('15. 页面装配：三份 HTML 的模块清单必须一致');
{
  const fsx = require('fs');
  const ROOTD = path.join(__dirname, '..');

  const pages = [
    'index.html',
    'tests/browser.html',
    'tools/showcase.html'
  ];

  function scriptsOf(file) {
    const html = fsx.readFileSync(path.join(ROOTD, file), 'utf8');
    const out = [];
    const re = /<script\s+src="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      // 归一化：把 ../ 之类的前缀去掉，只留下 src/... 或 assets/...
      let s = m[1].replace(/^(\.\.\/)+/, '');
      out.push(s);
    }
    return out;
  }

  // 磁盘上真实存在的源文件清单
  const actual = [];
  (function walk(dir) {
    for (const e of fsx.readdirSync(path.join(ROOTD, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) actual.push(rel);
    }
  })('src');
  actual.push('assets/characters.js');
  actual.sort();

  for (const page of pages) {
    const list = scriptsOf(page);
    const missing = actual.filter(f => list.indexOf(f) < 0);
    ok(missing.length === 0, page + ' 加载了全部 ' + actual.length + ' 个模块',
       missing.length ? ('缺少: ' + missing.join(', ')) : '');
  }

  // 加载顺序：被依赖的必须先加载
  const ORDER = [
    'assets/characters.js',
    'src/core/config.js',
    'src/core/rng.js',
    'src/core/input.js',
    'src/game/grid.js',
    'src/game/levelgen.js',
    'src/game/motion.js',
    'src/game/rules.js',
    'src/game/danger.js',
    'src/game/entities.js',
    'src/game/ai.js',
    'src/game/match.js',
    'src/render/draw.js',
    'src/render/assets.js',
    'src/render/effects.js',
    'src/render/sprites.js',
    'src/render/hud.js',
    'src/audio/sfx.js',
    'src/audio/music.js',
    'src/scenes/menu.js',
    'src/scenes/pause.js',
    'src/scenes/result.js',
    'src/main.js'
  ];

  for (const page of pages) {
    const list = scriptsOf(page).filter(s => ORDER.indexOf(s) >= 0);
    let ordered = true, why = '';
    for (let i = 1; i < list.length; i++) {
      if (ORDER.indexOf(list[i]) < ORDER.indexOf(list[i - 1])) {
        ordered = false;
        why = list[i - 1] + ' 应排在 ' + list[i] + ' 之后';
        break;
      }
    }
    ok(ordered, page + ' 的模块加载顺序正确', why);
  }

  ok(ORDER.length === actual.length, '顺序表覆盖了全部模块（加新文件时记得同步这里）',
     'ORDER=' + ORDER.length + ' 实际=' + actual.length);

  /* ---- 中文编码自检 ----
     这条是被坑出来的：用 PowerShell 的 Get-Content/Set-Content 往返一次
     带中文的 UTF-8 文件，中文会整片变成乱码（"键位表" -> "閿綅琛"）。
     代码本身是 ASCII 所以语法检查发现不了，跑起来才发现所有提示都花了。
     这里直接扫源文件里有没有典型的乱码字节序列。 */
  const MOJIBAKE = [
    '\uFFFD',                    // 替换字符：编码转换失败的典型痕迹
    '閿', '鍦', '鏀', '锛', '浣',  // 常见 UTF-8 被当 GBK 解读后的字
    '锟斤拷'
  ];
  const textFiles = [];
  function collectText(dir) {
    for (const e of fsx.readdirSync(path.join(ROOTD, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) collectText(rel);
      else if (/\.(js|html|md)$/.test(e.name)) textFiles.push(rel);
    }
  }
  collectText('src');
  collectText('tests');
  collectText('tools');
  collectText('docs');
  textFiles.push('index.html');

  let corrupted = [];
  for (const f of textFiles) {
    const txt = fsx.readFileSync(path.join(ROOTD, f), 'utf8');
    // 检查器自己就写着这些乱码样本，对它只做 U+FFFD 检查，否则会自己举报自己
    const patterns = (f === 'tests/headless.js') ? ['\uFFFD'] : MOJIBAKE;
    for (const bad of patterns) {
      if (txt.indexOf(bad) >= 0) { corrupted.push(f); break; }
    }
  }
  ok(corrupted.length === 0, textFiles.length + ' 个文本文件的中文都没有乱码',
     corrupted.length ? ('乱码: ' + corrupted.join(', ')) : '');

  // 反向确认：源文件里确实有中文（防止检查本身失效）
  const sample = fsx.readFileSync(path.join(ROOTD, 'src/core/input.js'), 'utf8');
  ok(/键位映射/.test(sample), '抽查 input.js，中文确实存在（检查本身有效）');

  /* ---- 对象字面量重复键自检 ----
     也是被坑出来的：JS 里重复键**不是语法错误**，后者静默覆盖前者，
     node --check 查不出来、跑起来也不报错，只是行为悄悄不对。
     我就在 world 字面量里写了两个 burnItems，导致「爆炸烧道具」整条功能是死的，
     而当时 332 项测试全绿 —— 因为测试自己造世界，没走真实代码。 */
  function findDupKeys(src) {
    // 粗暴抠掉字符串与注释；够用，不追求通用
    let s = '', i = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') {
        const q = c; i++;
        while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        i++; s += '""'; continue;
      }
      s += c; i++;
    }
    const stack = [{}];
    const dups = [];
    let prev = '';
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === '{') { stack.push({}); prev = '{'; continue; }
      if (c === '}') { if (stack.length > 1) stack.pop(); prev = '}'; continue; }
      if (/[A-Za-z_$]/.test(c)) {
        let j = k;
        while (j < s.length && /[\w$]/.test(s[j])) j++;
        const word = s.slice(k, j);
        let m = j;
        while (m < s.length && /\s/.test(s[m])) m++;
        if (s[m] === ':' && (prev === '{' || prev === ',')) {
          const scope = stack[stack.length - 1];
          const line = s.slice(0, k).split('\n').length;
          if (scope[word]) dups.push(`${word}（${scope[word]} 行 与 ${line} 行）`);
          else scope[word] = line;
        }
        k = j - 1; prev = word; continue;
      }
      if (!/\s/.test(c)) prev = c;
    }
    return dups;
  }

  const dupFiles = [];
  for (const f of textFiles) {
    if (!f.endsWith('.js')) continue;
    const d = findDupKeys(fsx.readFileSync(path.join(ROOTD, f), 'utf8'));
    if (d.length) dupFiles.push(f + ': ' + d.join(', '));
  }
  ok(dupFiles.length === 0, '所有源文件都没有「对象字面量重复键」',
     dupFiles.join(' | '));

  // 反向确认：检查器真的能抓到重复键
  ok(findDupKeys('var o = { a: 1, a: 2 };').length === 1,
     '重复键检查器本身有效（能抓到 {a:1,a:2}）');
}

/* ============================================================
 * 16. 特效系统（粒子 / 震屏 / 飘字）
 * ============================================================ */
group('16. 特效：粒子生命周期 / 震屏衰减 / 飘字');
{
  const FX = BI.fx;

  // ① 炸开一簇粒子
  {
    FX.reset();
    FX.setRng(BI.makeRng(99));
    ok(FX.particles.length === 0, '重置后没有粒子');
    FX.burst(100, 100, { count: 12, speed: 100, life: 0.5 });
    ok(FX.particles.length === 12, '爆出 12 个粒子', String(FX.particles.length));
    const p = FX.particles[0];
    // 寿命在 ±35% 内随机，看起来才自然，不会整簇同时消失
    ok(p.t >= 0.5 * 0.65 - 1e-9 && p.t <= 0.5 * 1.35 + 1e-9,
       '粒子寿命在设定值的 ±35% 内', p.t.toFixed(3));
    ok(Math.abs(p.t - p.total) < 1e-9, '初始剩余寿命等于总寿命');
    let varied = false;
    for (const q of FX.particles) if (Math.abs(q.t - p.t) > 1e-6) { varied = true; break; }
    ok(varied, '同一簇里各粒子寿命不完全相同（不会整簇同时消失）');
  }

  // ② 粒子会随时间消亡，不会无限堆积
  {
    FX.reset();
    FX.setRng(BI.makeRng(7));
    FX.burst(0, 0, { count: 20, life: 0.3 });
    for (let i = 0; i < 30; i++) FX.update(1 / 60);      // 0.5 秒
    ok(FX.particles.length === 0, '寿命过后粒子全部清空', String(FX.particles.length));
  }

  // ③ 重力把粒子往下拉
  {
    FX.reset();
    FX.setRng(BI.makeRng(3));
    FX.burst(100, 100, { count: 1, speed: 0, lift: 0, gravity: 300, life: 1.0 });
    const p = FX.particles[0];
    const y0 = p.y;
    for (let i = 0; i < 30; i++) FX.update(1 / 60);
    ok(p.y > y0, '粒子在重力作用下往下掉', `${y0.toFixed(1)} -> ${p.y.toFixed(1)}`);
  }

  // ④ 震屏：取较大值、会衰减到 0、偏移跟着变
  {
    FX.reset();
    FX.setRng(BI.makeRng(11));
    ok(FX.shake === 0, '初始没有震屏');
    FX.shakeIt(5);
    ok(FX.shake === 5, '震屏强度设置成功', String(FX.shake));
    FX.shakeIt(3);
    ok(FX.shake === 5, '更小的强度不会覆盖更大的（不叠加）', String(FX.shake));
    FX.shakeIt(100);
    ok(FX.shake <= FX.maxShake, '震屏有上限，不会晃瞎眼',
       FX.shake + ' <= ' + FX.maxShake);
    for (let i = 0; i < 60; i++) FX.update(1 / 60);
    ok(FX.shake === 0, '一秒后震屏归零', String(FX.shake));
    ok(FX.ox === 0 && FX.oy === 0, '震屏结束后偏移归零');
  }

  // ⑤ 震屏期间偏移不为 0
  {
    FX.reset();
    FX.setRng(BI.makeRng(21));
    FX.shakeIt(6);
    let moved = 0;
    for (let i = 0; i < 20; i++) {
      FX.update(1 / 60);
      if (FX.ox !== 0 || FX.oy !== 0) moved++;
    }
    ok(moved > 0, '震屏期间画面确实在抖', moved + '/20 帧有偏移');
  }

  // ⑥ 飘字：往上飘、会消失
  {
    FX.reset();
    FX.text(50, 50, '+1 火力', '#fff', { life: 0.5 });
    ok(FX.texts.length === 1, '生成了一个飘字');
    const t = FX.texts[0];
    const y0 = t.y;
    FX.update(0.1);
    ok(t.y < y0, '飘字往上飘', `${y0} -> ${t.y.toFixed(1)}`);
    ok(t.vy > -38 && t.vy < 0, '上升速度在衰减（越来越慢）', String(t.vy.toFixed(2)));
    for (let i = 0; i < 40; i++) FX.update(1 / 60);
    ok(FX.texts.length === 0, '寿命过后飘字消失');
  }

  // ⑦ 爆炸预设：粒子 + 震屏一起给
  {
    FX.reset();
    FX.setRng(BI.makeRng(31));
    FX.explosion(5, 5, [[5, 5], [6, 5], [4, 5]]);
    ok(FX.particles.length > 0, '爆炸产生了粒子', String(FX.particles.length));
    ok(FX.shake > 0, '爆炸带震屏', String(FX.shake));
    const px = FX.particles[0].x;
    ok(px > 5 * CFG.TILE && px < 6 * CFG.TILE, '粒子出现在炸弹那一格附近', px.toFixed(1));
  }

  // ⑧ 过关彩带
  {
    FX.reset();
    FX.setRng(BI.makeRng(41));
    FX.levelClear();
    ok(FX.particles.length >= 60, '过关撒了一大把彩带', String(FX.particles.length));
    ok(FX.texts.length === 1 && /过关/.test(FX.texts[0].str), '过关飘字正确',
       FX.texts[0] && FX.texts[0].str);
  }

  // ⑨ reset 清干净
  {
    FX.burst(0, 0, { count: 5 });
    FX.text(0, 0, 'x');
    FX.shakeIt(5);
    FX.reset();
    const s = FX.stats();
    ok(s.particles === 0 && s.texts === 0 && s.shake === 0, 'reset 清空一切',
       JSON.stringify(s));
  }
}

/* ============================================================
 * 17. 音效：没有音频环境时必须优雅降级
 *
 * Node 里没有 AudioContext，正好用来验证「音频不可用不能影响游戏」。
 * ============================================================ */
group('17. 音效：无音频环境下的降级');
{
  const SFX = BI.sfx;

  ok(typeof window.AudioContext === 'undefined',
     'Node 环境确实没有 AudioContext（这组测试的前提）');

  const unlocked = SFX.unlock();
  ok(unlocked === false, '没有音频环境时 unlock() 返回 false', String(unlocked));
  ok(SFX.failed === true, '标记为「音频不可用」，不会反复重试');
  ok(SFX.ready === false, 'ready 保持 false');

  // 所有音效都必须安静地什么都不做，绝不能抛异常
  const names = ['place', 'explode', 'enemyBomb', 'pickup', 'death', 'shieldBreak',
                 'enemyHit', 'enemyDie', 'levelClear', 'win', 'lose',
                 'menuMove', 'menuConfirm', 'pause', 'sudden', 'tick'];
  let threw = null;
  for (const n of names) {
    try { SFX.play(n); } catch (e) { threw = n + ': ' + e.message; break; }
  }
  ok(threw === null, '全部 ' + names.length + ' 个音效调用都不抛异常', threw || '');

  try { SFX.play('不存在的音效'); ok(true, '未知音效名也不抛异常'); }
  catch (e) { ok(false, '未知音效名不抛异常', e.message); }

  ok(typeof SFX.status() === 'string', 'status() 返回一段文字', SFX.status());
  ok(/不可用/.test(SFX.status()), '状态里说明了音频不可用', SFX.status());

  const before = SFX.enabled;
  SFX.toggle();
  ok(SFX.enabled === !before, '静音开关能切换', String(SFX.enabled));
  SFX.toggle();
  ok(SFX.enabled === before, '能切回来');

  // 再 unlock 一次也不该出事
  ok(SFX.unlock() === false, '重复 unlock 依然安全返回 false');
}

/* ============================================================
 * 17b. 背景音乐：三首曲子 + 场景映射 + 无音频环境下的降级
 *
 * Node 里既没有 document 也没有 Audio，正好验证「曲子文件 / 环境有问题
 * 也不能影响游戏运行」，同时把「场景 → 哪一首」这条映射钉死。
 * ============================================================ */
group('17b. 背景音乐：场景映射与无音频环境降级');
{
  const M = BI.music;

  ok(!!M, 'music.js 已经装载');
  ok(typeof window.Audio === 'undefined',
     'Node 环境确实没有 Audio（这组测试的前提）');

  // 三首曲子：菜单 / 关卡 / BOSS，缺一个都会导致某个场景没声
  const ids = Object.keys(M.tracks).sort();
  ok(ids.join(',') === 'boss,level,menu', '曲目表正好是 menu / level / boss 三首', ids.join(','));
  const files = ids.map(id => M.tracks[id].file);
  ok(files.every(f => /\.ogg$/.test(f)), '三首都是 .ogg 文件', files.join(' | '));
  ok(new Set(files).size === 3, '三首曲子指向三个不同文件');
  ok(files.every(f => f.indexOf('assets/audio/') === 0),
     '曲子放在 assets/audio/ 下，且路径相对项目根目录', files.join(' | '));
  // 文件名里有空格、括号、假名，最容易写错；直接查磁盘，写错立刻红
  const missing = files.filter(f => !fs.existsSync(path.join(ROOT, f)));
  ok(missing.length === 0, '三首曲子文件真的在磁盘上', missing.join(' | '));
  ok(files.every(f => fs.statSync(path.join(ROOT, f)).size > 10000),
     '三首曲子都不是空文件', files.map(f => fs.statSync(path.join(ROOT, f)).size).join(' / '));
  ok(M.tracks.menu.file.indexOf('天空之城') >= 0 &&
     M.tracks.level.file.indexOf('カノン') >= 0 &&
     M.tracks.boss.file.indexOf('欢乐斗地主') >= 0,
     '菜单=天空之城 / 关卡=カノン / BOSS=欢乐斗地主');

  // 场景 → 曲目
  ok(M.trackFor({ scene: 'menu' }) === 'menu', '开始界面放天空之城');
  ok(M.trackFor({ scene: 'playing', world: {}, bossBattle: false, bossAlive: false }) === 'level',
     '普通关卡放カノン');
  ok(M.trackFor({ scene: 'playing', world: {}, bossBattle: true, bossAlive: true }) === 'boss',
     'BOSS 战且鲁鲁旦还活着时放欢乐斗地主');
  ok(M.trackFor({ scene: 'playing', world: {}, bossBattle: true, bossAlive: false }) === 'level',
     '打死鲁鲁旦之后（哪怕小怪没清完）换回关卡曲，不再一直放斗地主');
  ok(M.trackFor({ scene: 'result', world: {}, bossBattle: false, bossAlive: false }) === 'level',
     '结算界面继续放刚才那首，不突然跳回菜单曲');
  ok(M.trackFor({ scene: 'result', world: {}, bossBattle: true, bossAlive: false }) === 'level' &&
     M.trackFor({ scene: 'menu', world: {}, bossBattle: true, bossAlive: true }) === 'menu',
     '回到菜单一定是菜单曲，哪怕上一局是 BOSS 关');
  ok(M.trackFor(null) === 'menu' && M.trackFor({}) === 'menu', '没有世界时兜底为菜单曲');

  // bossAlive 认的是「真世界」：BOSS 死了就算场上还有小怪也是假
  {
    const ENe = BI.entities;
    const bw = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
    bw.mode = 'adventure';
    bw.map.bossBattle = true;
    const realBoss = ENe.create('boss', 5, 3, 5), minionA = ENe.create('gugu', 3, 5, 5), minionB = ENe.create('claude', 9, 7, 5);
    bw.enemies = [realBoss, minionA, minionB];
    ok(ENe.bossAlive(bw) === true, 'BOSS 在场时 bossAlive 为真');
    minionA.alive = false;
    ok(ENe.bossAlive(bw) === true, '只死小怪不算，BOSS 还在就仍是 BOSS 战');
    BI.rules.killEnemy(bw, realBoss, 'p1');
    ok(!realBoss.alive && minionB.alive, '测试前提：鲁鲁旦已死而小怪还活着', 'minion=' + minionB.alive);
    ok(ENe.bossAlive(bw) === false, '鲁鲁旦一死 bossAlive 立刻为假（小怪没清完也一样）');
    ok(M.trackFor({ scene: 'playing', world: bw, bossBattle: true, bossAlive: ENe.bossAlive(bw) }) === 'level',
       '于是音乐切回关卡曲 —— 这就是那个「BOSS 死了还放斗地主」的 bug');
    ENe.sweep(bw);
    ok(ENe.bossAlive(bw) === false, 'BOSS 实体被回收后依然为假（不会因为找不到 BOSS 而回退成真）');
    ok(ENe.bossAlive(null) === false && ENe.bossAlive({}) === false, '没有世界 / 没有敌人时安全返回假');
  }

  // 没有 Audio：所有接口都必须安静地返回 false / 什么都不做
  let threw = null;
  try {
    M.play('menu'); M.play('boss'); M.play('不存在的曲子');
    M.unlock(); M.setSuspended(true); M.setSuspended(false);
    M.syncMute(); M.update(1); M.stop(); M.update(0);
  } catch (e) { threw = e.message; }
  ok(threw === null, '无音频环境下所有音乐接口都不抛异常', threw || '');
  ok(M.failed === true, '标记为「音乐不可用」，不反复重试');
  ok(M.ready === false && M.el === null, '没有任何音频元素被创建');
  ok(M.play('menu') === false, 'play() 返回 false 而不是谎报成功');
  ok(M.srcFor('menu') === M.tracks.menu.file && M.srcFor('不存在') === null,
     'srcFor() 给已知曲目拼出路径，未知曲目返回 null', String(M.srcFor('menu')));
  ok(M.waiting() === false,
     '环境不可用时 waiting() 为假（不会一直空等玩家交互）', M.status());
  ok(typeof M.status() === 'string', 'status() 返回一段文字', M.status());
  ok(/不可用/.test(M.status()), '状态里说明了音乐不可用', M.status());

  // 静音开关不能把音乐模块带崩
  const beforeMute = BI.sfx.enabled;
  BI.sfx.toggle();
  ok(BI.sfx.enabled === !beforeMute && M.failed === true, 'M 键静音时同步音乐不会抛异常');
  BI.sfx.toggle();
}

/* ============================================================
 * 18. 爆炸范围预览 / 倒计时 / 道具会被炸掉
 * ============================================================ */
group('18. 炸弹：范围预览与实际爆炸一致 / 道具会被烧掉');
{
  const EN = BI.entities, AI = BI.ai;

  function setOf(cells) {
    return cells.map(c => c[0] + ',' + c[1]).sort().join(' ');
  }

  // ① 最关键的「不变量」：预览范围必须和真实爆炸一模一样
  {
    const map = emptyMap();
    map[G.idx(7, 5)] = T.BRICK;
    map[G.idx(5, 3)] = T.HARD;
    const w = makeWorld(map, [makePlayer('p1', 1, 1)]);
    const bomb = { cx: 5, cy: 5, power: 3, ownerId: 'p1', freeFor: null, fuse: 0, fuseTotal: CFG.FUSE };

    const geo = BI.rules.bombCells(w, bomb);
    boom(w, bomb);
    const flames = w.flames[0].cells;

    ok(setOf(geo.cells) === setOf(flames),
       '预览范围和实际爆炸完全一致（这是最要紧的一条）',
       '预览 ' + setOf(geo.cells) + '  vs  实际 ' + setOf(flames));
    ok(geo.bricks.length === 1 && geo.bricks[0][0] === 7 && geo.bricks[0][1] === 5,
       '预览正确标出了会被炸掉的软砖', JSON.stringify(geo.bricks));
  }

  // ② 硬墙挡住：预览也不该画到墙外
  {
    const map = emptyMap();
    map[G.idx(7, 5)] = T.HARD;
    const w = makeWorld(map, [makePlayer('p1', 1, 1)]);
    const geo = BI.rules.bombCells(w, { cx: 5, cy: 5, power: 4, freeFor: null });
    const s = setOf(geo.cells);
    ok(s.indexOf('7,5') < 0, '硬墙那一格不在预览范围里');
    ok(s.indexOf('8,5') < 0, '硬墙后面也不在预览范围里');
    ok(s.indexOf('6,5') >= 0, '硬墙前面还在范围里');
  }

  // ③ 连锁目标也在预览里
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    const a = { cx: 3, cy: 5, power: 2, ownerId: 'p1', freeFor: null, fuse: 0, fuseTotal: CFG.FUSE };
    const b = { cx: 5, cy: 5, power: 1, ownerId: 'p2', freeFor: null, fuse: 9, fuseTotal: CFG.FUSE };
    w.bombs.push(a, b);
    const geo = BI.rules.bombCells(w, a);
    ok(geo.chain.length === 1 && geo.chain[0] === b, '预览算出了会被连锁引爆的炸弹');
    ok(setOf(geo.cells).indexOf('5,5') >= 0, '连锁炸弹那一格在预览范围里');
  }

  // ④ 引信总长分开记（敌人的引信更长，倒计时环才不会算错）
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
    R.tryPlaceBomb(w, w.players[0]);
    ok(w.bombs[0].fuseTotal === CFG.FUSE, '玩家炸弹有 fuseTotal',
       String(w.bombs[0].fuseTotal));
    const e = EN.create('oupao', 5, 7, 1);
    w.enemies.push(e);
    AI.placeBomb(w, e, 5, 7);
    const eb = w.bombs[w.bombs.length - 1];
    ok(eb.fuseTotal > CFG.FUSE && eb.fuseTotal === eb.fuse,
       '敌人炸弹的 fuseTotal 和自己的引信一致（比玩家的长）',
       `${eb.fuse} / ${eb.fuseTotal}`);
  }

  // ⑤ 爆炸会烧掉范围内的道具
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    w.burnItems = true;
    w.items.push({ c: 6, r: 5, type: 'fire' });     // 火力 2 范围内
    w.items.push({ c: 9, r: 9, type: 'bomb' });     // 远离爆炸
    boom(w, { cx: 5, cy: 5, power: 2, ownerId: 'p1', freeFor: null, fuse: 0, fuseTotal: CFG.FUSE });
    ok(w.items.length === 1 && w.items[0].c === 9,
       '范围内的道具被烧掉，范围外的留着',
       JSON.stringify(w.items.map(i => i.c + ',' + i.r)));
  }

  // ⑥ 烧道具会通知外部（用来放音效和粒子）
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    w.burnItems = true;
    let burned = 0;
    w.onItemBurned = function () { burned++; };
    w.items.push({ c: 6, r: 5, type: 'fire' });
    boom(w, { cx: 5, cy: 5, power: 2, ownerId: 'p1', freeFor: null, fuse: 0, fuseTotal: CFG.FUSE });
    ok(burned === 1, '烧掉道具时触发了回调', String(burned));
  }

  // ⑦ 关掉开关就不烧（配置可关）
  {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
    w.burnItems = false;
    w.items.push({ c: 6, r: 5, type: 'fire' });
    boom(w, { cx: 5, cy: 5, power: 2, ownerId: 'p1', freeFor: null, fuse: 0, fuseTotal: CFG.FUSE });
    ok(w.items.length === 1, '把 BURN_ITEMS 关掉后道具就烧不掉了');
  }

  // ⑧ 【顺序陷阱】砖块炸出来的道具不能被同一发爆炸烧掉
  {
    const map = emptyMap();
    map[G.idx(6, 5)] = T.BRICK;
    const w = makeWorld(map, [makePlayer('p1', 1, 1)]);
    w.burnItems = true;
    const saved = CFG.ITEM_DROP_RATE;
    CFG.ITEM_DROP_RATE = 1;                      // 必掉，才能稳定验证
    boom(w, { cx: 5, cy: 5, power: 2, ownerId: 'p1', freeFor: null, fuse: 0, fuseTotal: CFG.FUSE });
    CFG.ITEM_DROP_RATE = saved;
    ok(w.items.length === 1, '砖块炸出来的道具活下来了（先烧后掉，顺序不能反）',
       JSON.stringify(w.items.map(i => i.c + ',' + i.r)));
    ok(w.items[0].c === 6 && w.items[0].r === 5, '道具掉在被炸开的那一格');
  }

  // ⑨ 配置默认值：预览和倒计时默认**关**（按需求不要显示），
  //    但功能保留着，改开关就能开回来
  {
    ok(typeof CFG.SHOW_BLAST_PREVIEW === 'undefined', '已移除全局爆炸范围开关，预览只由小天技能触发');
    ok(CFG.SHOW_FUSE_TIMER === false, '默认不显示倒计时');
    ok(CFG.BURN_ITEMS === true, '默认开启「爆炸烧道具」');
    ok(typeof BI.levelgen.openExits === 'function', '随机硬墙的出口数工具已导出');
  }
}

/* ============================================================
 * 19. 移动：一次只走一个轴（不许斜着走）
 * ============================================================ */
group('19. 移动：一次只走一个轴，不能斜着走');
{
  const MO = BI.motion;
  const DT = 1 / 60;

  function run(hx, hy, axisPref, frames) {
    const w = makeWorld(emptyMap(), [makePlayer('p1', 4, 4)]);
    const p = w.players[0];
    p.axisPref = axisPref;
    const x0 = p.x, y0 = p.y;
    for (let i = 0; i < (frames || 60); i++) MO.step(w, p, hx, hy, DT);
    return { dx: p.x - x0, dy: p.y - y0, p: p };
  }

  // ① 单轴照常走
  {
    const r = run(1, 0, 'x');
    ok(r.dx > 0 && Math.abs(r.dy) < 0.001, '只按右：只沿 x 走',
       `dx=${r.dx.toFixed(1)} dy=${r.dy.toFixed(2)}`);
  }
  {
    const r = run(0, 1, 'y');
    ok(r.dy > 0 && Math.abs(r.dx) < 0.001, '只按下：只沿 y 走',
       `dx=${r.dx.toFixed(2)} dy=${r.dy.toFixed(1)}`);
  }

  // ② 同时按住两个方向 —— 这是"斜走"的来源，必须只走一个轴
  {
    const r = run(1, 1, 'x');
    ok(r.dx > 0 && Math.abs(r.dy) < 0.001,
       '同时按右+下（最近按的是左右方向）：只沿 x 走，y 一点都不动',
       `dx=${r.dx.toFixed(1)} dy=${r.dy.toFixed(2)}`);
  }
  {
    const r = run(1, 1, 'y');
    ok(r.dy > 0 && Math.abs(r.dx) < 0.001,
       '同时按右+下（最近按的是上下方向）：只沿 y 走，x 一点都不动',
       `dx=${r.dx.toFixed(2)} dy=${r.dy.toFixed(1)}`);
  }
  {
    const r = run(-1, -1, 'y');
    ok(r.dy < 0 && Math.abs(r.dx) < 0.001, '同时按左+上：只沿 y 走');
  }

  // ③ 一次只走一个轴 —— 位移量应该等于单轴走满一秒，而不是"各走一点"
  {
    const onlyX = run(1, 0, 'x');
    const bothX = run(1, 1, 'x');
    ok(Math.abs(onlyX.dx - bothX.dx) < 0.001,
       '斜向输入不会让 x 方向变慢（不是把速度劈成两半）',
       `${onlyX.dx.toFixed(2)} vs ${bothX.dx.toFixed(2)}`);
  }

  // ④ 反方向同时按 = 抵消（上层算出来就是 hx=0，这里直接传 0 验证不位移）
  {
    const r = run(0, 0, 'x');
    ok(Math.abs(r.dx) < 0.001 && Math.abs(r.dy) < 0.001, '左右同时按（hx=0）原地不动');
  }

  // ⑤ 斜向输入时朝哪边走，完全由 axisPref 决定
  {
    const a = run(1, 1, 'x'), b = run(1, 1, 'y');
    ok(Math.abs(a.dy) < 0.001 && Math.abs(b.dx) < 0.001,
       '两个轴的选择完全由 axisPref 决定');
    ok(a.dx > 0 && b.dy > 0, '两种情况下都在朝按下的方向走');
  }

  // ⑥ 撞墙时另一个轴也不会偷偷补上
  {
    const map = emptyMap();
    for (let r = 0; r < CFG.ROWS; r++) map[G.idx(6, r)] = T.HARD;   // 右边一堵墙
    const w = makeWorld(map, [makePlayer('p1', 4, 4)]);
    const p = w.players[0];
    p.axisPref = 'x';
    const x0 = p.x, y0 = p.y;
    for (let i = 0; i < 120; i++) MO.step(w, p, 1, 1, DT);
    ok(p.x > x0, '撞墙前确实朝墙走了');

    // 碰撞盒比格子小（BOX 36 < TILE 48），所以角色能贴得比"格中心"更近一点，
    // 但碰撞盒的右边缘绝不能越过墙的左边缘。
    const wallLeft = G.centerX(6) - CFG.TILE / 2;
    const boxRight = p.x + CFG.BOX / 2;
    ok(boxRight <= wallLeft + 0.01, '停在墙前面：碰撞盒没有穿进墙里',
       `盒右缘 ${boxRight.toFixed(1)} vs 墙左缘 ${wallLeft.toFixed(1)}`);
    ok(p.x > G.centerX(5) - 1, '确实走到了紧贴墙的那一格', p.x.toFixed(1));
    ok(Math.abs(p.y - y0) < 0.001,
       'x 被墙挡住时，y 也不会"绕"过去（不是斜走）', p.y.toFixed(2));
  }
}

/* ============================================================
 * 20. 敌人数值：单位和相对快慢
 * ============================================================ */
group('20. 新 NPC 的速度与火力');
{
  const EN = BI.entities, TYPES = EN.TYPES;

  // ① 单位：speed 是「格/秒」，要真的按这个跑
  {
    const w = makeWorld(emptyMap(), []);
    for (const id of ['gugu', 'claude', 'oupao']) {
      const e = EN.create(id, 5, 5, 1);
      e.x = G.centerX(1); e.y = G.centerY(5); e.px = e.x; e.py = e.y;
      w.enemies.length = 0;
      w.enemies.push(e);
      const x0 = e.x;
      let dist = 0;
      for (let i = 0; i < 60; i++) {
        const bx = e.x, by = e.y;
        BI.ai.updateEnemy(w, e, 1 / 60);
        dist += Math.hypot(e.x - bx, e.y - by);
      }
      const walked = dist / CFG.TILE;                 // 1 秒走了几格
      ok(Math.abs(walked - TYPES[id].speed) < 0.02,
         TYPES[id].name + ' 的 1 秒实走距离 = 配置的 speed（单位确实是格/秒）',
         `走了 ${walked.toFixed(2)} 格，配置 ${TYPES[id].speed}`);
    }
  }

  // 新 NPC 的速度适中，差异来自投弹范围和节奏。
  ok(TYPES.gugu.speed === 1 && TYPES.claude.speed === 1.1 && TYPES.oupao.speed === 1.15,
    '三种 NPC 使用新的温和速度配置');
  ok(TYPES.gugu.power === 1 && TYPES.claude.power === 1 && TYPES.oupao.power === 2,
    '前两种一格火力，第三种两格火力');
  ok(!TYPES.jelly && !TYPES.chaser && !TYPES.bomber, '旧怪物方案已从生产配置移除');
  // ③ 所有敌人都必须比玩家慢（这是"能躲得掉"的前提）
  {
    let tooFast = [];
    for (const id of Object.keys(TYPES)) {
      if (TYPES[id].speed >= CFG.SPEED_BASE) tooFast.push(id);
    }
    ok(tooFast.length === 0, '没有任何敌人比玩家跑得还快',
       tooFast.join(', ') + ' 追得上玩家');
  }

  // ④ 关卡加成仍然生效，且不会把敌人顶到超过玩家
  {
    ok(EN.speedScale(1) === 1, '第 1 关不加成', String(EN.speedScale(1)));
    ok(EN.speedScale(20) <= 1.45, '关卡加成有上限，不会无限加速',
       String(EN.speedScale(20)));
    const fastest = TYPES.oupao.speed * EN.speedScale(20);
    ok(fastest < CFG.SPEED_BASE,
       '最高关卡下最快的敌人仍然比玩家慢（永远躲得掉）',
       `${fastest.toFixed(2)} vs 玩家 ${CFG.SPEED_BASE}`);
  }
}

group('21. 无敌星星 / 一次性护盾 / 新怪物出场顺序');
{
  const EN = BI.entities, dt = 1 / 60;
  for (let seed = 1; seed <= 12; seed++) {
    const rng = BI.makeRng(seed);
    for (let level = 1; level <= 5; level++) {
      const generated = BI.levelgen.generate(rng, { mode: 'adventure', spawns: [[1, 1], [13, 11]] });
      const w = makeWorld(generated.map, [makePlayer('p1', 1, 1)]);
      EN.spawn(w, EN.countFor(level), level, rng);
      const types = w.enemies.map(e => e.type);
      const expected = level % 5 === 0 ? 'boss' : ['gugu', 'claude', 'oupao'][Math.min(3, level) - 1];
      ok(types[0] === expected, `种子 ${seed} 第 ${level} 关保证引入 ${expected}`);
      ok(level > 1 || types.every(t => t === 'gugu'), `种子 ${seed} 第一关只有谷谷歌歌`);
      ok(level > 2 || !types.includes('oupao'), `种子 ${seed} 前两关没有偶喷诶艾`);
    }
  }
  const w = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]), p = w.players[0];
  R.applyItem(p, 'shield');
  for (let i = 0; i < 1200; i++) R.updateDamage(w, dt);
  ok(p.shield === 1, '护盾等待 20 秒仍保留');
  R.applyItem(p, 'shield');
  ok(p.shield === 1, '重复拾取护盾不会叠加次数');
  let broken = 0;
  w.onShieldBreak = () => broken++;
  w.flames.push({ cells: [[5, 5]] });
  R.updateDamage(w, dt);
  ok(p.alive && p.shield === 0 && broken === 1, '护盾抵挡一次爆炸并触发碎裂反馈');
  R.updateDamage(w, dt);
  ok(p.alive && broken === 1, '同一片持续火焰不会在碎盾后立刻击杀');
  p.invuln = 0;
  R.updateDamage(w, dt);
  ok(!p.alive, '护盾消耗后再次受伤死亡');

  const sw = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]), sp = sw.players[0];
  R.applyItem(sp, 'star'); R.applyItem(sp, 'shield');
  ok(sp.starTime === 6 && sp.shield === 1, '星星提供独立的 6 秒无敌，可和护盾共存');
  sw.flames.push({ cells: [[5, 5]] });
  const boss = EN.create('boss', 5, 5, 1), gugu = EN.create('gugu', 5, 5, 1);
  boss.invuln = 1;
  sw.enemies.push(boss, gugu);
  R.updateDamage(sw, dt);
  ok(sp.alive && sp.shield === 1, '无敌期间免疫爆炸，且不消耗护盾');
  ok(boss.alive && boss.hp === 8 && !gugu.alive && sw.stats.kills === 1,
    '无敌碰撞按普通伤害处理，受击保护中的BOSS免伤，一血小怪正常死亡');
  R.updateDamage(sw, dt);
  ok(sw.stats.kills === 1, '怪物死亡奖励不会重复触发');
  sw.flames = []; sw.enemies = [];
  for (let i = 2; i < 360; i++) R.updateDamage(sw, dt);
  ok(sp.starTime === 0, '无敌严格在 6 秒后结束');
  sw.enemies.push(EN.create('gugu', 5, 5, 1));
  R.updateDamage(sw, dt);
  ok(sp.alive && sp.shield === 1, '无敌结束后触碰 NPC 依然安全，不消耗护盾');
  sw.flames.push({ cells: [[5,5]] }); R.updateDamage(sw, dt);
  ok(sp.alive && sp.shield === 0, '护盾仍然能抵挡一次爆炸');
  sp.invuln = 0;
  R.updateDamage(sw, dt);
  ok(!sp.alive, '无敌和护盾都结束后再次被火焰命中会死亡');

  for (const reverse of [false, true]) {
    const attacker = makePlayer('p1', 5, 5), victim = makePlayer('p2', 5, 5);
    const vw = makeWorld(emptyMap(), reverse ? [victim, attacker] : [attacker, victim]);
    vw.mode = 'versus'; vw.match = BI.match.create('versus');
    R.applyItem(attacker, 'star');
    R.updateDamage(vw, dt); BI.match.update(vw, dt);
    ok(attacker.alive && !victim.alive && vw.match.scores.p1 === 1,
      '无敌触碰击杀对手并正常记分，玩家顺序反转=' + reverse);
  }
  const vw = makeWorld(emptyMap(), [makePlayer('p1', 5, 5), makePlayer('p2', 5, 5)]);
  R.applyItem(vw.players[0], 'star'); R.applyItem(vw.players[1], 'shield');
  R.updateDamage(vw, dt);
  ok(vw.players[1].alive && vw.players[1].shield === 0, '护盾可抵挡一次无敌碰撞');
  vw.players[1].invuln = 0; R.applyItem(vw.players[1], 'star');
  R.updateDamage(vw, dt);
  ok(vw.players.every(p => p.alive), '双方同时无敌时都免伤');
  vw.players[0].starTime = 1;
  R.applyItem(vw.players[0], 'star');
  ok(vw.players[0].starTime === 6, '重复拾取星星刷新为 6 秒');

  const plain = makeWorld(emptyMap(), [makePlayer('p1', 5, 5)]);
  plain.enemies.push(EN.create('gugu', 5, 5, 1));
  plain.players[0].invuln = 1;
  R.updateDamage(plain, dt);
  ok(plain.players[0].alive && plain.enemies[0].alive, '重生无敌只有保护效果，不赋予触碰击杀');
  for (const mode of ['dig', 'versus', 'adventure']) {
    const drops = makeWorld(emptyMap(), []); drops.mode = mode;
    const observed = new Set();
    drops.rng.chance = () => true;
    for (let i = 0; i < 300; i++) {
      R.maybeDropItem(drops, 3, 3);
      R.dropFromEnemy(drops, EN.create('gugu', 4, 4, 1));
    }
    drops.items.forEach(it => observed.add(it.type));
    ok(['fire', 'bomb', 'speed', 'star', 'shield', 'glove'].every(t => observed.has(t)),
      mode + ' 普通砖块与敌人掉落池包括推弹手套等六种道具');
  }
  const bw = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
  for (let level = 1; level <= 4; level++) {
    bw.enemies = []; EN.spawn(bw, EN.countFor(level), level, BI.makeRng(level));
    EN.prepareBriefing(bw);
    ok(bw.briefing.fresh.join(',') === ['', 'gugu', 'claude', 'oupao', ''][level],
      '第 ' + level + ' 关只介绍实际首次出现的怪物');
  }
}

group('22. 投弹逃生 / 怪物活动空间 / 主题地图');
{
  const AI = BI.ai, EN = BI.entities, DG = BI.danger, dt = 1 / 60;
  const deadEnd = emptyMap();
  for (let r = 1; r < 12; r++) for (let c = 1; c < 14; c++) deadEnd[G.idx(c, r)] = T.HARD;
  for (const cell of [[5, 5], [5, 6], [5, 7]]) deadEnd[G.idx(...cell)] = T.EMPTY;
  const boxed = makeWorld(deadEnd, [makePlayer('p1', 5, 5)]);
  const trapped = EN.create('oupao', 5, 7, 1); trapped.bombCd = 0; boxed.enemies.push(trapped);
  AI.decide(boxed, trapped);
  ok(boxed.bombs.length === 0, '死胡同没有逃出爆炸范围的路线时，偶喷诶艾不放弹');

  const chain = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
  const cb = { cx: 5, cy: 5, power: 2, fuse: .4 }, lb = { cx: 7, cy: 5, power: 3, fuse: 9 };
  chain.bombs.push(cb, lb); DG.compute(chain);
  ok(Math.abs(DG.at(chain, 10, 5) - .4) < .001, '长引信炸弹被连锁提前引爆，危险图使用真实提前时间');
  const unsafe = EN.create('oupao', 7, 6, 1);
  ok(!AI.placeBomb(chain, unsafe, 7, 6), '逃生预算包含其他炸弹的连锁，不能误判有九秒撤离');

  let suicide = 0, thrown = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const rng = BI.makeRng(seed), lvl = BI.levelgen.generate(rng, { mode: 'adventure', theme: ['forest', 'factory', 'park'][seed % 3] });
    const w = makeWorld(lvl.map, [makePlayer('p1', 1, 1)]); w.rng = rng;
    EN.spawn(w, 1, 1, rng);
    const e = w.enemies[0];
    // 玩家站在它两格外的空地，引出真实的放弹与撤离循环。
    const reachable = BI.levelgen.bfs(w.map, G.idx(G.col(e.x), G.row(e.y)), v => v === T.EMPTY);
    const target = Array.from(reachable.keys()).find(i => reachable[i] &&
      Math.abs(i % CFG.COLS - G.col(e.x)) + Math.abs(Math.floor(i / CFG.COLS) - G.row(e.y)) === 2);
    if (target !== undefined) { w.players[0].x = G.centerX(target % CFG.COLS); w.players[0].y = G.centerY(Math.floor(target / CFG.COLS)); }
    e.bombCd = 0;
    w.onEnemyBomb = () => thrown++;
    w.rng.chance = () => false;
    for (let frame = 0; frame < 1200 && e.alive; frame++) {
      w.time += dt; DG.compute(w); AI.updateEnemy(w, e, dt);
      R.updateBombs(w, dt); R.updateFlames(w, dt); R.updateEnemies(w, dt);
    }
    if (!e.alive) suicide++;
  }
  ok(thrown >= 12, '真实对局样本中确实发生多次投弹，而非靠不放弹通过检查', thrown + ' 次');
  ok(suicide === 0, '24 张不同地图中偶喷诶艾持续行动 20 秒，没有被自己的炸弹炸死', suicide + ' 只自爆');

  let spawnBad = 0, countBad = 0;
  for (const theme of Object.keys(BI.THEMES)) {
    for (let seed = 1; seed <= 16; seed++) {
      const rng = BI.makeRng(seed), lvl = BI.levelgen.generate(rng, { mode: 'adventure', theme });
      const w = makeWorld(lvl.map, [makePlayer('p1', 1, 1)]);
      if (EN.spawn(w, 8, 6, rng) !== 8) countBad++;
      w.enemies.forEach(e => {
        const c = G.col(e.x), r = G.row(e.y);
        const free = [[1,0],[-1,0],[0,1],[0,-1]].filter(d => G.at(w.map,c+d[0],r+d[1]) === T.EMPTY).length;
        const cells = BI.levelgen.bfs(w.map, G.idx(c,r), v => v === T.EMPTY);
        if (free < 2 || Array.from(cells).filter(Boolean).length < 10) spawnBad++;
      });
      ok(lvl.theme === theme && BI.levelgen.validate(lvl.map, [[1,1],[13,11]], 'adventure').ok,
        theme + ' 主题种子 ' + seed + ' 地图保持可通关');
    }
  }
  ok(spawnBad === 0 && countBad === 0, '三种场景的全部怪物都有至少两个空出口及十格活动区',
    '坏出生点=' + spawnBad + '，数量不足=' + countBad);
  const rng = BI.makeRng(77); let previous;
  const themeSet = new Set();
  for (let i = 0; i < 12; i++) {
    const level = BI.levelgen.generate(rng, { mode: 'adventure', previousTheme: previous });
    ok(level.theme !== previous, '随机场景不会连续重复，第 ' + (i + 1) + ' 次');
    previous = level.theme; themeSet.add(previous);
  }
  ok(themeSet.size === 3, '随机场景覆盖森林、工厂和游乐园');

  const block = makeWorld(emptyMap(), [makePlayer('p1', 1, 1)]);
  const mover = EN.create('claude', 5, 5, 1); block.enemies.push(mover);
  AI.apply(mover, {x:1,y:0,c:6,r:5}); AI.updateEnemy(block,mover,.2);
  block.bombs.push({cx:6,cy:5,power:1,fuse:5});
  for (let i=0;i<60;i++) { DG.compute(block); AI.updateEnemy(block,mover,dt); }
  ok(G.col(mover.x) !== 6 || G.row(mover.y) !== 5, '移动途中下一格被炸弹封住时，不会穿入炸弹');
}

group('23. 五位精灵的独特技能');
{
  const SK = BI.skills, EN = BI.entities, AI = BI.ai;
  function skillWorld(id, c=5, r=5) {
    const p = makePlayer('p1', c, r); p.assetId = id; p.skillCd = 0; SK.reset(p);
    const w = makeWorld(emptyMap(), [p]); w.mode = 'adventure'; w.match = BI.match.create('adventure');
    return {w,p};
  }
  {
    const {w,p} = skillWorld('xiaonuo');
    const e = EN.create('oupao',5,7,1); w.enemies.push(e);
    w.bombs.push({cx:8,cy:8,power:1,fuse:2,byEnemy:true,freeFor:null});
    w.bombs.push({cx:3,cy:3,power:1,fuse:2,ownerId:p.id,freeFor:null});
    ok(SK.cast(w,p), '小诺成功释放时光星域');
    const ex=e.x, ey=e.y;
    AI.updateEnemy(w,e,.5); R.updateBombs(w,.5);
    ok(e.x===ex && e.y===ey && w.bombs[0].fuse===2 && w.bombs[1].fuse===1.5,
      '时光星域冻结怪物和敌方引信，玩家炸弹正常计时');
    ok(!SK.cast(w,p), '冷却中不能重复施放');
    SK.update(w,3.1); AI.updateEnemy(w,e,.2);
    ok(!w.timeStop && (e.x!==ex || e.y!==ey), '三秒后怪物恢复行动');
  }
  {
    const {w,p}=skillWorld('axiu');
    const first=EN.create('gugu',6,5,1), boss=EN.create('boss',7,5,1);
    w.enemies.push(first,boss); G.set(w.map,8,5,T.HARD);
    ok(SK.cast(w,p) && G.col(p.x)===7 && !first.alive && boss.hp===7,
      '阿修逐格突进，沿途攻击各命中一次，且停在墙前');
    ok(p.invuln>0 && p.power===1 && p.maxBombs===1, '突进提供短暂保护，不污染永久成长属性');
    p.skillCd=0; G.set(w.map,8,5,T.EMPTY); w.bombs.push({cx:8,cy:5});
    ok(!SK.cast(w,p) && p.skillCd===0, '前方炸弹封路时突进失败，不消耗冷却');
  }
  {
    const {w,p}=skillWorld('arui');
    const near=EN.create('gugu',5,6,1), far=EN.create('gugu',5,8,1), behind=EN.create('gugu',7,5,1);
    w.enemies.push(near,far,behind); G.set(w.map,6,5,T.HARD);
    ok(SK.cast(w,p) && p.shield===1 && near.stun===2 && !far.stun && !behind.stun,
      '阿瑞获得护盾，只缠绕两格内可达的怪物');
    const y=near.y; AI.updateEnemy(w,near,.5);
    ok(near.y===y && near.stun===1.5, '缠绕期间不能移动，且控制时间会正常消退');
  }
  {
    const {w,p}=skillWorld('xiaoyan');
    SK.cast(w,p);
    ok(p.flameGuard===4 && !SK.cast(w,p), '小炎开启四秒吸火窗口，窗口内不能重复施放');
    const near=EN.create('gugu',6,6,1), edge=EN.create('gugu',7,7,1), far=EN.create('gugu',8,5,1);
    w.enemies.push(near,edge,far);
    const hp0=[near.hp,edge.hp,far.hp];
    w.flames.push({cells:[[5,5]],t:.4}); R.updateDamage(w,1/60);
    ok(p.alive && !p.flameGuard && p.invuln>0 && p.power===1,
      '小炎吸收一次爆炸后自身无伤，不修改永久火力');
    ok(near.hp===hp0[0]-1 && edge.hp===hp0[1]-1 && far.hp===hp0[2],
      '吸收的爆炸反弹给 5×5 内的敌人，第二圈外的不受影响',
      'hp=' + [near.hp,edge.hp,far.hp].join(','));
    ok(w.skillEffects.filter(fx=>fx.type==='flameReflect').length===1,
      '反弹有独立的火焰范围特效，且每次吸火只出一次');
    w.bombs=[]; R.tryPlaceBomb(w,p);
    ok(w.bombs[0].power===1, '反弹不再附带蓄火强化，之后的炸弹是普通火力');
    const vs=skillWorld('xiaoyan'), victim=makePlayer('p2',6,5); vs.w.players.push(victim);
    SK.cast(vs.w,vs.p); vs.w.flames.push({cells:[[5,5]],t:.4}); R.updateDamage(vs.w,1/60);
    ok(!victim.alive, '对战模式下反弹同样打到 5×5 内的对手');
    const vsFar=skillWorld('xiaoyan'), safe=makePlayer('p2',9,5); vsFar.w.players.push(safe);
    SK.cast(vsFar.w,vsFar.p); vsFar.w.flames.push({cells:[[5,5]],t:.4}); R.updateDamage(vsFar.w,1/60);
    ok(safe.alive, '第二圈之外的对手不会被反弹打到');
    const shielded=skillWorld('xiaoyan'), guarded=makePlayer('p2',6,5); guarded.shield=1; shielded.w.players.push(guarded);
    SK.cast(shielded.w,shielded.p); shielded.w.flames.push({cells:[[5,5]],t:.4}); R.updateDamage(shielded.w,1/60);
    ok(guarded.alive && guarded.shield===0, '对手的护盾可以挡下这一次反弹');
    const other=skillWorld('xiaoyan'); SK.cast(other.w,other.p);
    other.w.enemies.push(EN.create('gugu',5,5,1)); R.updateDamage(other.w,1/60);
    ok(other.p.alive && other.p.flameGuard > 0, '接触 NPC 不受伤且不消耗吸火效果');
    const empty=skillWorld('xiaoyan'); SK.cast(empty.w,empty.p);
    empty.w.flames.push({cells:[[5,5]],t:.4}); R.updateDamage(empty.w,1/60);
    ok(empty.p.alive && !empty.p.flameGuard && empty.w.skillEffects.some(fx=>fx.type==='flameReflect'),
      '周围没有敌人时吸火照样生效，不会空放伤害给自己');
  }
  {
    const {w,p}=skillWorld('xiaotian',2,5);
    SK.cast(w,p); const x=p.x; MO.step(w,p,1,0,.1);
    ok(Math.abs(p.x-x-CFG.SPEED_BASE*CFG.TILE*1.3*.1)<.01 && p.speedBonus===0,
      '小天临时获得30%加速，永久速度保持原值');
    SK.update(w,6.1);
    ok(p.insightTime===0, '六秒后洞察与加速同步结束');
  }
  for(const id of Object.keys(BI.SKILLS)) {
    const {w,p}=skillWorld(id); p.alive=false;
    ok(!SK.cast(w,p), id+' 阵亡时不能释放技能');
    p.alive=true; w.briefing={};
    ok(!SK.cast(w,p), id+' 阅读关前介绍时不能释放技能');
    w.briefing=null; p.flameGuard=4; p.insightTime=6;
    SK.reset(p);
    ok(!p.flameGuard && !p.insightTime, id+' 重生与换关清理临时状态');
  }
  // 本次平衡性调整：小诺 / 阿修 / 小天冷却与阿修的范围描述
  ok(BI.SKILLS.xiaonuo.cd===12 && BI.SKILLS.xiaotian.cd===12 && BI.SKILLS.axiu.cd===15,
    '小诺与小天冷却同为12秒，阿修为15秒',
    [BI.SKILLS.xiaonuo.cd,BI.SKILLS.axiu.cd,BI.SKILLS.arui.cd,BI.SKILLS.xiaoyan.cd,BI.SKILLS.xiaotian.cd].join('/'));
  ok(/最多三格/.test(BI.SKILLS.axiu.desc),
    '阿修的范围描述与其他角色统一用中文数词（最多三格）', BI.SKILLS.axiu.desc);
  ok(BI.entities.TYPES.claude.speed===1.1, '克劳德德使用独立的新速度配置');
}

group('24. 中央设施 / 传送带物理 / 木马奖励 / 障碍变体');
{
  const SC=BI.scenery, dt=1/60;
  function scenic(theme,mode='adventure',seed=45) {
    const rng=BI.makeRng(seed), level=BI.levelgen.generate(rng,{mode,theme});
    const w=makeWorld(level.map,[makePlayer('p1',1,1)]);w.mode=mode;w.theme=theme;w.rng=rng;
    return w;
  }
  let bad=0;
  for(const theme of Object.keys(BI.THEMES))for(let seed=1;seed<=24;seed++) {
    const w=scenic(theme,'adventure',seed),lm=w.map.landmark;
    for(let r=5;r<=7;r++)for(let c=6;c<=8;c++)if(G.at(w.map,c,r)!==T.HARD)bad++;
    if(!BI.levelgen.validate(w.map,[[1,1],[13,11]],'adventure').ok)bad++;
    const varieties=new Set();w.map.forEach((v,i)=>{if(v===T.BRICK)varieties.add(w.map.variants[i]);});
    if(varieties.size!==(theme==='forest'?4:3))bad++;
    for(let i=0;i<lm.path.length;i++) {
      const a=lm.path[i],b=lm.path[(i+1)%lm.path.length];
      if(G.at(w.map,...a)!==T.EMPTY || Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])!==1)bad++;
    }
  }
  ok(bad===0,'72 张主题地图都具有完整中央占地、可走闭环、至少三种软障碍且保持连通',bad+' 个问题');
  const factory=scenic('factory'),p=factory.players[0],path=factory.map.landmark.path;
  p.x=p.px=G.centerX(5);p.y=p.py=G.centerY(3);const start=p.x;
  for(let i=0;i<18;i++)MO.step(factory,p,1,0,dt);
  const forward=(p.x-start)/CFG.TILE/.3;
  p.x=p.px=G.centerX(9);p.y=p.py=G.centerY(3);const reverseStart=p.x;
  for(let i=0;i<18;i++)MO.step(factory,p,-1,0,dt);
  const reverse=(reverseStart-p.x)/CFG.TILE/.3;
  ok(Math.abs(forward-(CFG.SPEED_BASE+1.65))<.02,'顺传送带时速度为主动移动叠加带速',forward.toFixed(3));
  ok(Math.abs(reverse-(CFG.SPEED_BASE-1.65))<.02,'逆传送带时速度为主动移动减去带速',reverse.toFixed(3));
  p.x=p.px=G.centerX(path[0][0]);p.y=p.py=G.centerY(path[0][1]);
  const x=p.x,y=p.y;let hitWall=0;
  const lapSeconds=path.length/1.65;
  const frames=Math.round(lapSeconds/dt);
  for(let i=0;i<frames;i++) {
    MO.step(factory,p,0,0,dt);
    if(!G.canStand(factory.map,factory.bombs,p.x,p.y,CFG.BOX,p.id))hitWall++;
  }
  ok(Math.hypot(p.x-x,p.y-y)<2 && hitWall===0,'不按方向时自动走完传送带闭环，正确转过全部四角',Math.hypot(p.x-x,p.y-y).toFixed(2)+'px');
  p.x=G.centerX(5);p.y=G.centerY(3);factory.bombs=[{cx:6,cy:3,freeFor:null,fuse:20,power:1}];
  for(let i=0;i<120;i++)MO.step(factory,p,0,0,dt);
  ok(G.centerX(6)-p.x>=CFG.BOMB_RADIUS+CFG.PLAYER_BOMB_RADIUS-.01,'传送带被炸弹封路时停在炸弹前，不会穿过去');
  factory.bombs=[];p.x=G.centerX(1);p.y=G.centerY(1);const ox=p.x,oy=p.y;
  MO.step(factory,p,0,0,1);
  ok(p.x===ox&&p.y===oy,'离开传送带后不会继续漂移');

  const park=scenic('park'),rider=park.players[0],ride=park.map.landmark.path;
  rider.x=G.centerX(ride[0][0]);rider.y=G.centerY(ride[0][1]);
  for(let i=0;i<Math.ceil(ride.length/1.8/dt)+5;i++)MO.step(park,rider,0,0,dt);
  ok(rider.shield===1&&rider.carouselRewarded,'木马静止搭乘完整一圈后获得一次护盾');
  rider.shield=0;
  for(let i=0;i<Math.ceil(ride.length/1.8/dt)+5;i++)MO.step(park,rider,0,0,dt);
  ok(rider.shield===0,'本关已领取奖励后再绕圈，不会重复刷护盾');
  G.set(park.map,4,6,T.EMPTY);
  rider.carouselTravel=5;rider.x=G.centerX(5);rider.y=G.centerY(6);
  for(let i=0;i<25;i++)MO.step(park,rider,-1,0,dt);
  ok(G.col(rider.x)<5&&rider.carouselTravel===0,'主动移动可以离开木马，不会被环道吸住');
  const forest=scenic('forest'),fruitTimer=forest.map.landmark.fruitTimer;
  SC.update(forest,fruitTimer-.1);ok(!forest.items.length,'古树不会开局立即掉果实');
  SC.update(forest,.2);
  ok(forest.items.length===1&&forest.items[0].type==='fruit'&&G.at(forest.map,forest.items[0].c,forest.items[0].r)===T.EMPTY,
    '古树到时把生命果实落在树旁真实空地');
  SC.update(forest,14);SC.update(forest,14);
  ok(forest.items.length===2,'地上最多保留两颗古树果实，防止无限堆积');
  const fp=forest.players[0];fp.lives=3;
  const fruit=forest.items[0];fp.x=G.centerX(fruit.c);fp.y=G.centerY(fruit.r);R.updateItems(forest,dt);
  ok(fp.lives===4,'拾取生命果实恢复一条命');
  fp.lives=5;fp.shield=0;R.applyItem(fp,'fruit','adventure');
  ok(fp.lives===5&&fp.shield===1,'生命已满时果实转为一次护盾');
  fp.lives=3;fp.shield=0;R.applyItem(fp,'fruit','versus');
  ok(fp.lives===3&&fp.shield===1,'对战模式果实提供护盾，不修改对战生命或得分');
  const crowded=scenic('forest');crowded.map.landmark.fruitTimer=0;
  G.set(crowded.map,5,4,T.EMPTY);G.set(crowded.map,6,4,T.EMPTY);
  for(let r=4;r<=8;r++)for(let c=5;c<=9;c++) {
    if(!(c===5||c===9||r===4||r===8)||(r===4&&(c===5||c===6)))continue;
    crowded.items.push({type:'fire',c,r});
  }
  crowded.enemies=[BI.entities.create('gugu',5,4,1)];SC.update(crowded,dt);
  const visibleFruit=crowded.items.find(it=>it.type==='fruit');
  ok(visibleFruit&&visibleFruit.c===6&&visibleFruit.r===4,'古树果实避开存活角色和已有道具，不会落在怪物身下');
  const same=BI.levelgen.generate(BI.makeRng(9),{mode:'adventure',theme:'forest',previousTheme:'forest'});
  ok(same.theme!=='forest','即使请求主题与上一关相同，也强制换成另一场景');
  const repeatA=BI.levelgen.generate(BI.makeRng(11),{theme:'park'}),repeatB=BI.levelgen.generate(BI.makeRng(11),{theme:'park'});
  ok(Array.from(repeatA.map).join()===Array.from(repeatB.map).join()&&Array.from(repeatA.map.variants).join()===Array.from(repeatB.map.variants).join(),
    '相同种子同时重现地图布局和障碍物变体');
}

group('25. 新 NPC 与鲁鲁旦：无接触伤害 / 常规主题 BOSS 场景 / 单格毒叉');
{
  const EN = BI.entities, AI = BI.ai, DG = BI.danger, dt = 1 / 60;
  for (const id of Object.keys(EN.TYPES)) {
    const p = makePlayer('p1', 5, 5), w = makeWorld(emptyMap(), [p]);
    w.enemies = [EN.create(id, 5, 5, 1)]; p.shield = 1;
    for (let i = 0; i < 120; i++) R.updateDamage(w, dt);
    ok(p.alive && p.shield === 1 && p.lives === 3, id + ' 接触两秒不扣血，也不消耗护盾');
    w.flames.push({ cells: [[5,5]], t: .4 }); R.updateDamage(w, dt);
    ok(p.alive && p.shield === 0, id + ' 的接触与火焰伤害分离，爆炸仍可击碎护盾');
  }
  const arena = BI.levelgen.generateBoss(BI.makeRng(715), 'forest');
  const map=arena.map,p=makePlayer('p1',1,1),w=makeWorld(map,[p]);
  ok(G.cols(map)===15&&G.rows(map)===13&&map.bossBattle,'BOSS 使用15×13的常规地图');
  ok(arena.theme!=='forest'&&map.landmark&&BI.match.countBricks(map)>=30,'BOSS 随机换场景并保留设施与可破坏障碍');
  ok(BI.levelgen.validate(map,arena.spawns,'adventure').ok,'BOSS 主题地图可连通');
  for(let r=9;r<=11;r++)for(let c=10;c<=13;c++)G.set(map,c,r,T.EMPTY);
  ok(G.at(map,13,11)===T.EMPTY&&G.at(map,14,11)===T.HARD,'常规右下边界正确');
  ok(G.canStand(map,[],G.centerX(13),G.centerY(11),CFG.BOX,'p1')&&
    !G.canStand(map,[],G.centerX(14),G.centerY(11),CFG.BOX,'p1'),'玩家不能穿过边界墙');
  const bomb={cx:11,cy:10,power:3,fuse:2,ownerId:'p1',freeFor:null};w.bombs.push(bomb);
  const geo=R.bombCells(w,bomb);
  ok(geo.cells.some(cell=>cell[0]===13&&cell[1]===10)&&!geo.cells.some(cell=>cell[0]===14),'炸弹范围仍在真实边界停止');
  DG.compute(w);ok(w.danger.length===195&&DG.at(w,13,10)===2&&DG.at(w,11,11)===2,'BOSS 威胁图与常规地图同尺寸');
  const field=AI.buildField(w,11,10);ok(field.length===195&&field[11*15+12]===2,'BOSS 寻路正常通过空地');
  w.bombs=[];
  EN.spawn(w,EN.countFor(5),5,BI.makeRng(20));
  const boss=w.enemies[0];
  ok(w.enemies.length===3 && w.enemies.filter(e=>e.type==='boss').length===1 && boss.name==='鲁鲁旦' && boss.hp===8,
    '第五关生成一只8血鲁鲁旦与两只普通随从');
  EN.prepareBriefing(w); ok(w.briefing.fresh[0] === 'boss', '鲁鲁旦首次登场优先显示独立介绍');
  p.x=G.centerX(11);p.y=G.centerY(10);
  const dx=p.x,dy=p.y; p.invuln=30;
  boss.hp=6;EN.syncBossPhase(w,boss);
  AI.castForks(w,boss);
  ok(w.poison.length===6 && new Set(w.poison.map(f=>f.c+','+f.r)).size===6,
    '常规场景一次毒叉生成六个不同落点');
  ok(w.poison.every(f=>f.c>=1&&f.c<=13&&f.r>=1&&f.r<=11&&G.at(map,f.c,f.r)===T.EMPTY&&f.warn===1.5),
    '毒刺不落在硬墙、软砖或中央设施上，且先预警1.5秒');
  const seedForks=new Set();
  for(let seed=1;seed<=12;seed++){w.rng=BI.makeRng(seed);w.poison=[];AI.castForks(w,boss);seedForks.add(w.poison.map(f=>f.c+','+f.r).join(';'));}
  ok(seedForks.size===12, '毒叉落点随随机种子变化，不使用固定图案');
  p.invuln=0; p.shield=0; p.alive=true;
  w.poison=[{c:11,r:10,warn:1.5,life:.8}];
  R.updateDamage(w,dt); ok(p.alive, '站在预警格上不会提前受伤');
  R.updatePoison(w,1.49); R.updateDamage(w,dt); ok(p.alive, '预警结束前依然无伤害');
  R.updatePoison(w,.02);
  for(const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1]]) {
    p.x=G.centerX(11+d[0]);p.y=G.centerY(10+d[1]);R.updateDamage(w,dt);
  }
  ok(p.alive, '毒叉相邻四格与斜角都不受伤');
  p.x=dx;p.y=dy;p.shield=1;R.updateDamage(w,dt);
  ok(p.alive&&p.shield===0&&p.invuln>0, '毒叉激活后只伤落点，护盾能抵挡一次');
  p.invuln=0;p.starTime=6;R.updateDamage(w,dt);ok(p.alive, '无敌星星可以免疫毒叉');
  p.starTime=0;R.updateDamage(w,dt);ok(!p.alive, '没有保护时踩中激活毒叉会受伤');
  R.updatePoison(w,2);ok(w.poison.length===0, '毒叉持续时间结束后移除');
  w.poison=[{c:11,r:10,warn:1.5,life:.8}];w.timeStop={remaining:3};
  R.updatePoison(w,1);ok(w.poison[0].warn===1.5, '时光星域同时冻结毒刺的预警和持续时间');
  w.timeStop=null;R.killEnemy(w,boss);ok(w.poison.length===0, '击败鲁鲁旦立即清除残留毒叉');
  for(const phase of [1,2,3]) {
    const sw=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),e=EN.create('boss',5,7,5);sw.map.bossBattle=true;
    sw.enemies=[e];e.hp=[0,8,6,3][phase];EN.syncBossPhase(sw,e);e.abilityCd=0;e.bombCd=0;
    for(let i=0;i<60;i++){DG.compute(sw);AI.updateEnemy(sw,e,dt);}
    ok(phase===1 ? (!sw.poison || !sw.poison.length) && sw.bombs.length===1 : sw.poison&&sw.poison.length===6,
      '鲁鲁旦阶段 '+phase+' 的投弹或解锁毒叉在真实行动中触发');
  }
  const quotaWorld=makeWorld(emptyMap(),[makePlayer('p1',5,5)]);
  const quotaMobs=[EN.create('gugu',5,7,1),EN.create('claude',7,5,1),EN.create('oupao',3,5,1)];
  quotaWorld.enemies=quotaMobs;
  quotaMobs.forEach(e=>{e.windup=.1;e.bombCd=0;AI.updateEnemy(quotaWorld,e,.11);});
  ok(quotaWorld.bombs.length===2,'多只小怪同时结束预备动作时仍限制全场两颗敌方炸弹');
  const firstThrower=quotaMobs.find(e=>quotaWorld.bombs.some(b=>b.ownerId===e.id));
  ok(!AI.placeBomb(quotaWorld,firstThrower,9,9),'同一只小怪不能绕过冷却直接放第二颗弹');
  for(const id of ['gugu','claude','oupao']) {
    const sw=makeWorld(emptyMap(),[makePlayer('p1',5,5)]), e=EN.create(id,5,7,1);
    sw.enemies=[e];e.bombCd=0;DG.compute(sw);AI.decide(sw,e);
    AI.updateEnemy(sw,e,.3);
    ok(e.windup>0&&!sw.bombs.length,id+' 的投弹提示至少持续0.3秒');
    AI.updateEnemy(sw,e,.5);
    ok(sw.bombs.length===1&&e.dir&&e.escapePath.length>=2,id+' 提示后投弹并开始完整撤离');
    const initial=sw.bombs[0];
    for(let i=0;i<400;i++){sw.time+=dt;DG.compute(sw);AI.updateEnemy(sw,e,dt);R.updateBombs(sw,dt);R.updateFlames(sw,dt);R.updateEnemies(sw,dt);}
    ok(e.alive&&!sw.bombs.includes(initial),id+' 能活着离开自己的爆炸范围');
  }
}

group('26. 连锁爆炸防卡死：数组移除 / 引信只更新一次 / 小诺时停');
{
  const bomb=(c,r,fuse,id,byEnemy)=>({cx:c,cy:r,power:2,fuse,ownerId:id,freeFor:null,byEnemy:!!byEnemy});
  const cases=[
    [bomb(5,5,8,'a'),bomb(6,5,.001,'b')],
    [bomb(6,5,.001,'b'),bomb(5,5,8,'a')],
    [bomb(5,5,8,'a'),bomb(6,5,8,'b'),bomb(7,5,.001,'c')],
    [bomb(4,5,8,'a'),bomb(6,5,.001,'b'),bomb(8,5,8,'c')]
  ];
  cases.forEach((bombs,i)=>{
    const w=makeWorld(emptyMap());w.bombs=bombs.slice();
    const lone=bomb(12,10,7,'lone');w.bombs.splice(1,0,lone);
    let error=null;try{R.updateBombs(w,1/60);}catch(e){error=e;}
    ok(!error,'连锁布局 '+i+' 在引爆前后位置不同的炸弹时不抛异常',String(error||''));
    ok(w.bombs.length===1&&w.bombs[0]===lone&&w.stats.explosions===bombs.length,
      '连锁布局 '+i+' 每颗连锁炸弹只爆炸一次，保留无关炸弹');
    ok(Math.abs(lone.fuse-(7-1/60))<1e-9,'连锁布局 '+i+' 无关炸弹引信一帧只扣一次');
  });
  const w=makeWorld(emptyMap(),[makePlayer('p1',1,1)]);w.players[0].assetId='xiaonuo';
  w.bombs=[bomb(5,5,.001,'p1'),bomb(6,5,8,'npc',true)];BI.skills.cast(w,w.players[0]);
  R.updateBombs(w,1/60);
  ok(w.timeStop&&w.bombs.length===0&&w.flames.length===2,
    '小诺时停不阻止玩家炸弹连锁引爆敌弹，整个过程不因删除数组成员而崩溃');
  let permutations=0,incorrect=0;
  const values=[0,1,2,3];
  function perm(a,rest){if(!rest.length){
    const w=makeWorld(emptyMap());
    w.bombs=a.map(i=>bomb(3+i*2,5,i===3?.001:9,'e'+i));
    try{R.updateBombs(w,1/60);if(w.bombs.length||w.stats.explosions!==4)incorrect++;}catch(e){incorrect++;}
    permutations++;return;
  }rest.forEach((v,i)=>perm(a.concat(v),rest.filter((_,j)=>j!==i)));}
  perm([],values);
  ok(permutations===24&&incorrect===0,'四颗炸弹的24种数组顺序全部连锁完成且无重复爆炸');
}

group('27. 炸弹实际碰撞 / 传送带运弹 / 场景障碍密度');
{
  const dt=1/60,makeBomb=(c,r)=>({cx:c,cy:r,power:1,fuse:100,ownerId:'npc',freeFor:null});
  for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){
    const b=makeBomb(7,6),p=makePlayer('p1',7-d[0]*3,6-d[1]*3),w=makeWorld(emptyMap(),[p]);w.bombs=[b];
    for(let i=0;i<90;i++)MO.step(w,p,d[0],d[1],dt);
    const dist=Math.hypot(p.x-G.centerX(7),p.y-G.centerY(6));
    ok(dist>=31&&dist<36,'方向 '+d+' 只在贴近弹身时阻挡，距离不再按整格扩张',String(dist));
    const x=p.x,y=p.y;for(let i=0;i<8;i++)MO.step(w,p,-d[0],-d[1],dt);
    ok(Math.hypot(p.x-G.centerX(7),p.y-G.centerY(6))>dist+20,'贴住炸弹后可以直接朝反方向离开');
  }
  const w=makeWorld(emptyMap(),[makePlayer('p1',7,6)]),p=w.players[0],b=makeBomb(7,6);w.bombs=[b];
  p.x=G.centerX(7)-26;p.y=G.centerY(6)+26;
  ok(G.canStand(w.map,w.bombs,p.x,p.y,CFG.BOX,p.id),'截图中斜角有明显空隙的位置不会被炸弹整格碰撞卡住');
  const oldX=p.x;MO.step(w,p,-1,0,dt);ok(p.x<oldX,'斜角空隙处可以自由远离炸弹');
  const kw=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),kp=kw.players[0],kb=makeBomb(5,5);
  kw.bombs=[kb];kp.x-=32;ok(MO.kickCheck(kw,kp,1,0),'真正靠近时可以踢弹');
  const initial=G.bombPosition(kb).x;R.updateBombs(kw,dt);
  ok(Math.abs(G.bombPosition(kb).x-initial-CFG.KICK_SPEED*CFG.TILE*dt)<1e-6,
    '踢弹从原位置连续向前移动，第一帧不会显示到上一格');
  for(let i=0;i<9;i++)R.updateBombs(kw,dt);
  ok(G.canStand(kw.map,kw.bombs,initial,G.centerY(5),CFG.BOX,'other'),'炸弹离开后旧位置不残留空气墙');
  const offset=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),ob=makeBomb(5,5),op=offset.players[0];
  ob.x=G.centerX(5)+18;ob.y=G.centerY(5);offset.bombs=[ob];op.x=ob.x-32;
  ok(G.col(op.x)===ob.cx&&MO.kickCheck(offset,op,1,0),'炸弹偏离格心时仍能从实际接触位置踢动，不依赖旧目标格');
  op.maxBombs=2;op.x=G.centerX(5);ob.cx=6;ob.x=G.centerX(5)+30;
  ok(!R.tryPlaceBomb(offset,op),'移动炸弹进入邻格后，不能在其弹身附近重叠放置另一颗炸弹');
  const overlap=makeWorld(emptyMap(),[makePlayer('p1',5,5),makePlayer('p2',5,5)]);
  R.tryPlaceBomb(overlap,overlap.players[0]);
  for(let i=0;i<24;i++){MO.step(overlap,overlap.players[1],1,0,dt);R.updateBombs(overlap,dt);}
  ok(overlap.players[1].x>G.centerX(6),'别人脚下新出现的炸弹不会把原先重叠的玩家锁死');
  ok(!overlap.bombs[0].passFor.includes('p2'),'重叠玩家离开弹身后通行豁免结束');
  function factory(){const rng=BI.makeRng(79),lvl=BI.levelgen.generate(rng,{theme:'factory',mode:'adventure'});return makeWorld(lvl.map,[makePlayer('p1',1,1)]);}
  const fw=factory(),path=fw.map.landmark.path,fb=makeBomb(path[0][0],path[0][1]);fw.bombs=[fb];
  const start=G.bombPosition(fb);R.updateBombs(fw,.25);
  ok(Math.abs(G.bombPosition(fb).x-start.x-1.65*CFG.TILE*.25)<1e-6,'炸弹以实际带速连续运送，不需要踢弹道具');
  let corners=new Set();
  for(let i=0;i<Math.round((path.length/1.65-.25)/dt);i++){
    R.updateBombs(fw,dt);corners.add(fb.cx+','+fb.cy);
  }
  ok(Math.hypot(G.bombPosition(fb).x-start.x,G.bombPosition(fb).y-start.y)<2&&[[4,3],[10,3],[10,9],[4,9]].every(c=>corners.has(c.join())),
    '炸弹完成一整圈传送带，并正确通过四个转角');
  const blocked=factory(),bb=makeBomb(5,3);blocked.bombs=[bb];G.set(blocked.map,6,3,T.BRICK);
  R.updateBombs(blocked,1);
  ok(G.bombPosition(bb).x>G.centerX(5)&&G.bombPosition(bb).x+CFG.BOMB_RADIUS<=6*CFG.TILE,
    '传送带上的炸弹可以移动到真实障碍前，不能穿过障碍');
  const queue=factory(),back=makeBomb(5,3),front=makeBomb(6,3);queue.bombs=[back,front];G.set(queue.map,7,3,T.BRICK);
  for(let i=0;i<120;i++)R.updateBombs(queue,dt);
  ok(G.bombPosition(front).x-G.bombPosition(back).x>=CFG.BOMB_RADIUS*2,
    '传送带上的两颗炸弹被挡时排队，不重叠');
  const stop=factory(),enemy=makeBomb(5,3),player=makeBomb(8,3);enemy.byEnemy=true;stop.bombs=[enemy,player];stop.timeStop={remaining:3};
  R.updateBombs(stop,.5);
  ok(!Number.isFinite(enemy.x)&&enemy.fuse===100&&G.bombPosition(player).x>G.centerX(8),
    '小诺时停冻结敌弹运送和引信，玩家炸弹正常随带移动');
  const contact=factory(),cb=makeBomb(5,3),cp=contact.players[0];cp.x=G.centerX(7);cp.y=G.centerY(3);contact.bombs=[cb];
  for(let i=0;i<120;i++)R.updateBombs(contact,dt);
  ok(cp.x-G.bombPosition(cb).x>=31,'被传送带运来的炸弹不会挤入玩家身体并将其锁死');
  let densityBad=0,pocketsBad=0,themeBad=0;
  for(const theme of ['forest','factory','park'])for(let seed=1;seed<=24;seed++){
    const rng=BI.makeRng(seed),lvl=BI.levelgen.generate(rng,{theme,mode:'adventure'}),nw=makeWorld(lvl.map,[makePlayer('p1',1,1)]);
    BI.entities.spawn(nw,BI.entities.countFor(1),1,rng);
    if(BI.match.countBricks(nw.map)<40)densityBad++;
    nw.enemies.forEach(e=>{const c=G.col(e.x),r=G.row(e.y),area=BI.levelgen.bfs(nw.map,G.idx(c,r),v=>v===T.EMPTY);
      if(Array.from(area).filter(Boolean).length<10||[[1,0],[-1,0],[0,1],[0,-1]].filter(d=>G.at(nw.map,c+d[0],r+d[1])===T.EMPTY).length<2)pocketsBad++;
    });
    const bossLevel=BI.levelgen.generateBoss(BI.makeRng(seed),'',theme),bw=makeWorld(bossLevel.map,[makePlayer('p1',1,1)]);
    BI.entities.spawn(bw,1,5,BI.makeRng(seed));
    if(bossLevel.theme!==theme||bw.map.length!==195||!bw.map.landmark||BI.match.countBricks(bw.map)<40||bw.enemies[0].type!=='boss')themeBad++;
  }
  ok(!densityBad,'72张开局地图在怪物出生后均保留至少40个可破坏障碍',String(densityBad));
  ok(!pocketsBad,'增加障碍后仍保留怪物两个空出口及十格活动空间',String(pocketsBad));
  ok(!themeBad,'72张 BOSS 地图全部使用原三场景，保留设施与足够障碍',String(themeBad));
}

group('28. 推弹手套 / 木马运弹 / 古树障碍 / 索敌成长与拾取');
{
  const AI=BI.ai,EN=BI.entities,DG=BI.danger,dt=1/60;
  const bomb=(c,r)=>({cx:c,cy:r,power:1,fuse:2.4,ownerId:'other',freeFor:null});
  for(const dir of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const p=makePlayer('p1',5,5),w=makeWorld(emptyMap(),[p]),b=bomb(5+dir[0],5+dir[1]);
    p.x+=dir[0]*16;p.y+=dir[1]*16;R.applyItem(p,'glove','adventure');w.bombs=[b];
    ok(MO.kickCheck(w,p,...dir)&&b.slide,'手套支持方向 '+dir+' 的接触推弹');
    for(let i=0;i<60;i++)R.updateBombs(w,dt);
    ok(w.bombs.includes(b)&&!b.slide&&w.stats.explosions===0&&Math.abs(b.fuse-1.4)<.001,'推弹方向 '+dir+' 在尽头停止，引信保持连续倒数');
    for(let i=0;i<120&&w.bombs.includes(b);i++)R.updateBombs(w,dt);
    ok(!w.bombs.includes(b)&&w.flames.length===1&&w.stats.explosions===1,'推弹方向 '+dir+' 只在原引信结束时爆炸一次');
    ok(G.at(w.map,b.cx,b.cy)===T.EMPTY,'推弹爆点在最后可站立格，不进入墙内');
  }
  const blocked=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),bp=blocked.players[0],bb=bomb(6,5);
  G.set(blocked.map,8,5,T.BRICK);bp.x+=16;bp.glove=true;blocked.bombs=[bb];
  MO.kickCheck(blocked,bp,1,0);
  R.updateBombs(blocked,.1);
  ok(blocked.bombs.includes(bb)&&bb.slide&&Math.abs(bb.fuse-2.3)<.001,'手套弹滑行途中继续消耗原引信');
  const slideView=DG.timeline(blocked);
  ok(Math.abs(slideView.times[0]-2.3)<.001&&Math.abs(DG.at(Object.assign({},blocked,{danger:DG.compute(blocked)}),7,5)-2.3)<.001,
    'AI 按推弹的真实剩余引信预测沿途爆炸，不再视为即时爆炸');
  R.updateBombs(blocked,.3);
  ok(blocked.bombs.includes(bb)&&!bb.slide&&bb.cx===7&&G.at(blocked.map,8,5)===T.BRICK&&blocked.stats.explosions===0,
    '手套弹在障碍前只停下，不立即爆炸或破坏障碍');
  R.updateBombs(blocked,bb.fuse+.01);
  ok(!blocked.bombs.length&&G.at(blocked.map,8,5)===T.EMPTY,'受阻后的炸弹在原引信到时才爆炸并破坏障碍');
  const shortFuse=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),short= bomb(6,5);
  short.fuse=.03;shortFuse.players[0].x+=16;shortFuse.players[0].glove=true;shortFuse.bombs=[short];
  MO.kickCheck(shortFuse,shortFuse.players[0],1,0);R.updateBombs(shortFuse,.02);R.updateBombs(shortFuse,.02);
  ok(!shortFuse.bombs.length&&short.cx===6&&shortFuse.stats.explosions===1,'引信在滑行途中耗尽时就地爆炸，不延长到终点');
  const chain=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),cp=chain.players[0],cb=bomb(6,5),target=bomb(8,5);
  cp.x+=16;cp.glove=true;chain.bombs=[cb,target];MO.kickCheck(chain,cp,1,0);
  for(let i=0;i<60;i++)R.updateBombs(chain,dt);
  ok(chain.stats.explosions===0&&chain.bombs.length===2&&!cb.slide,'推动的炸弹碰到另一颗炸弹时只停止，不立即连锁');
  for(let i=0;i<120&&chain.bombs.length;i++)R.updateBombs(chain,dt);
  ok(chain.stats.explosions===2&&!chain.bombs.length,'推弹原引信到时正常连锁，无数组错误');
  const actor=makeWorld(emptyMap(),[makePlayer('p1',5,5),makePlayer('p2',8,5)]),ab=bomb(6,5);
  actor.players[0].glove=true;actor.players[0].x+=16;actor.bombs=[ab];MO.kickCheck(actor,actor.players[0],1,0);
  for(let i=0;i<60;i++)R.updateBombs(actor,dt);
  ok(actor.bombs.includes(ab)&&!ab.slide&&actor.stats.explosions===0&&actor.players[1].x-G.bombPosition(ab).x>=CFG.BOMB_RADIUS+CFG.PLAYER_BOMB_RADIUS,
    '推弹接触玩家时受阻停下，不挤入身体也不提前爆炸');

  const lvl=BI.levelgen.generate(BI.makeRng(88),{theme:'park',mode:'adventure'}),park=makeWorld(lvl.map,[makePlayer('p1',1,1)]);
  const ride=park.map.landmark.path,pb=bomb(...ride[0]);pb.fuse=100;park.bombs=[pb];
  const start=G.bombPosition(pb),corners=new Set();
  for(let i=0;i<Math.round(ride.length/1.8/dt);i++){
    R.updateBombs(park,dt);corners.add(pb.cx+','+pb.cy);
  }
  ok(Math.hypot(G.bombPosition(pb).x-start.x,G.bombPosition(pb).y-start.y)<2&&
    [[5,4],[9,4],[9,8],[5,8]].every(c=>corners.has(c.join())), '木马携带炸弹完整绕行一圈，四个转角均正常');
  ok(BI.scenery.bombForecast(park,pb,2).length>2,'木马运弹轨迹被纳入怪物逃生预测');
  park.timeStop={remaining:3};pb.byEnemy=true;const frozen=G.bombPosition(pb);
  R.updateBombs(park,.5);ok(G.bombPosition(pb).x===frozen.x&&G.bombPosition(pb).y===frozen.y,'小诺时停冻结木马上的敌方炸弹');
  let emptyRing=0;
  for(let seed=1;seed<=72;seed++){
    const rng=BI.makeRng(seed),level=BI.levelgen.generate(rng,{theme:'forest',mode:'adventure'}),w=makeWorld(level.map,[makePlayer('p1',1,1)]);
    EN.spawn(w,EN.countFor(5),5,rng);let bricks=0;
    for(let r=4;r<=8;r++)for(let c=5;c<=9;c++)if((c===5||c===9||r===4||r===8)&&G.at(w.map,c,r)===T.BRICK)bricks++;
    if(bricks<3)emptyRing++;
  }
  ok(!emptyRing,'72张森林图在怪物出生后古树周围仍保留至少三块可破坏障碍',String(emptyRing));

  const targeting=makeWorld(emptyMap(),[makePlayer('p1',1,1),makePlayer('p2',10,5)]),seeker=EN.create('gugu',8,5,8);
  targeting.enemies=[seeker];
  ok(AI.target(targeting,seeker).id==='p2','怪物优先锁定更近的存活玩家');
  targeting.players[1].alive=false;
  ok(AI.target(targeting,seeker).id==='p1','目标死亡后重新索敌');
  const low=AI.aggression(EN.create('gugu',5,5,1)),high=AI.aggression(EN.create('gugu',5,5,15));
  ok(high.range>low.range&&high.hunt>low.hunt&&high.cooldown<low.cooldown&&high.abilityGap<low.abilityGap,
    '关卡提高后索敌范围、追击倾向、投弹和BOSS施法频率同步增强');
  const tunnel=emptyMap();for(let r=1;r<12;r++)G.set(tunnel,7,r,T.BRICK);
  const digging=makeWorld(tunnel,[makePlayer('p1',11,5)]),digger=EN.create('gugu',6,5,5);
  digging.enemies=[digger];digger.bombCd=0;DG.compute(digging);AI.decide(digging,digger);
  ok(digger.windup>0,'玩家在障碍另一侧时怪物会主动预备炸开通路');
  for(let i=0;i<300;i++){
    digging.time+=dt;DG.compute(digging);AI.updateEnemy(digging,digger,dt);
    R.updateBombs(digging,dt);R.updateFlames(digging,dt);R.updateEnemies(digging,dt);
  }
  ok(G.at(tunnel,7,5)===T.EMPTY&&digger.alive,'怪物真实炸开挡路障碍并安全撤离');
  const cached=AI.field(digging,digger);G.set(tunnel,7,4,T.EMPTY);
  ok(AI.field(digging,digger)!==cached,'障碍变化后立即重算寻路，避免继续沿旧地图绕行');

  const looting=makeWorld(emptyMap(),[makePlayer('p1',1,1)]),looter=EN.create('claude',9,7,3);
  looting.enemies=[looter];looting.items=[{c:10,r:7,type:'speed'}];looter.bombCd=100;
  DG.compute(looting);AI.decide(looting,looter);
  ok(looter.tc===10&&looter.tr===7,'怪物会主动走向安全可达的附近道具');
  const oldSpeed=looter.speed;
  for(let i=0;i<65;i++){looting.time+=dt;DG.compute(looting);AI.updateEnemy(looting,looter,dt);R.updateItems(looting,dt);}
  ok(!looting.items.length&&looter.speed>oldSpeed&&looter.picked.speed===1,'怪物拾取鞋子后实际移动速度提高');
  const protectedWorld=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),guard=EN.create('boss',5,5,5);
  protectedWorld.enemies=[guard];
  for(const type of ['fire','bomb','shield','star','glove','fruit']){
    protectedWorld.items=[{type,c:5,r:5}];protectedWorld.players[0].x=G.centerX(1);
    R.updateItems(protectedWorld,dt);
    ok(!protectedWorld.items.length&&guard.picked[type]===1,'BOSS 可以拾取并应用 '+type+' 道具');
  }
  ok(guard.hp===8&&guard.maxHp===8&&guard.power===3&&guard.maxBombs===2&&guard.glove,
    'BOSS 拾取成长道具生效，果实转护盾且不额外增加八点生命');
  protectedWorld.players[0].x=guard.x;R.updateDamage(protectedWorld,dt);
  ok(!protectedWorld.players[0].alive&&protectedWorld.players[0].lives===2,'怪物拾取星星后碰撞造成一次普通伤害');
  protectedWorld.flames=[{cells:[[5,5]],t:1}];R.updateEnemies(protectedWorld,dt);
  ok(guard.hp===8&&guard.shield===1,'敌方无敌星星保护生命与未消耗的护盾');
  guard.starTime=0;R.updateEnemies(protectedWorld,dt);
  ok(guard.hp===8&&guard.shield===0,'敌方护盾吸收一次伤害后消失');
  R.updateEnemies(protectedWorld,CFG.SHIELD_INVULN_TIME+.01);R.updateEnemies(protectedWorld,dt);
  ok(guard.hp===7,'护盾耗尽后敌人正常受伤');
  const bossWorld=makeWorld(emptyMap(),[makePlayer('p1',1,1)]);bossWorld.mode='adventure';bossWorld.map.bossBattle=true;
  EN.spawn(bossWorld,EN.countFor(5),5,BI.makeRng(20));bossWorld.match=BI.match.create('adventure');bossWorld.match.level=5;
  R.killEnemy(bossWorld,bossWorld.enemies[0]);BI.match.update(bossWorld,dt);
  ok(BI.match.countEnemies(bossWorld)===2&&!bossWorld.match.levelClearAt,'只打倒鲁鲁旦时仍需清理随从才过关');
  const caster=EN.create('boss',7,7,5);caster.hp=6;EN.syncBossPhase(bossWorld,caster);caster.abilityCd=0;bossWorld.rng.chance=()=>true;
  AI.bossAbility(bossWorld,caster,dt);
  ok(caster.abilityCd>=8&&caster.abilityCd<=8.8,'第五关认真阶段的毒刺间隔削弱为8至8.8秒');
}

group('29. 未来：放弹6次或击杀通灵 / 减速与原速度逃生判断');
{
  const SK=BI.skills,EN=BI.entities,AI=BI.ai,DG=BI.danger,dt=1/60;
  function future(){const p=makePlayer('p1',5,5);p.assetId='weilai';p.soulEvolved=false;p.soulBombs=0;
    const w=makeWorld(emptyMap(),[p]);w.mode='adventure';return {w,p};}
  const {w,p}=future(),near=EN.create('gugu',6,6,1),diagonal=EN.create('claude',4,4,1),far=EN.create('oupao',7,5,1);
  w.enemies=[near,diagonal,far];const opponent=makePlayer('p2',5,6);w.players.push(opponent);
  ok(BI.SKILLS.weilai.passive&&BI.SKILLS.weilai.normal.rate===.45&&BI.SKILLS.weilai.evolved.rate===.75,'未来为被动技能，基础减速45%、通灵减速75%');
  ok(!SK.cast(w,p)&&!p.skillCd,'未来无需主动施放，Q键不消耗冷却也不制造脉冲');
  ok(R.tryPlaceBomb(w,p)&&near.soulSlowTime===2&&diagonal.soulSlowTime===2&&near.soulSlowRate===.45&&!far.soulSlowTime,
    '成功放弹后只减速3×3正方形范围，包含角落而不扩大至第二圈');
  ok(opponent.soulSlowTime===2&&!p.soulSlowTime,'被动可影响敌方玩家，不减速自己');
  SK.update(w,1);const effectCount=w.skillEffects.length;
  ok(!R.tryPlaceBomb(w,p)&&near.soulSlowTime===1&&w.skillEffects.length===effectCount,'重复格放弹失败时不刷新减速、不产生额外特效');
  w.bombs=[];R.tryPlaceBomb(w,p);
  ok(near.soulSlowRate===.45&&near.soulSlowTime===2&&Math.abs(SK.slowFactor(near)-.55)<1e-9,'重复普通脉冲刷新至2秒，不叠乘减速');
  SK.update(w,2.01);ok(!near.soulSlowTime&&SK.slowFactor(near)===1,'两秒结束后准确恢复原速度');
  p.alive=false;w.bombs=[];ok(!R.tryPlaceBomb(w,p)&&!near.soulSlowTime,'阵亡时不能放弹触发被动');

  const evolved=future();evolved.p.soulEvolved=true;
  const corner=EN.create('gugu',7,7,1),beyond=EN.create('gugu',8,5,1),boss=EN.create('boss',5,3,5);
  evolved.w.enemies=[corner,beyond,boss];R.tryPlaceBomb(evolved.w,evolved.p);
  ok(corner.soulSlowRate===.75&&corner.soulSlowTime===3&&!beyond.soulSlowTime&&boss.soulSlowRate===.75,
    '通灵后5×5范围减速75%、持续3秒，同时影响小怪和BOSS');
  const baseSpeed=corner.speed;evolved.w.bombs=[];corner.bombCd=100;
  AI.apply(corner,{x:1,y:0,c:8,r:7});const startX=corner.x;AI.updateEnemy(evolved.w,corner,.2);
  ok(Math.abs(corner.x-startX-baseSpeed*CFG.TILE*.2*.25)<.00001&&corner.speed===baseSpeed,
    '实际怪物移动只剩25%，不改变永久速度或道具加成');
  const escape=future(),runner=EN.create('gugu',8,7,1);escape.w.enemies=[runner];
  const trial={cx:8,cy:7,power:1,fuse:3.6,ownerId:runner.id};
  const routeBefore=AI.findEscape(escape.w,runner,trial);runner.soulSlowTime=3;runner.soulSlowRate=.75;
  const routeAfter=AI.findEscape(escape.w,runner,trial);
  ok(routeBefore&&JSON.stringify(routeBefore)===JSON.stringify(routeAfter),'减速不计入逃生计算，原速度判断与路径保持一致');
  const weaker=makePlayer('p2',7,7);weaker.assetId='weilai';evolved.w.players.push(weaker);SK.onBombPlaced(evolved.w,weaker,7,7);
  ok(corner.soulSlowRate===.75&&corner.soulSlowTime===3,'弱形态脉冲不能覆盖仍生效的强形态减速');
  SK.update(evolved.w,3.01);ok(SK.slowFactor(corner)===1,'通灵减速三秒后消失');
  const victim=makePlayer('p2',6,5),vs=future();vs.w.players.push(victim);vs.p.soulEvolved=true;R.tryPlaceBomb(vs.w,vs.p);
  vs.w.bombs=[];victim.slowTime=1;const vsStart=victim.x;MO.step(vs.w,victim,1,0,.1);
  ok(Math.abs(victim.x-vsStart-CFG.SPEED_BASE*CFG.TILE*.1*.25)<.0001,'双人模式未来被动真实减速对手，多个减速只取最强倍率');

  // 击杀通灵：打死任意一只敌方，通灵条直接满（与放弹累计并列的第二条路）
  const killed=future(),mob=EN.create('gugu',6,5,1);killed.w.enemies=[mob];
  R.detonate(killed.w,{cx:5,cy:5,power:1,ownerId:'p1'});R.updateEnemies(killed.w,dt);
  ok(killed.p.soulEvolved&&killed.p.soulBombs===BI.SKILLS.weilai.bombsToEvolve&&mob.killedBy==='p1',
    '一次都没放弹时，击杀一只敌人直接把通灵条打满并立刻通灵',
    'soulBombs='+killed.p.soulBombs);
  const awakenCount=killed.w.skillEffects.filter(fx=>fx.type==='soulAwaken').length;
  R.killEnemy(killed.w,mob,'p1');
  ok(awakenCount===1&&killed.w.skillEffects.filter(fx=>fx.type==='soulAwaken').length===1,'重复死亡结算不重复觉醒');
  killed.p.soulEvolved=true;killed.p.soulBombs=6;SK.reset(killed.p);
  ok(killed.p.soulEvolved&&killed.p.soulBombs===6,'同关重生清理临时技能，保留通灵进度');
  SK.resetLevel(killed.p);ok(!killed.p.soulEvolved&&killed.p.soulBombs===0,'换关单独清空通灵形态与进度');
  // 只有「未来的击杀」算数：别人的击杀、无归属击杀都不通灵
  const rival=future(),rivalMob=EN.create('gugu',6,5,1),other=makePlayer('p2',1,1);
  other.assetId='xiaonuo';rival.w.players.push(other);rival.w.enemies=[rivalMob];
  R.killEnemy(rival.w,rivalMob,'p2');
  ok(!rival.p.soulEvolved&&!rival.p.soulBombs&&other.soulBombs===undefined,'别的角色击杀不会给未来加通灵进度');
  for(const owner of ['enemy',undefined]){
    const noCredit=future(),target=EN.create('gugu',6,5,1);noCredit.w.enemies=[target];
    R.detonate(noCredit.w,{cx:5,cy:5,power:1,ownerId:owner});R.updateEnemies(noCredit.w,dt);
    ok(!target.alive&&!noCredit.p.soulEvolved&&!noCredit.p.soulBombs,'无归属击杀不触发通灵：'+owner);
  }
  const assisted=future(),slowed=EN.create('gugu',6,5,1);assisted.w.enemies=[slowed];
  R.tryPlaceBomb(assisted.w,assisted.p);assisted.w.bombs=[];assisted.w.time=3.6;
  SK.update(assisted.w,2.1);R.detonate(assisted.w,{cx:6,cy:5,power:1,ownerId:slowed.id});R.updateEnemies(assisted.w,dt);
  ok(assisted.p.soulEvolved&&slowed.killedBy==='p1','减速战术击杀同样算未来的击杀，直接通灵');
  const expired=future(),late=EN.create('gugu',6,5,1);expired.w.enemies=[late];R.tryPlaceBomb(expired.w,expired.p);
  expired.w.time=20;R.killEnemy(expired.w,late,late.id);
  ok(!expired.p.soulEvolved&&expired.p.soulBombs===1,'过期减速不能无限认领后续自爆');
  const guarded=future(),protectedMob=EN.create('gugu',6,5,1);protectedMob.shield=1;guarded.w.enemies=[protectedMob];
  R.detonate(guarded.w,{cx:5,cy:5,power:1,ownerId:'p1'});R.updateEnemies(guarded.w,dt);
  ok(protectedMob.alive&&!guarded.p.soulEvolved,'仅破盾但没有击杀时不会提前通灵');
  const bossOnly=future(),lastBoss=EN.create('boss',6,5,5);bossOnly.w.enemies=[lastBoss];R.killEnemy(bossOnly.w,lastBoss,'p1');
  ok(bossOnly.p.soulEvolved,'击败BOSS同样算一次击杀，直接通灵');
  const chained=future(),chainMob=EN.create('gugu',7,5,1);chained.w.enemies=[chainMob];
  chained.w.bombs=[{cx:6,cy:5,power:1,ownerId:'p1',freeFor:null}];
  R.detonate(chained.w,{cx:5,cy:5,power:1,ownerId:'enemy'});R.updateEnemies(chained.w,dt);
  ok(chained.p.soulEvolved&&chainMob.killedBy==='p1','连锁引爆保留炸弹归属，击杀同样触发通灵');

  const charging=future();charging.w.enemies=[EN.create('gugu',7,7,1)];
  const need=BI.SKILLS.weilai.bombsToEvolve;
  ok(need===6,'通灵条缩短为 6 次放弹',String(need));
  for(let n=1;n<need;n++){
    charging.w.bombs=[];R.tryPlaceBomb(charging.w,charging.p);
    ok(charging.p.soulBombs===n&&!charging.p.soulEvolved,'第'+n+'次成功放弹准确累计，未满 '+need+' 次不通灵');
  }
  const countBefore=charging.p.soulBombs;
  ok(!R.tryPlaceBomb(charging.w,charging.p)&&charging.p.soulBombs===countBefore,'放弹被同格炸弹阻止时不增加充能');
  charging.w.bombs=[];R.tryPlaceBomb(charging.w,charging.p);
  ok(charging.p.soulEvolved&&charging.p.soulBombs===need&&charging.p.soulAwakenTime===1.6,'第'+need+'次成功放弹触发1.6秒通灵动画');
  ok(charging.w.enemies[0].soulSlowRate===.75,'通灵后的那颗炸弹已使用5×5减速效果');
  const awakenedFx=charging.w.skillEffects.filter(fx=>fx.type==='soulAwaken');
  ok(awakenedFx.length===1&&awakenedFx[0].ownerId==='p1','通灵动画只有一次，并跟随正确角色');
  charging.w.bombs=[];R.tryPlaceBomb(charging.w,charging.p);
  ok(charging.p.soulBombs===need&&charging.w.skillEffects.filter(fx=>fx.type==='soulAwaken').length===1,'后续放弹不重复觉醒，进度封顶');
  SK.update(charging.w,1.7);ok(charging.p.soulEvolved&&!charging.p.soulAwakenTime&&!charging.w.skillEffects.some(fx=>fx.type==='soulAwaken'),'通灵动画结束不取消通灵，特效对象正常回收');
  SK.resetLevel(charging.p);charging.w.bombs=[];R.tryPlaceBomb(charging.w,charging.p);
  ok(charging.p.soulBombs===1&&!charging.p.soulEvolved,'新关卡从第一颗炸弹重新累计');
  const normal=makePlayer('p1',5,5);normal.assetId='xiaonuo';const normalWorld=makeWorld(emptyMap(),[normal]);R.tryPlaceBomb(normalWorld,normal);
  ok(!normal.soulBombs&&!normalWorld.skillEffects,'其他角色放弹不产生未来的充能或特效');
  ok(BI.SKILLS.weilai.name==='迁境奇点','未来的技能名称统一为迁境奇点');
  ok(Object.keys(BI.CHARACTER_LORE).length===6&&['xiaonuo','axiu','arui','xiaoyan','xiaotian'].every(id=>BI.CHARACTER_LORE[id].story&&BI.CHARACTER_LORE[id].sources.length),
    '五位原角色均有可追溯的官网背景，未来保留用户设定');
}

/* ============================================================
 * 30. 开始界面壁纸素材
 *
 * 装饰图缺失不该挡住开局，但「素材真的在、而且够清楚」是能静态验证的：
 * 直接读 PNG 文件头拿尺寸，不依赖任何图像库。
 * 取景算法（assets.coverRect）在浏览器测试里单独测。
 * ============================================================ */
group('30. 开始界面壁纸：素材就位且清晰度够');
{
  const fsx = require('fs');
  const file = path.join(ROOT, 'assets', 'ui', 'menu-wallpaper.png');
  ok(fsx.existsSync(file), '壁纸已放进运行期素材目录 assets/ui/');
  if (fsx.existsSync(file)) {
    const buf = fsx.readFileSync(file);
    const isPng = buf.length > 24 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    ok(isPng, '壁纸是真正的 PNG（按文件头判断，不看扩展名）');
    const sw = isPng ? buf.readUInt32BE(16) : 0, sh = isPng ? buf.readUInt32BE(20) : 0;
    // 与 coverRect 同一套算法：铺满菜单要裁出来的那一块
    const cover = Math.max(CFG.VIEW_W / sw, CFG.VIEW_H / sh);
    const cw = CFG.VIEW_W / cover, ch = CFG.VIEW_H / cover;
    ok(cw >= CFG.VIEW_W * 2 && ch >= CFG.VIEW_H * 2,
      '壁纸裁切后仍不低于 2 倍菜单尺寸，高清屏放大不会糊',
      sw + 'x' + sh + ' → 裁 ' + Math.round(cw) + 'x' + Math.round(ch));
    ok(sw > CFG.VIEW_W && sh > CFG.VIEW_H, '壁纸比画布大，不需要拉大充数');
  }
}

group('31. 无敌碰撞普通伤害 / 破盾保护 / 推弹计时一致性');
{
  const dt=1/60,EN=BI.entities;
  function contactWorld(shield){
    const p=makePlayer('p1',5,5);p.starTime=6;
    const w=makeWorld(emptyMap(),[p]),boss=EN.create('boss',5,5,5);boss.shield=shield||0;w.enemies=[boss];
    return {w,p,boss};
  }
  function contactFrames(w,count){for(let i=0;i<count;i++){w.time+=dt;R.updateDamage(w,dt);R.updateEnemies(w,dt);}}
  const unshielded=contactWorld(0);R.updateDamage(unshielded.w,dt);
  ok(unshielded.boss.hp===7&&unshielded.boss.alive&&unshielded.w.stats.kills===0,'无敌玩家首次碰撞8血BOSS只扣1血，不计击杀');
  ok(unshielded.boss.invuln===CFG.ENEMY_HIT_INVULN,'无敌碰撞与炸弹共用BOSS受击保护时长');
  contactFrames(unshielded.w,30);
  ok(unshielded.boss.hp===7,'持续贴住BOSS半秒不重复扣血');
  contactFrames(unshielded.w,24);
  ok(unshielded.boss.hp===6,'BOSS受击保护结束后，持续无敌碰撞才再次扣1血');

  const shielded=contactWorld(1);let bossBreaks=0;shielded.w.onShieldBreak=()=>bossBreaks++;
  R.updateDamage(shielded.w,dt);
  ok(shielded.boss.hp===8&&shielded.boss.shield===0&&bossBreaks===1,'无敌碰撞先消耗BOSS护盾，不扣血、不秒杀');
  ok(shielded.boss.invuln===1.5,'BOSS破盾后获得1.5秒保护');
  contactFrames(shielded.w,84);
  ok(shielded.boss.hp===8&&shielded.boss.alive,'破盾后持续碰撞1.4秒仍不受伤');
  contactFrames(shielded.w,12);
  ok(shielded.boss.hp===7&&bossBreaks===1&&shielded.w.stats.kills===0,'破盾保护结束后才受普通伤害，碎盾反馈只触发一次');

  const small=contactWorld(0);small.w.enemies=[EN.create('gugu',5,5,1)];small.w.enemies[0].shield=1;
  R.updateDamage(small.w,dt);
  ok(small.w.enemies[0].alive&&small.w.enemies[0].hp===1&&!small.w.enemies[0].shield,'一血小怪的护盾同样能挡下无敌碰撞');
  contactFrames(small.w,84);ok(small.w.enemies[0].alive,'带盾小怪破盾后的短暂无敌不会被下一帧碰撞绕过');
  contactFrames(small.w,12);ok(!small.w.enemies[0].alive&&small.w.stats.kills===1,'保护结束后普通伤害正常击败一血小怪');
  contactFrames(small.w,30);ok(small.w.stats.kills===1,'持续碰撞不会重复结算死亡或掉落');

  const two=contactWorld(1),second=makePlayer('p2',5,5);second.starTime=6;two.w.players.push(second);
  R.updateDamage(two.w,dt);
  ok(two.boss.hp===8&&two.boss.shield===0&&two.boss.invuln===CFG.SHIELD_INVULN_TIME,'同帧两名无敌玩家触碰时，第一下破盾，第二下被保护挡住');
  two.boss.starTime=3;two.boss.invuln=0;two.boss.shield=1;R.updateDamage(two.w,dt);
  ok(two.boss.hp===8&&two.boss.shield===1,'敌人拾取无敌星星时也免疫碰撞伤害，不消耗护盾');

  const victim=makePlayer('p1',5,5),attacker=makePlayer('p2',5,5),mixed=makeWorld(emptyMap(),[victim,attacker]);
  victim.shield=1;attacker.starTime=6;let playerBreaks=0;mixed.onShieldBreak=()=>playerBreaks++;
  mixed.flames=[{cells:[[5,5]],t:10}];mixed.poison=[{c:5,r:5,warn:0,life:10}];
  R.updateDamage(mixed,dt);
  ok(victim.alive&&victim.lives===3&&!victim.shield&&victim.invuln===CFG.SHIELD_INVULN_TIME&&playerBreaks===1,
    '玩家同帧受到火焰、毒叉、无敌碰撞，破盾后仍存活');
  for(let i=0;i<84;i++)R.updateDamage(mixed,dt);
  ok(victim.alive&&victim.lives===3,'玩家破盾后1.4秒内持续处于多种伤害中也不扣命');
  for(let i=0;i<12;i++)R.updateDamage(mixed,dt);
  ok(!victim.alive&&victim.lives===2&&playerBreaks===1,'保护结束后再受伤才扣一条命，不重复碎盾或扣命');

  const frozen=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),frozenBomb={cx:6,cy:5,power:1,fuse:1.2,ownerId:'npc',freeFor:null,byEnemy:true};
  frozen.players[0].x+=16;frozen.players[0].glove=true;frozen.bombs=[frozenBomb];MO.kickCheck(frozen,frozen.players[0],1,0);
  frozen.timeStop={remaining:3};const before=G.bombPosition(frozenBomb);R.updateBombs(frozen,.5);
  ok(frozenBomb.fuse===1.2&&G.bombPosition(frozenBomb).x===before.x,'被手套推动的敌弹仍遵守小诺时停，运动与引信同时冻结');
  frozen.timeStop=null;R.updateBombs(frozen,.1);
  ok(Math.abs(frozenBomb.fuse-1.1)<.001&&G.bombPosition(frozenBomb).x>before.x,'时停结束后手套弹按原剩余引信继续移动和倒数');
}

group('32. 鲁鲁旦三阶段 / 暴走破墙 / 逃生与危险预判');
{
  const EN=BI.entities,AI=BI.ai,DG=BI.danger,dt=1/60;
  const w=makeWorld(emptyMap(),[makePlayer('p1',1,1)]),e=EN.create('boss',5,5,5);
  w.map.bossBattle=true;w.enemies=[e];const events=[];w.onBossPhase=(boss,phase)=>events.push(phase.id);
  const base=AI.moveSpeed(e);
  e.abilityCd=0;AI.bossAbility(w,e,60);AI.castForks(w,e);
  ok(e.phase===1&&!w.poison,'试探阶段即使技能倒计时归零也不能放毒叉');
  e.shield=1;R.hurtEnemy(w,e);
  ok(e.hp===8&&e.phase===1&&!events.length,'破盾不算掉血，不触发阶段切换');
  e.invuln=0;R.hurtEnemy(w,e);
  ok(e.hp===7&&e.phase===1&&AI.moveSpeed(e)===base,'7血仍为试探，保持基础速度');
  e.invuln=0;R.hurtEnemy(w,e);
  ok(e.hp===6&&e.phase===2&&events.join()==='2'&&Math.abs(AI.moveSpeed(e)/base-1.25)<1e-9,
    '6血立即进入认真，仅加速25%，阶段提示只触发一次');
  AI.bossAbility(w,e,1.79);ok(!w.poison,'阶段切换给予第一次毒叉的反应时间');
  AI.bossAbility(w,e,.02);ok(w.poison.length===6,'认真阶段的首次毒叉实际施放');
  e.invuln=0;R.hurtEnemy(w,e);ok(e.phase===2,'5血仍为认真');
  const middle=AI.aggression(e);e.invuln=0;R.hurtEnemy(w,e);
  ok(e.hp===4&&e.phase===2&&events.join()==='2','4血仍为认真，不提前切换怒火表情或解锁破墙');
  e.invuln=0;R.hurtEnemy(w,e);
  const rage=AI.aggression(e);EN.syncBossPhase(w,e);
  ok(e.hp===3&&e.phase===3&&events.join()==='2,3'&&AI.moveSpeed(e)===base*1.25,
    '3血进入暴走，速度不重复叠乘，提示不重复');
  ok(rage.hunt===1&&rage.range===9&&rage.cooldown<middle.cooldown&&rage.abilityGap===middle.abilityGap*CFG.BOSS_POISON_RAGE_FACTOR&&AI.bombQuota(e)>=2,
    '暴走优先追击，毒刺间隔缩短为认真阶段的80%，至少能维持两颗炸弹');
  w.poison=[];e.abilityCd=0;AI.bossAbility(w,e,dt);
  ok(w.poison.length===6&&e.abilityCd>=6.4&&e.abilityCd<=7.2,'第五关暴走毒刺间隔削弱为6.4至7.2秒');
  e.slowTime=2;e.slowFactor=.3;
  ok(AI.planningSpeed(e)===base*1.25,'暴走逃生计入阶段加速，不计入未来减速');
  e.slowTime=0;
  for(const hp of [8,6,4,3]){
    const bw=makeWorld(emptyMap(),[makePlayer('p1',1,1)]),be=EN.create('boss',5,5,5);be.hp=hp;bw.enemies=[be];bw.map.bossBattle=true;
    G.set(bw.map,6,5,T.HARD);G.set(bw.map,7,5,T.HARD);
    ok(AI.placeBomb(bw,be,5,5),'阶段 '+hp+'血 的BOSS能在有退路时投弹');
    const b=bw.bombs[0],geo=R.bombCells(bw,b);DG.compute(bw);
    ok(b.breakHard===(hp===3)&&geo.hardWalls.length===(hp===3?1:0)&&
      (DG.at(bw,6,5)>0)===(hp===3)&&DG.at(bw,7,5)===0,
      '阶段 '+hp+'血 炸弹范围与危险预判一致，墙体吸收本次爆炸');
    R.updateBombs(bw,b.fuse+.01);
    ok(G.at(bw.map,6,5)===(hp===3?T.EMPTY:T.HARD)&&G.at(bw.map,7,5)===T.HARD,
      '仅暴走弹实际破坏第一堵硬墙，后面的掩体保留到下一次爆炸');
    if(hp===3){
      ok(G.canStand(bw.map,[],G.centerX(6),G.centerY(5),CFG.BOX,'p1'),'硬墙破坏后可以正常通行');
      ok(!bw.items.some(it=>it.c===6&&it.r===5),'硬墙破坏不掉落软障碍道具');
    }
  }
  const protectedWorld=makeWorld(emptyMap());protectedWorld.map.landmark={c:7,r:6};
  G.set(protectedWorld.map,6,6,T.HARD);
  const centerBomb={cx:5,cy:6,power:4,breakHard:true,ownerId:'boss'};
  R.detonate(protectedWorld,centerBomb);
  R.detonate(protectedWorld,{cx:1,cy:1,power:10,breakHard:true,ownerId:'boss'});
  ok(G.at(protectedWorld.map,6,6)===T.HARD&&G.at(protectedWorld.map,0,1)===T.HARD&&G.at(protectedWorld.map,1,0)===T.HARD,
    '暴走炸弹保留中央设施和地图外围边界');
  const route=makeWorld(emptyMap(),[makePlayer('p1',8,5)]),hunter=EN.create('boss',5,5,5);
  route.enemies=[hunter];route.map.bossBattle=true;
  for(let r=1;r<12;r++)G.set(route.map,6,r,T.HARD);
  ok(AI.field(route,hunter)[5*15+5]===-1,'普通阶段不规划穿过整列硬墙');
  hunter.hp=3;EN.syncBossPhase(route,hunter);hunter.bombCd=0;DG.compute(route);
  ok(AI.field(route,hunter)[5*15+5]>0,'暴走阶段单独计算可炸硬墙的追击路径');
  AI.decide(route,hunter);
  ok(hunter.windup>0&&!hunter.dir,'暴走BOSS主动投弹开路，而不会直接走进硬墙');
  AI.updateEnemy(route,hunter,.71);
  ok(route.bombs.length===1&&route.bombs[0].breakHard&&hunter.escapePath.length>=2,
    '主动开路弹保留安全撤离路径');
  const normal=EN.create('gugu',5,5,5);
  ok(!EN.bossStage(normal)&&AI.bombQuota(normal)===1,'小怪不获得BOSS阶段、破墙与额外配额');
}

group('33. 十关冒险终点 / 关卡浓缩 / 最后一命判定');
{
  const EN=BI.entities,AI=BI.ai,MA=BI.match,dt=1/60;
  ok(CFG.ADVENTURE_LEVELS===10,'冒险固定为10关');
  ok([1,2,3,4,5,6,7,8,9,10].map(n=>EN.difficultyLevel(n)).join()==='1,2,3,4,5,7,9,11,13,15',
    '保留前五关，后五关覆盖原十五关的成长');
  ok(EN.countFor(5)===3&&EN.countFor(10)===5,'第5关两只随从，第10关四只随从');
  ok(EN.speedScale(10)===1.15&&AI.aggression(EN.create('boss',5,5,10)).abilityGap===7.2,
    '最终战保留原十五关速度，毒刺频率已下调');
  const w=makeWorld(emptyMap(),[makePlayer('p1',1,1)]);w.mode='adventure';w.match=MA.create('adventure');
  let next=0;w.onNextLevel=()=>next++;
  for(let level=1;level<10;level++){
    MA.update(w,dt);w.time=w.match.levelClearAt+.01;MA.update(w,dt);
    ok(w.match.level===level+1&&!w.match.over,'第 '+level+' 关清场后继续冒险');
  }
  const escort=EN.create('gugu',5,5,10);w.enemies=[escort];
  MA.update(w,dt);ok(!w.match.over,'最终战剩余随从阻止提前通关');
  R.killEnemy(w,escort);ok(MA.update(w,dt),'第10关清场在当前帧返回胜利');
  ok(w.match.over&&w.match.winner==='p1'&&w.match.title==='冒险通关'&&w.match.level===10&&next===9,
    '最后一关清场后结束，不请求第11关');
  MA.update(w,dt);ok(next===9&&w.match.level===10,'结算只触发一次');
  const s=MA.summary(w);ok(s.totalLevels===10&&s.level===10&&s.enemiesLeft===0,'胜利统计保留10/10关和零剩敌');
  const loss=makeWorld(emptyMap(),[makePlayer('p1',1,1)]);loss.mode='adventure';loss.match=MA.create('adventure');loss.match.level=10;
  loss.players[0].lives=0;MA.onDeath(loss,loss.players[0]);MA.update(loss,dt);
  ok(loss.match.winner==='p2'&&loss.match.title==='挑战结束','最后一命与最后敌人同帧阵亡时仍按死亡规则判负');
}

group('34. 生命上限5 / 敌方星星碰撞 / 毒刺削弱');
{
  const EN=BI.entities,AI=BI.ai,MA=BI.match,dt=1/60;
  ok(CFG.MAX_LIVES===5&&CFG.START_LIVES===3,'开局3条命，上限5条命');
  const w=makeWorld(emptyMap(),[makePlayer('p1',5,5)]),p=w.players[0];w.mode='adventure';w.match=MA.create('adventure');
  for(let n=0;n<8;n++)R.applyItem(p,'fruit','adventure');
  ok(p.lives===5&&p.shield===1,'连续吃果实最多5条命，满血果实转护盾');
  R.changeLives(p,1);ok(p.lives===5&&MA.summary(w).players[0].lives===5,'过关补命与结算遵守相同上限');
  p.shield=0;R.hurtPlayer(w,p,'contact');for(let n=0;n<30;n++)R.hurtPlayer(w,p,'contact');
  ok(p.lives===4&&!p.alive,'一次死亡仅扣1条命，重复伤害不重复统计');
  p.alive=true;p.lives=1;R.hurtPlayer(w,p,'flame');
  ok(p.lives===0&&!MA.canRespawn(w,p)&&MA.summary(w).players[0].lives===0,'最后一命归零，不能重生，结算为0');
  for(const type of ['gugu','claude','oupao','boss']){
    const sw=makeWorld(emptyMap(),[makePlayer('p1',1,1)]),e=EN.create(type,5,5,5),hero=sw.players[0];sw.enemies=[e];
    sw.items=[{c:5,r:5,type:'star'}];R.updateItems(sw,dt);
    hero.x=e.x;hero.y=e.y;hero.shield=1;
    R.updateDamage(sw,dt);
    ok(e.starTime===6&&hero.alive&&hero.lives===3&&!hero.shield&&hero.invuln>1.4,type+' 实际拾取星星后碰撞先破盾并给保护');
    for(let n=0;n<84;n++){R.updateDamage(sw,dt);R.updateEnemies(sw,dt);}
    ok(hero.alive&&hero.lives===3,type+' 破盾后持续接触1.4秒仍不扣命');
    for(let n=0;n<18;n++){R.updateDamage(sw,dt);R.updateEnemies(sw,dt);}
    ok(!hero.alive&&hero.lives===2&&e.alive,type+' 保护结束后接触只扣一命');
    hero.alive=true;hero.invuln=1;R.updateDamage(sw,.2);
    ok(hero.alive&&hero.lives===2,type+' 重生保护阻止敌方星星连续伤害');
    hero.invuln=0;hero.starTime=2;R.updateDamage(sw,dt);
    ok(hero.alive&&hero.lives===2&&e.alive,type+' 双方无敌时互不造成伤害');
    hero.starTime=0;e.starTime=0;R.updateDamage(sw,dt);
    ok(hero.alive&&hero.lives===2,type+' 星星结束后恢复普通接触无伤害');
    e.starTime=6;e.x+=CFG.TILE*2;R.updateDamage(sw,dt);
    ok(hero.alive,type+' 无敌碰撞不会远距离命中');
    e.x=hero.x;e.alive=false;R.updateDamage(sw,dt);ok(hero.alive,type+' 死亡敌人的残留星星不造成伤害');
  }
  for(const level of [5,10])for(const hp of [6,3]){
    const sw=makeWorld(emptyMap(),[makePlayer('p1',1,1)]),e=EN.create('boss',5,5,level);sw.map.bossBattle=true;e.hp=hp;EN.syncBossPhase(sw,e);e.abilityCd=0;
    AI.bossAbility(sw,e,dt);const gap=AI.aggression(e).abilityGap;
    ok(sw.poison.length===6&&sw.poison.every(f=>f.life===.8&&f.warn===1.5)&&e.abilityCd>=gap&&e.abilityCd<=gap+.8,
      level+'关 '+hp+'血 毒刺预警1.5秒、持续0.8秒，按较长间隔施法');
    const first=sw.poison[0];R.updatePoison(sw,1.5);ok(first.warn===0&&first.life===.8,'完整预警不占用有效伤害时长');
    R.updatePoison(sw,.79);ok(sw.poison.length===6,'毒刺结束前保留伤害区域');
    R.updatePoison(sw,.02);ok(sw.poison.length===0,'毒刺有效持续0.8秒后全部清除');
  }
}

group('35. 正背面朝向：转弯 / 停下 / 对角输入 / 碰墙');
{
  const p=makePlayer('p1',5,5),w=makeWorld(emptyMap(),[p]),dt=1/60;
  MO.step(w,p,0,-1,dt);ok(p.facingDir==='up','向上移动显示背面');
  MO.step(w,p,0,0,dt);ok(p.facingDir==='up','松开按键保持背面');
  MO.step(w,p,0,1,dt);ok(p.facingDir==='down','向下切回正面');
  MO.step(w,p,-1,0,dt);ok(p.facingDir==='left'&&p.facing===-1,'向左保留原有镜像方向');
  MO.step(w,p,1,0,dt);ok(p.facingDir==='right'&&p.facing===1,'向右保留原有方向');
  p.axisPref='y';MO.step(w,p,-1,-1,dt);ok(p.facingDir==='up'&&p.facing===1,'对角按键以选中的纵轴决定背面，不被未使用的左键翻转');
  p.axisPref='x';MO.step(w,p,-1,-1,dt);ok(p.facingDir==='left'&&p.facing===-1,'对角按键优先横轴时显示侧向正面');
  p.x=G.centerX(1);p.y=G.centerY(1);MO.step(w,p,0,-1,.2);
  ok(p.facingDir==='up'&&G.row(p.y)===1,'面对上方墙壁时可以转身，不越过边界');
}

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n' + '─'.repeat(56));
console.log(`  通过 ${passed}　失败 ${failed}`);
if (failed) {
  console.log('\n失败项：');
  failures.forEach(f => console.log('  · ' + f));
}
console.log('─'.repeat(56));
process.exit(failed ? 1 : 0);
