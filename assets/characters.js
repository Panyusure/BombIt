/* ============================================================
 * characters.js —— 角色素材配置
 *
 * 为什么是 .js 而不是 .json：
 *   浏览器在 file:// 下会以 CORS 为由拒绝 fetch() 本地 json 文件，
 *   而 <script> 标签不受此限制。为了保住「双击 index.html 就能玩」，
 *   配置必须用 script 标签加载，所以这里是 .js。
 *
 * 每一项的含义：
 *   name        显示名（HUD / 选人界面用）
 *   image       图片路径（相对 index.html）
 *   height      显示高度 = height × 格子边长(48px)
 *   crop        [左, 上, 宽, 高]：角色可见区域，加载时去掉透明留白
 *   anchor      裁切后 [水平, 垂直] 锚点，[0.5, 0.92] 表示「水平居中、垂直 92% 处」
 *               落在脚底 —— 这个点必须对准角色的脚，否则角色会「飘」
 *   flipForLeft 向左走时水平翻转
 *   motion      静态图动效补偿参数（见设计方案 §5.4）
 *
 * 当前使用按原始图鉴恢复的高清透明素材，原始版本仍保留供对照。
 * ============================================================ */
(function (BI) {
  'use strict';

  BI.CHARACTERS = {
    version: 4,

    characters: {
      xiaonuo: {
        name: '小诺',
        image: 'assets/characters/xiaonuo-hd.png',
        crop: [200, 40, 729, 1295],
        // 这只狐狸是「竖长条」：头身在上面，长尾巴拖到下面。
        // 所以锚点要放在脚上（约 78% 高度处），不能放图片最底部 ——
        // 否则脚会浮在半空，尾巴戳进下一格。
        height: 1.55,
        anchor: [0.5, 0.78],
        flipForLeft: true,
        motion: { bounce: 4, wobble: 4, breathe: 0.04, squash: 0.22 }
      },
      axiu: {
        name: '阿修',
        image: 'assets/characters/axiu-hd.png',
        crop: [199, 34, 870, 1249],
        height: 1.58,
        anchor: [0.5, 0.88],
        flipForLeft: true,
        motion: { bounce: 4, wobble: 4, breathe: 0.04, squash: 0.22 }
      },
      arui: {
        name: '阿瑞',
        image: 'assets/characters/arui-hd.png',
        crop: [203, 87, 875, 1098],
        height: 1.62,
        anchor: [0.5, 0.97],
        flipForLeft: true,
        motion: { bounce: 4, wobble: 4, breathe: 0.04, squash: 0.22 }
      },
      xiaoyan: {
        name: '小炎',
        image: 'assets/characters/xiaoyan-hd.png',
        crop: [160, 44, 943, 1191],
        height: 1.58,
        anchor: [0.5, 0.97],
        flipForLeft: true,
        motion: { bounce: 4, wobble: 4, breathe: 0.04, squash: 0.22 }
      },
      weilai: {
        name: '未来',
        image: 'assets/characters/weilai-hd.png',
        crop: [276, 40, 780, 1079],
        height: 1.62,
        anchor: [0.5, 0.97],
        flipForLeft: true,
        motion: { bounce: 3, wobble: 3, breathe: 0.025, squash: 0.18 }
      },
      'weilai-awakened': {
        name: '未来',
        image: 'assets/characters/weilai-awakened-hd.png',
        crop: [5, 6, 1351, 1123],
        height: 3.05,
        anchor: [0.53, 0.97],
        flipForLeft: true,
        motion: { bounce: 2, wobble: 1.5, breathe: 0.012, squash: 0.1 }
      },
      xiaotian: {
        name: '小天',
        image: 'assets/characters/xiaotian-hd.png',
        crop: [160, 60, 1049, 1027],
        height: 1.56,
        anchor: [0.5, 0.88],
        flipForLeft: true,
        motion: { bounce: 4, wobble: 4, breathe: 0.04, squash: 0.22 }
      }
    },

    /* 各位置的默认角色 */
    defaults: {
      p1: 'xiaonuo',
      p2: 'axiu'
    },

    /* 可在选人界面挑选的角色（单人模式 / 双人 1P 用） */
    selectable: ['xiaonuo', 'axiu', 'arui', 'xiaoyan', 'xiaotian', 'weilai']
  };

  // 方向变体只供对局使用，不进入选角列表；正背面各自校准脚底锚点。
  var backViews = {
    xiaonuo: { crop: [213, 51, 745, 1281], anchor: [.5, .78] },
    axiu: { crop: [156, 37, 868, 1249], anchor: [.5, .84] },
    arui: { crop: [212, 83, 811, 1083], anchor: [.5, .97] },
    xiaoyan: { crop: [163, 25, 908, 1254], height: 1.65, anchor: [.5, .92] },
    xiaotian: { crop: [245, 41, 988, 1040], anchor: [.5, .88] },
    weilai: { crop: [300, 18, 758, 1110], anchor: [.5, .97] },
    'weilai-awakened': { crop: [0, 0, 1358, 1123], anchor: [.5, .97] }
  };
  Object.keys(backViews).forEach(function (id) {
    BI.CHARACTERS.characters[id + '-back'] = Object.assign({}, BI.CHARACTERS.characters[id], backViews[id], {
      image: 'assets/characters/' + id + '-back-hd.png', flipForLeft: false
    });
  });

})(window.BI = window.BI || {});
