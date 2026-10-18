/* 敌人种类与出生点构造。speed 为格/秒，碰撞与 AI 共用同一套格子坐标。 */
(function (BI) {
  'use strict';

  var CFG = BI.config, G = BI.grid, T = BI.T;

  // NPC 普通接触无伤害；拾取无敌星星后暂时获得碰撞伤害。
  var TYPES = {
    gugu: {
      id: 'gugu', name: '谷谷歌歌', ai: 'bomb', speed: 1.0,
      color: '#80baff', dark: '#395983', hp: 1, power: 1, bombGap: 6.0,
      desc: '慢节奏巡游，投弹后撤',
      story: '蓝翼小恶魔喜欢收集彩色石头，把圆滚滚的烟花也当成了收藏。',
      mechanic: '投弹前提示0.7秒，放弹后撤退，也会炸开挡路障碍。',
      damage: '炸弹产生一格十字火焰；仅吃到无敌星星后有碰撞伤害。'
    },
    claude: {
      id: 'claude', name: '克劳德德', ai: 'bomb', speed: 1.1,
      color: '#c49bef', dark: '#72508e', hp: 1, power: 1, bombGap: 6.6,
      desc: '保持距离，谨慎布弹',
      story: '紫翼小恶魔做事总要反复检查，连放烟花之前也要先想好退路。',
      mechanic: '靠近后保持距离，投弹前提示0.7秒，放弹后撤退。',
      damage: '炸弹产生一格十字火焰；仅吃到无敌星星后有碰撞伤害。'
    },
    oupao: {
      id: 'oupao', name: '偶喷诶艾', ai: 'bomb', speed: 1.15,
      color: '#f09caa', dark: '#9d4a5e', hp: 1, power: 2, bombGap: 7.2,
      desc: '两格火焰，较长投弹间隔',
      story: '来自泡泡工坊的红翼小恶魔，总想让自己的烟花再热闹一点。',
      mechanic: '投弹前提示0.7秒，火力较强、间隔较长，放弹后撤退。',
      damage: '炸弹产生两格十字火焰；仅吃到无敌星星后有碰撞伤害。'
    },
    boss: {
      id: 'boss', name: '鲁鲁旦', ai: 'boss', speed: 1.3,
      color: '#bd99f0', dark: '#70519b', hp: 8, power: 2, bombGap: 4.0,
      desc: '8点生命 · 试探、认真、暴走',
      story: '总爱捣乱的鲁鲁旦坐着紫色悬浮舱来到了战场，这次又准备了新的坏点子。',
      mechanic: '8血试探：追击投弹；6血认真：移速+25%，解锁毒刺；3血暴走：毒刺加快，炸弹可破坏场内硬墙。',
      damage: '毒刺预警1.5秒、持续0.8秒，仅伤落点一格；炸弹为十字火焰。仅吃到无敌星星后有碰撞伤害。'
    }
  };

  var nextId = 1;

  var entities = BI.entities = {
    TYPES: TYPES,
    BOSS_PHASES: [null,
      { id: 1, name: '试探', color: '#c99af2', speed: 1, poison: false, breakHard: false },
      { id: 2, name: '认真', color: '#eca45e', speed: 1.25, poison: true, breakHard: false },
      { id: 3, name: '暴走', color: '#f27869', speed: 1.25, poison: true, breakHard: true }
    ],

    bossStage: function (e) {
      if (!e || e.type !== 'boss') return null;
      var lost = e.maxHp - e.hp;
      return entities.BOSS_PHASES[Math.max(e.phase || 1, e.hp <= CFG.BOSS_RAGE_HP ? 3 : lost >= 2 ? 2 : 1)];
    },

    syncBossPhase: function (world, e) {
      var phase = entities.bossStage(e);
      if (!phase || !e.alive || phase.id === e.phase) return;
      e.phase = phase.id; e.phaseFlash = 1.4; e.queuedBomb = false;
      e.abilityCd = phase.id === 3 ? .9 : 1.8;
      if (phase.id === 3) e.bombCd = Math.min(e.bombCd, 1);
      if (world.onBossPhase) world.onBossPhase(e, phase);
    },

    /** 第 N 关该出哪些敌人（越往后越凶） */
    pickType: function (rng, level, index) {
      if (level % CFG.BOSS_EVERY === 0 && index === 0) return 'boss';
      var step = Math.min(3, level);
      if (index === 0) return ['gugu', 'claude', 'oupao'][step - 1];
      return rng.pick(['gugu', 'claude', 'oupao'].slice(0, step));
    },

    prepareBriefing: function (world) {
      var seen = world.seenEnemies || (world.seenEnemies = {});
      var types = [];
      world.enemies.forEach(function (e) {
        if (types.indexOf(e.type) < 0) types.push(e.type);
      });
      var fresh = types.filter(function (id) { return !seen[id]; });
      world.briefing = { types: types, fresh: fresh };
      types.forEach(function (id) { seen[id] = true; });
    },

    /** 前五关保留教学节奏，后五关浓缩原第6～15关的成长。 */
    difficultyLevel: function (level) {
      var n = Math.max(1, Math.min(CFG.ADVENTURE_LEVELS, level || 1));
      return n <= 5 ? n : 5 + (n - 5) * 2;
    },

    /** 第 N 关的敌人数量 */
    countFor: function (level) {
      var difficulty = entities.difficultyLevel(level);
      return level % CFG.BOSS_EVERY === 0 ? Math.min(2 + Math.floor(difficulty / CFG.BOSS_EVERY), 5) : Math.min(2 + Math.floor(difficulty / 2), 5);
    },

    /** 第 N 关的速度系数 */
    speedScale: function (level) {
      return Math.min(1 + 0.015 * (entities.difficultyLevel(level) - 1), 1.15);
    },

    create: function (typeId, c, r, level, world) {
      var t = TYPES[typeId] || TYPES.gugu;
      var scale = entities.speedScale(level || 1);
      var e = {
        id: 'e' + (world ? world.nextEntityId++ : nextId++),
        isEnemy: true,
        type: t.id,
        phase: t.id === 'boss' ? 1 : 0, phaseFlash: 0,
        ai: t.ai,
        name: t.name,
        color: t.color,
        dark: t.dark,
        hp: t.hp,
        maxHp: t.hp,
        power: t.power, bombGap: t.bombGap, windup: 0, abilityCd: 2.5,
        level: level || 1, maxBombs: 1, picked: {}, speedBonus: 0,
        shield: 0, starTime: 0, glove: false,

        x: G.centerX(c), y: G.centerY(r),
        px: G.centerX(c), py: G.centerY(r),
        facing: 1, moving: false,

        speed: t.speed * scale,     // 单位：格/秒（乘 TILE 得到 px/秒）
        alive: true, deadAt: 0,
        hitFlash: 0, invuln: 0,

        dir: null,                  // {x, y}
        tc: c, tr: r,               // 正在走向的目标格
        bombCd: 3.0 + (c % 3) * 0.7,// 开局别立刻放弹
        wanderBias: 0
      };
      return e;
    },

    aliveCount: function (world) {
      var n = 0;
      for (var i = 0; i < world.enemies.length; i++) if (world.enemies[i].alive) n++;
      return n;
    },

    /**
     * BOSS 战里鲁鲁旦是否还活着。
     * 音乐用它判断该放 BOSS 曲还是关卡曲：击败鲁鲁旦之后，哪怕小怪还没清完，
     * 也已经不是 BOSS 战的气氛了，不能再一直放 BOSS 曲。
     */
    bossAlive: function (world) {
      var list = (world && world.enemies) || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].alive && list[i].type === 'boss') return true;
      }
      return false;
    },

    /**
     * 在离玩家足够远的地方撒敌人。
     * 出生点保护（§4.3）：至少隔 6 格，否则开局就被贴脸。
     *
     * 光按「这格现在好不好站」排序是不够的：传送带环路被场景强制留空，
     * 地图上绝大多数现成空地都在带子上，小怪就会全部挤在环路旁边。
     * 所以候选格按「离环路多远」整体后移（贴边 +1 档、正好在带上 +2 档），
     * 再用最远点采样式的贪心把出生点彼此拉开；实在挑不满才逐步放宽。
     */
    spawn: function (world, count, level, rng) {
      var COLS = G.cols(world.map), ROWS = G.rows(world.map);
      var pc = G.col(world.players[0].x), pr = G.row(world.players[0].y);
      var T = BI.T;
      var track = (world.map.landmark && world.map.landmark.path) || [];

      /** 到环路（传送带 / 木马环道）的曼哈顿距离；没有环路时大家一样远 */
      function trackGap(c, r) {
        var best = 99;
        for (var i = 0; i < track.length; i++) {
          best = Math.min(best, Math.abs(track[i][0] - c) + Math.abs(track[i][1] - r));
        }
        return best;
      }

      var cells = [];
      for (var r = 1; r < ROWS - 1; r++) {
        for (var c = 1; c < COLS - 1; c++) {
          if (world.map[r * COLS + c] === T.HARD) continue;
          if (BI.levelgen.openExits(world.map, c, r) < 2) continue;
          // 别贴着玩家出生
          if (Math.abs(c - pc) + Math.abs(r - pr) < 6) continue;
          // 别跟别的敌人叠在一起
          var taken = false;
          for (var k = 0; k < world.enemies.length; k++) {
            var o = world.enemies[k];
            if (o.alive && G.col(o.x) === c && G.row(o.y) === r) { taken = true; break; }
          }
          if (!taken) {
            var free = [[1,0],[-1,0],[0,1],[0,-1]].filter(function (d) { return G.at(world.map,c+d[0],r+d[1]) === T.EMPTY; }).length;
            var ready = false;
            if (G.at(world.map,c,r) === T.EMPTY && free >= 2) {
              var area = BI.levelgen.bfs(world.map, G.idx(c,r,world.map), function(v) { return v === T.EMPTY; });
              ready = Array.prototype.filter.call(area, Boolean).length >= 10;
            }
            // 档位：0 = 现成开阔空地，1 = 空地但偏窄，2 = 软砖（靠出生窝清出来）；
            // 再按「离环路多远」整体后移 —— 紧贴环路 +1，正好落在带子上 +2。
            // 传送带格子上出生的怪物会立刻被带子送走，贴边的也会一开局就上带，
            // 所以只有实在没有别的空地时才让它落在环路一带。
            // 同一档内保持随机，避免固定挑地图最远的角落。
            var gap = trackGap(c, r);
            var rank = ready ? 0 : G.at(world.map,c,r) === T.EMPTY ? 1 : 2;
            cells.push({ c: c, r: r, gap: gap,
              tier: rank + (gap >= 2 ? 0 : gap === 1 ? 1 : 2) });
          }
        }
      }

      // 先打乱、再用稳定排序分层：同档的格子顺序随机，重开不会总挑同一批
      rng.shuffle(cells);
      cells.sort(function (a, b) { return a.tier - b.tier; });

      // 贪心挑选：先要求出生点至少隔 4 格，再放宽到 2 格，最后只要求不重叠
      var picked = [], made = 0, spacing = [4, 2, 0];
      for (var pass = 0; pass < spacing.length && made < count; pass++) {
        for (var i = 0; i < cells.length && made < count; i++) {
          var cell = cells[i];
          if (cell.used) continue;
          var spread = true;
          for (var m = 0; m < picked.length; m++) {
            if (Math.abs(picked[m][0] - cell.c) + Math.abs(picked[m][1] - cell.r) < spacing[pass]) { spread = false; break; }
          }
          if (!spread) continue;
          cell.used = true;
          picked.push([cell.c, cell.r]);
          // 先留足撤离投弹的空间，再让怪物自行炸开外围障碍。
          entities.openSpawnPocket(world, cell.c, cell.r);
          if (!world.nextEntityId) world.nextEntityId = 1;
          world.enemies.push(entities.create(entities.pickType(rng, level, made), cell.c, cell.r, level, world));
          made++;
        }
      }
      return made;
    },

    openSpawnPocket: function (world, c, r) {
      var empty = [[c,r]], bricks = [], seen = {}, opened = 0;
      var neighbors = [[c+1,r],[c-1,r],[c,r+1],[c,r-1]].filter(function(cell) { return G.at(world.map,cell[0],cell[1]) !== T.HARD; });
      neighbors.sort(function(a,b) { return G.at(world.map,a[0],a[1])-G.at(world.map,b[0],b[1]); });
      neighbors.slice(0,2).forEach(function(cell) { G.set(world.map,cell[0],cell[1],T.EMPTY); });
      seen[c+','+r] = true;
      while ((empty.length || bricks.length) && opened < 10) {
        var cell = empty.length ? empty.pop() : bricks.shift();
        G.set(world.map,cell[0],cell[1],T.EMPTY); opened++;
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d) {
          var nc=cell[0]+d[0],nr=cell[1]+d[1],key=nc+','+nr;
          if(seen[key]||!G.inBounds(nc,nr,world.map)||G.at(world.map,nc,nr)===T.HARD)return;
          seen[key]=true;
          (G.at(world.map,nc,nr)===T.EMPTY?empty:bricks).push([nc,nr]);
        });
      }
    },

    /** 清掉死透的敌人（留一小会儿给死亡动画） */
    sweep: function (world) {
      for (var i = world.enemies.length - 1; i >= 0; i--) {
        var e = world.enemies[i];
        if (!e.alive && (world.time - e.deadAt) > 0.7) world.enemies.splice(i, 1);
      }
    },

    clear: function (world) {
      world.enemies.length = 0;
    }
  };

})(window.BI = window.BI || {});
