/* ============================================================
 * config.js —— 所有可调参数集中在这里
 * 想改手感（速度、引信、火力）只改这个文件就够了
 * ============================================================ */
(function (BI) {
  'use strict';

  var TILE = 48;
  var COLS = 15;
  var ROWS = 13;
  var HUD_H = 72;

  BI.config = {
    /* ---------- 版本 ---------- */
    VERSION: 'v2.1',               // 开始界面署名处显示；发版时改这里

    /* ---------- 网格与画布 ---------- */
    TILE: TILE,
    COLS: COLS,
    ROWS: ROWS,
    HUD_H: HUD_H,
    FIELD_W: TILE * COLS,          // 720
    FIELD_H: TILE * ROWS,          // 624
    VIEW_W: TILE * COLS,           // 720（逻辑分辨率）
    VIEW_H: TILE * ROWS + HUD_H,   // 696

    /* ---------- 玩家 ---------- */
    BOX: 36,                       // 碰撞盒边长（比格子小 12px，可从窄缝蹭过）
    ASSIST: 12,                    // 转角辅助：与通道中线偏差在此范围内自动对齐
    SPEED_BASE: 4.6,               // 基础速度（格/秒）
    SPEED_STEP: 0.10,              // 每吃一个速度道具 +10%
    SPEED_MAX_BONUS: 0.50,         // 速度加成上限 +50%
    START_POWER: 1,                // 初始火力
    START_BOMBS: 1,                // 初始可同时放置炸弹数
    MAX_POWER: 8,
    MAX_BOMBS: 8,
    START_LIVES: 3,
    MAX_LIVES: 5,

    /* ---------- 炸弹与爆炸 ---------- */
    BOMB_RADIUS: 17,               // 弹身实际半径；移动、绘制和碰撞共用
    PLAYER_BOMB_RADIUS: 14,        // 玩家脚下与炸弹碰撞的半径
    FUSE: 2.40,                    // 玩家、小怪与 BOSS 共用的引信时长（秒）
    FUSE_BLINK: 0.60,              // 最后多少秒开始急闪
    FLAME_TIME: 0.45,              // 火焰持续时间
    KICK_SPEED: 9.0,               // 踢弹滑行速度（格/秒）
    SHOW_FUSE_TIMER: false,        // 倒计时环 + 剩余秒数 —— 默认关
    BURN_ITEMS: true,              // 爆炸会烧掉地上的道具（经典规则）

    /* ---------- 地图生成 ---------- */
    BRICK_RATE: { dig: 0.74, versus: 0.66, adventure: 0.72 },
    RANDOM_WALLS: true,            // 硬墙随机摆放（false = 经典棋盘格柱子）
    WALL_RATE: 0.24,               // 随机硬墙的目标密度（占内部格子比例）
    MIN_EXITS: 1,                  // 每个可走格子至少要有的出口数
                                   //  1 = 只要求「全图连通、没有走不到的格点」，
                                   //      允许只有一条进出的走廊（死路）
                                   //  2 = 连死路也不许有
                                   // 注：连通性本身就已经蕴含"至少 1 个出口"，
                                   //     所以设成 1 时真正起作用的是连通性检查。
    SAFE_RADIUS: 2,                // 出生点周围保持空地的格数
    CONNECT_TRIES: 20,             // 连通性校验失败时的最大重生成次数
    // 注意：不要用「开局空地连通比例」当地图合格标准 ——
    // 泡泡堂的地图本来就该到处是软砖、一路炸过去，
    // 用那个标准会把 8 成以上的正常地图误判成废图（已实测）。

    /* ---------- 道具 ---------- */
    ITEM_DROP_RATE: 0.30,          // 软砖被炸后掉落道具的概率
    STAR_TIME: 6.0,                // 无敌星星：免伤 + 碰撞造成一次普通伤害（秒）
    INVULN_TIME: 1.5,              // 受伤后的无敌时长
    SHIELD_INVULN_TIME: 1.5,       // 玩家与敌人破盾后共用的保护时长

    /* ---------- 对局规则 ---------- */
    DIG_TIME: 180,                 // 计时拆砖：限时（秒）
    VERSUS_TIME: 90,               // 对战：常规时间（秒）
    VERSUS_TARGET: 2,              // 对战：先得几分获胜（三局两胜 = 2）
    VERSUS_SUDDEN_TIME: 45,        // 对战：超时加速阶段的时长
    ROUND_RESTART_DELAY: 1.6,      // 对战：一分打完到下一局开始的间隔
    RESPAWN_DELAY: 1.4,            // 阵亡后多久重生
    RESULT_DELAY: 1.1,             // 胜负已分到弹出结算界面的间隔
    MAX_CHAIN: 8,                  // 统计用：连爆上限保护

    /* ---------- 闯关模式 ---------- */
    ENEMY_BOX: 30,                 // 敌人碰撞盒（比玩家小一点，免得"擦边就死"）
    ENEMY_HIT_INVULN: 0.8,         // 多血敌人被打到后的无敌时间
    DANGER_MARGIN: 0.45,           // 敌人不踏进「还有这么多秒就炸」的格子
    ENEMY_DROP_RATE: 0.45,         // 敌人被打死时掉道具的概率
    LEVEL_CLEAR_DELAY: 1.6,        // 清完敌人到进入下一关的间隔
    BOSS_EVERY: 5,                 // 每几关出一个 Boss
    ADVENTURE_LEVELS: 10,          // 第10关清场后通关
    BOSS_POISON_LIFE: .8,          // 毒刺激活后的持续秒数
    BOSS_POISON_WARN: 1.5,         // 毒刺落点预警秒数
    BOSS_POISON_GAP: 8,            // 第5关认真阶段的基础施法间隔
    BOSS_POISON_RAGE_FACTOR: .8,   // 暴走阶段缩短后的间隔比例
    BOSS_RAGE_HP: 3,              // 剩余3血及以下进入暴走

    /* ---------- 配色（马卡龙 / 糖果色） ---------- */
    C: {
      floorA: '#a8e6a1', floorB: '#98d891',
      hardFace: '#b8b8c8', hardTop: '#d8d8e8', hardEdge: '#8a8a9c',
      brickFace: '#e88b6a', brickDark: '#c96f51', brickLine: '#b25c40',
      bombBody: '#2f2f3d', bombHi: '#8f8fa8', bombHot: '#e2503f',
      flameCore: '#ffffff', flameMid: '#ffd166', flameOut: '#ff6b35',
      p1: '#5ec8f0', p2: '#ff9eb5',
      hudBg: '#222840', hudText: '#eef2ff', hudDim: '#9aa6c8',
      shadow: 'rgba(20,26,45,.28)'
    }
  };

  // 瓦片类型
  BI.T = { EMPTY: 0, HARD: 1, BRICK: 2 };

  // 道具类型
  BI.ITEM = { FIRE: 'fire', BOMB: 'bomb', SPEED: 'speed', FRUIT: 'fruit', STAR: 'star', SHIELD: 'shield', KICK: 'kick', GLOVE: 'glove' };

  BI.ITEM_INFO = {
    fire:   { label: '火力', short: '火', color: '#ff8a5c' },
    bomb:   { label: '炸弹', short: '弹', color: '#6f7bd6' },
    speed:  { label: '速度', short: '速', color: '#4cc9a8' },
    fruit:  { label: '生命果实', color: '#f4bd83' },
    star:   { label: '无敌星星', color: '#ffd45e' },
    shield: { label: '护盾', short: '盾', color: '#63b8ff' },
    kick:   { label: '踢弹', short: '踢', color: '#c78bff' },
    glove:  { label: '推弹手套', short: '推', color: '#f3b277' }
  };

  BI.SKILLS = {
    // 通灵两条路：放弹满 6 次，或击杀任意一只敌人直接满条。
    weilai: { name: '迁境奇点', tag: '放弹被动', color: '#a9eafa', cd: 0, passive: true, bombsToEvolve: 6,
      desc: '放弹减速45%·2秒；放弹6次、击杀敌人或击倒对手通灵，通灵后减速75%·3秒、范围5×5。',
      normal: { radius: 1, rate: .45, duration: 2 }, evolved: { radius: 2, rate: .75, duration: 3 } },
    xiaonuo: { name: '时光星域', tag: '时空控制', color: '#8dd8ff', cd: 12,
      desc: '冻结怪物和敌方炸弹3秒；对战中使对手减速。' },
    axiu: { name: '暗刃瞬袭', tag: '暗影突进', color: '#c7a0ff', cd: 15,
      desc: '向前突进最多三格，攻击沿途目标，短暂无敌。' },
    arui: { name: '森罗守护', tag: '生命守护', color: '#9ae6b3', cd: 14,
      desc: '获得护盾，使两格内可达的怪物停留2秒。' },
    xiaoyan: { name: '炎灭火舞', tag: '吸伤蓄火', color: '#ffb278', cd: 12,
      desc: '4秒内吸收一次爆炸，反弹给周围5×5内的敌人。' },
    xiaotian: { name: '潜能洞察', tag: '智慧预判', color: '#a8dafa', cd: 12,
      desc: '显示炸弹范围，移动速度+30%，持续6秒。' }
  };

  // 背景据官网图鉴归纳；技能为本作改编，资料链接见 docs/角色背景与文案.md。
  BI.CHARACTER_LORE = {
    xiaonuo: { title: '心之力量', summary: '从难以掌控力量的小诺，成长为守护伙伴的诺亚。',
      story: '小诺天生拥有强大力量，却曾因无法控制而好心办坏事。在伙伴的帮助下，他逐渐理解心之力量，学会为了守护而变强。',
      sources: ['https://aoqi.100bt.com/jingling/55985.html'] },
    axiu: { title: '是非之心', summary: '阿修的修尔进化线：驾驭黑暗，守护小诺与是非城。',
      story: '阿修的修尔进化线拥有强大的黑暗力量，却将力量用于辨别是非与守护伙伴。成长为魔神修尔后，他立誓守护小诺与是非城。',
      sources: ['https://aoqi.100bt.com/jingling/264396.html', 'https://aoqi.100bt.com/jingling/294599.html'] },
    arui: { title: '生命之盾', summary: '阿瑞斯的生命与机械之力，化作守护伙伴的坚盾。',
      story: '阿瑞所属的阿瑞斯进化线掌控生命之力。生命王者形态将主宰与机械的力量结合，以防御和生命护盾保护伙伴。',
      sources: ['https://aoqi.100bt.com/jingling/285980.html'] },
    xiaoyan: { title: '力量之王', summary: '小炎将承受的伤害转为力量，成长为烈焰中的龙炎。',
      story: '小炎是五王中的力量之王，能够吸收伤害并转化为攻击。其龙炎进化线延续烈火与力量的主题，以强大力量守护奥奇世界。',
      sources: ['https://aoqi.100bt.com/jljx/113672.html', 'https://aoqi.100bt.com/jingling/306254.html'] },
    xiaotian: { title: '智慧之眼', summary: '小天领悟对手的力量，成长为洞察战局的帝释天。',
      story: '小天能够领悟对手的增益并化为己用，进化为帝释天。其智慧之王形态以智慧之眼洞察战局、推演变化。',
      sources: ['https://aoqi.100bt.com/jingling/81048.html', 'https://aoqi.100bt.com/jingling/245792.html'] },
    weilai: { title: '逆转因果', summary: '五女仆合体为通灵师，回到七年前拯救即将崩塌的世界。',
      story: '世界线改变，七年后的奥奇世界即将崩塌。五女仆觉醒救世力量，合体成为通灵师未来，穿越回七年前。逆转因果，无限未来！', sources: [] }
  };

  BI.THEMES = {
    forest: { name: '晨露森林', subtitle: '生命古树 · 林间果实', mechanic: '古树定时落果，拾取恢复1点生命；满生命或对战时获得护盾。',
      floor: '#d1dfad', floorAlt: '#c4d59c', edge: '#596e54',
      wall: '#6d9b76', wallDark: '#345c52', top: '#a3c78b', accent: '#f3d58e', sky: '#243d42' },
    factory: { name: '星汽工厂', subtitle: '中央反应炉 · 闭环传送带', mechanic: '传送带顺行加速、逆行减速，静止时随带移动；炸弹也会被运送。',
      floor: '#c4d5da', floorAlt: '#b8cbd1', edge: '#557180',
      wall: '#648799', wallDark: '#345265', top: '#a1bfcb', accent: '#ffce7c', sky: '#26344e' },
    park: { name: '星糖游乐园', subtitle: '旋转木马 · 环游护盾', mechanic: '静止搭乘木马一圈可获得护盾，每关一次；环道也会运送炸弹。',
      floor: '#f3e8d5', floorAlt: '#e9dccd', edge: '#987e9e',
      wall: '#c08fbe', wallDark: '#836383', top: '#f1c8db', accent: '#a8dfdd', sky: '#463b61' }
  };

})(window.BI = window.BI || {});
