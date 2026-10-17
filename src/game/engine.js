/* Shared deterministic 60 Hz game engine. No DOM, rendering or audio. */
(function (BI) {
  'use strict';
  var CFG = BI.config, G = BI.grid, R = BI.rules, MO = BI.motion,
      MA = BI.match, EN = BI.entities, AI = BI.ai, DG = BI.danger;
  var STEP = 1 / 60;
  function defaultCharacter(id) { return id === 'p2' ? 'axiu' : 'xiaonuo'; }
  function makePlayer(id, label, color, spawnIndex, assetId) {
    return {
      id: id, keyId: id, name: label, color: color,
      spawnIndex: spawnIndex,
      assetId: assetId || defaultCharacter(id),
      asset: null, charName: null,
      x: 0, y: 0, px: 0, py: 0,
      facing: 1, facingDir: 'down', moving: false, axisPref: 'x',
      power: CFG.START_POWER, maxBombs: CFG.START_BOMBS, bombsOut: 0,
      speedBonus: 0, shield: 0, starTime: 0, kick: false, glove: false, invuln: 0, squash: 0,
      alive: true, deadAt: 0, lives: CFG.START_LIVES,
      skillCd: 0, soulEvolved: false, soulBombs: 0, picked: {}, motion: null
    };
  }

  function respawn(world, p) {
    var sp = world.spawns[p.spawnIndex] || world.spawns[0];
    p.x = G.centerX(sp[0]);
    p.y = G.centerY(sp[1]);
    p.px = p.x; p.py = p.y;
    p.alive = true;
    p.facing = 1; p.facingDir = 'down';
    p.invuln = CFG.INVULN_TIME;
    p.starTime = 0;
    p.carouselTravel = 0;
    BI.skills.reset(p);
    p.moving = false;
    p.squash = 0;
  }

  /** 清空场上一切临时物件（换回合 / 换关 / 重开用） */
  function clearField(world) {
    world.bombs.length = 0;
    world.flames.length = 0;
    world.poison = [];
    world.items.length = 0;
    if (world.enemies) world.enemies.length = 0;
    world.time = 0;
    world.timeStop = null;
    world.skillEffects = [];
    world.players.forEach(function (p) { p.carouselTravel = 0; p.carouselRewarded = false; });
    world._aiField = null;
    world._aiBreakField = null;
    world._levelFxFired = false;
    emit(world, 'field_reset', [], {});
  }

  function createWorld(cfg) {
    var seedText = cfg.seed || BI.randomSeed();
    var rng = BI.makeRng(BI.hashSeed(seedText));
    var spawns = [[1, 1], [CFG.COLS - 2, CFG.ROWS - 2]];
    var mapMode = (cfg.mode === 'versus') ? 'versus'
                : (cfg.mode === 'adventure') ? 'adventure' : 'dig';
    var lvl = BI.levelgen.generate(rng, { mode: mapMode, spawns: spawns });

    var w = {
      mode: cfg.mode,                        // 'dig' | 'versus' | 'adventure'（玩法）
      inputMode: cfg.inputMode,              // 'solo' | 'versus'（键位表）
      label: cfg.label,
      cfg: cfg,
      altKeys: false,                        // 1P 备用键位开关
      seedText: seedText,
      map: lvl.map, theme: lvl.theme,
      spawns: spawns,
      degraded: lvl.degraded,
      rng: rng,
      time: 0,
      bombs: [], flames: [], poison: [], items: [], players: [],
      enemies: [],                           // 闯关模式的怪
      danger: null,                          // 威胁图（AI 用，每帧重算）
      burnItems: CFG.BURN_ITEMS,             // 爆炸会烧掉地上的道具（经典规则）
      itemPool: 'core',                      // 常规五种道具；'full' 时额外加入踢弹
      stats: { explosions: 0, kills: 0, maxChain: 0 },
      match: null,

      events: [], frame: 0, nextEntityId: 1,
      seedRoot: seedText

    };

    attach(w);
    w.match = MA.create(cfg.mode);

    var a1 = (cfg.chars && cfg.chars[0]) || defaultCharacter('p1');
    w.players.push(makePlayer('p1', '1P', CFG.C.p1, 0, a1));
    if (cfg.mode === 'versus') {
      var a2 = (cfg.chars && cfg.chars[1]) || defaultCharacter('p2');
      w.players.push(makePlayer('p2', '2P', CFG.C.p2, 1, a2));
    }

    for (var i = 0; i < w.players.length; i++) respawn(w, w.players[i]);

    // 闯关模式：第一关的怪
    if (cfg.mode === 'adventure') {
      EN.spawn(w, EN.countFor(1), 1, rng);
      EN.prepareBriefing(w);
    }

    MA.beginRound(w);
    return w;
  }

  /** 闯关模式过关：换一张更难的地图继续，保留玩家的道具成长 */
  function startNextLevel(w) {
    var level = w.match.level;
    var nextSeed = w.seedRoot + ':level:' + level;
    var rng = BI.makeRng(BI.hashSeed(nextSeed));
    var isBoss = level % CFG.BOSS_EVERY === 0;
    var lvl = isBoss ? BI.levelgen.generateBoss(rng, w.theme) :
      BI.levelgen.generate(rng, { mode: 'adventure', spawns: [[1, 1], [CFG.COLS - 2, CFG.ROWS - 2]], previousTheme: w.theme });
    w.spawns = lvl.spawns;

    w.map = lvl.map;
    w.theme = lvl.theme;
    w.rng = rng;
    w.degraded = lvl.degraded;
    w.seedText = nextSeed;
    clearField(w);

    for (var i = 0; i < w.players.length; i++) {
      var p = w.players[i];
      // 冒险换关清空通灵进度；对战跨回合保留由 startNewRound 负责。
      BI.skills.resetLevel(p);
      // 火力 / 炸弹数 / 速度成长保留（设计方案 §4.6 的正反馈）
      // 未使用的护盾保留到抵挡伤害；星星的临时效果在换关时结束。
      R.changeLives(p, 1);   // 每过一关补一条命，上限统一读取配置
      respawn(w, p);
    }
    EN.spawn(w, EN.countFor(level), level, rng);
    MA.beginRound(w);
    EN.prepareBriefing(w);
    emit(w, 'level_started', [], { level: level });
  }

  /** 对战模式打完一分：换一张地图重开本回合 */
  function startNewRound(w) {
    var nextSeed = w.seedRoot + ':round:' + (w.match.round + 1);
    var rng = BI.makeRng(BI.hashSeed(nextSeed));
    var lvl = BI.levelgen.generate(rng, { mode: 'versus', spawns: w.spawns, previousTheme: w.theme });
    w.map = lvl.map;
    w.theme = lvl.theme;
    w.rng = rng;
    w.degraded = lvl.degraded;
    w.seedText = nextSeed;
    clearField(w);
    w.match.round++;
    emit(w, 'round_started', [], { round: w.match.round });
    for (var i = 0; i < w.players.length; i++) {
      var p = w.players[i];
      // 回合重开：道具成长清零，保证每局公平
      p.power = CFG.START_POWER;
      p.maxBombs = CFG.START_BOMBS;
      p.speedBonus = 0;
      p.shield = 0;
      p.kick = false;
      p.glove = false;
      p.picked = {};
      p.skillCd = 0;
      // 道具与临时技能清零，但未来的通灵条跨回合保留；
      // 否则 PvP 击倒后的充能会被紧接着的换回合立刻抹掉。
      respawn(w, p);
    }
    MA.beginRound(w);
  }

  function emit(w, type, args, data) {
    w.events.push(Object.assign({ type: type, frame: w.frame }, data));
    if (w.eventSink) w.eventSink(type, args);
  }

  function attach(w) {
    w.playerById = function (id) {
      return this.players.find(function (p) { return p.id === id; }) || null;
    };
    w.onExplode = function (bomb, cells) {
      w.stats.explosions++;
      emit(w, 'onExplode', [bomb, cells], { owner: bomb.ownerId, col: bomb.cx, row: bomb.cy, cells: cells });
    };
    w.onDeath = function (p) {
      p.deadAt = w.time;
      if (w.mode !== 'versus') R.changeLives(p, -1);
      MA.onDeath(w, p);
      emit(w, 'onDeath', [p], { player: p.id, lives: p.lives });
    };
    w.onEnemyDeath = function (e) {
      w.stats.kills++;
      emit(w, 'onEnemyDeath', [e], { enemy: e.id, killedBy: e.killedBy });
    };
    w.onBossPhase = function (e, phase) { emit(w, 'onBossPhase', [e, phase], { enemy: e.id, phase: phase.id }); };
    w.onScenery = function (kind, x, y) { emit(w, 'onScenery', Array.prototype.slice.call(arguments), { kind: kind, x: x, y: y }); };
    w.onSkill = function (p, text) { emit(w, 'onSkill', [p, text], { player: p.id, text: text }); };
    w.onEnemyBomb = function (e) { emit(w, 'onEnemyBomb', [e], { enemy: e && e.id }); };
    w.onPickup = function (p, item) { emit(w, 'onPickup', [p, item], { actor: p.id, item: item.type, col: item.c, row: item.r }); };
    w.onShieldBreak = function (p) { emit(w, 'onShieldBreak', [p], { actor: p.id }); };
    w.onItemBurned = function (c, r, type) { emit(w, 'onItemBurned', [c, r, type], { col: c, row: r, item: type }); };
    w.onSuddenDeath = function () { emit(w, 'onSuddenDeath', [], {}); };
    w.onNewRound = function () { startNewRound(w); };
    w.onNextLevel = function () { startNextLevel(w); };
    return w;
  }

  function updatePlayer(w, p, dt, a) {
    if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 5);
    if (!p.alive) {
      p.moving = false;
      if (MA.canRespawn(w, p) && w.time - p.deadAt > CFG.RESPAWN_DELAY) {
        respawn(w, p);
        emit(w, 'respawn', [], { player: p.id });
      }
      return;
    }
    p.px = p.x; p.py = p.y;
    var hx = a.hx || 0, hy = a.hy || 0;
    if (hx || hy) {
      p.aimX = hx && (!hy || p.axisPref !== 'y') ? hx : 0;
      p.aimY = p.aimX ? 0 : hy;
    }
    var x = p.x, y = p.y;
    p.moving = MO.step(w, p, hx, hy, dt);
    if (a.skill) {
      var cast = BI.skills.cast(w, p);
      emit(w, 'skill_action', [], { player: p.id, success: cast,
        reason: cast ? null : BI.skills.info(p).passive ? 'passive_skill' : p.skillCd > 0 ? 'cooldown' : 'unavailable' });
    }
    if (a.bomb) {
      var placed = R.tryPlaceBomb(w, p);
      emit(w, 'bomb_action', [], { player: p.id, success: placed,
        reason: placed ? null : w.bombs.filter(function (b) { return b.ownerId === p.id; }).length >= p.maxBombs ? 'bomb_limit' : 'occupied' });
    }
    if (p.kick || p.glove) MO.kickCheck(w, p, hx, hy);
    if ((hx || hy) && Math.hypot(p.x - x, p.y - y) < 1e-8 && !a.quietBlocked) {
      emit(w, 'blocked', [], { player: p.id });
    }
  }

  function step(w, actions, dt) {
    w.events = [];
    if (w.match.over || w.briefing) return w.events;
    w.frame++;
    w.time += dt;
    BI.skills.update(w, dt);
    BI.scenery.update(w, dt);
    w.players.forEach(function (p) { updatePlayer(w, p, dt, actions[p.id] || {}); });
    DG.compute(w);
    w.enemies.forEach(function (e) { AI.updateEnemy(w, e, dt); });
    R.updateBombs(w, dt);
    R.updateFlames(w, dt);
    R.updatePoison(w, dt);
    R.updateItems(w, dt);
    R.updateDamage(w, dt);
    R.updateEnemies(w, dt);
    EN.sweep(w);
    MA.update(w, dt);
    if (w.match.over) emit(w, 'match_over', [], { winner: w.match.winner, title: w.match.title });
    return w.events;
  }

  BI.engine = { create: createWorld, attach: attach, step: step, nextLevel: startNextLevel,
    nextRound: startNewRound, respawn: respawn, STEP: STEP };
})(window.BI = window.BI || {});
