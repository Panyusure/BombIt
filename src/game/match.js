/* ============================================================
 * match.js —— 对局规则：计时、得分、胜负判定、回合管理
 *
 * 两种模式：
 *   dig    —— 计时拆砖：在限时内炸光所有软砖即胜
 *   versus —— 同屏对战：先得 2 分者胜，超时进入"死亡加速"
 *
 * 这个文件不碰 DOM，可以无头测试。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, T = BI.T, G = BI.grid;

  /** 数地图上还剩多少软砖 */
  function countBricks(map) {
    var n = 0;
    for (var i = 0; i < map.length; i++) if (map[i] === T.BRICK) n++;
    return n;
  }

  var match = BI.match = {

    countBricks: countBricks,

    /** 场上还活着的敌人数（没有敌人系统时返回 0） */
    countEnemies: function (world) {
      if (!world.enemies) return 0;
      var n = 0;
      for (var i = 0; i < world.enemies.length; i++) if (world.enemies[i].alive) n++;
      return n;
    },

    create: function (mode) {
      var m = {
        mode: mode,                                     // 'dig' | 'versus' | 'adventure'
        timeLimit: (mode === 'versus') ? CFG.VERSUS_TIME : CFG.DIG_TIME,
        remaining: 0,
        scores: { p1: 0, p2: 0 },
        targetScore: CFG.VERSUS_TARGET,
        over: false,
        winner: null,                                   // 'p1' | 'p2' | 'draw'
        title: '',
        subtitle: '',
        round: 1,
        level: 1,                                       // 闯关模式：第几关
        levelClearAt: 0,                                // >0 表示已清场，等待进下一关
        sudden: false,                                  // 是否已进入超时加速
        roundEndsAt: 0,                                 // >0 表示本回合刚结束，等待重开
        elapsed: 0,
        startBricks: 0,                                 // 开局软砖数（结算用）
        totalExplosions: 0,
        maxChain: 0
      };
      m.remaining = m.timeLimit;
      return m;
    },

    /** 每帧推进。返回 true 表示「这一帧刚刚分出胜负」 */
    update: function (world, dt) {
      var m = world.match;
      if (!m) return false;

      // 先把这一帧攒下的死亡一起结算，再推进计时。
      // 必须「先批量结算」：否则同帧双死时，第一个人的结算会把比赛判完，
      // 第二个人的分就丢了（设计方案 §4.7 要求同帧双死双方各得 1 分）。
      var ended = match.resolveDeaths(world, m);
      if (m.over) return ended;

      m.elapsed += dt;
      var tickEnded;
      if (m.mode === 'dig') tickEnded = match.stepDig(world, dt, m);
      else if (m.mode === 'versus') tickEnded = match.stepVersus(world, dt, m);
      else tickEnded = match.stepAdventure(world, dt, m);
      return ended || tickEnded;
    },

    /**
     * 登记一次死亡。只入队，真正的计分/判负由 resolveDeaths 统一处理。
     * 这样同一帧里死几个人都是一起算的。
     */
    onDeath: function (world, p) {
      if (!world.pendingDeaths) world.pendingDeaths = [];
      if (world.pendingDeaths.indexOf(p) < 0) world.pendingDeaths.push(p);
    },

    /** 把这一帧攒下的死亡一次性结算掉 */
    resolveDeaths: function (world, m) {
      var list = world.pendingDeaths;
      if (!list || !list.length) return false;
      var dead = list.slice();
      list.length = 0;
      if (m.over) return false;

      // 拆砖 / 闯关模式：命在 world.onDeath 里已经扣过了，这里只判「没命了」
      if (m.mode !== 'versus') {
        var me = world.players[0];
        if (me && me.lives <= 0) {
          var why = (m.mode === 'adventure')
            ? ('闯到了第 ' + m.level + ' 关')
            : ('撑过了 ' + m.elapsed.toFixed(1) + ' 秒');
          return match.finish(world, 'p2', '挑战结束', why);
        }
        return false;
      }

      // 对战模式：这一帧死掉的每个人，各自的对手都加 1 分
      for (var i = 0; i < dead.length; i++) {
        var other = (dead[i].id === 'p1') ? 'p2' : 'p1';
        m.scores[other]++;
      }

      var p1Done = m.scores.p1 >= m.targetScore;
      var p2Done = m.scores.p2 >= m.targetScore;

      if (p1Done && p2Done) return match.settle(world, 'draw');   // 同帧双死且都够分 -> 平局
      if (p2Done) return match.settle(world, 'p2');
      if (p1Done) return match.settle(world, 'p1');

      // 还没到目标分：稍后开新回合
      if (m.roundEndsAt === 0) m.roundEndsAt = world.time + CFG.ROUND_RESTART_DELAY;
      return false;
    },

    /** 记录开局软砖数（地图生成后调用） */
    beginRound: function (world) {
      var m = world.match;
      if (!m) return;
      m.startBricks = countBricks(world.map);
      m.roundEndsAt = 0;
    },

    /* ---------------- 计时拆砖 ---------------- */

    stepDig: function (world, dt, m) {
      m.remaining -= dt;

      if (countBricks(world.map) === 0) {
        var used = m.timeLimit - Math.max(0, m.remaining);
        return match.finish(world, 'p1', '挑战完成',
          '用时 ' + used.toFixed(1) + ' 秒　剩余 ' + Math.max(0, m.remaining).toFixed(1) + ' 秒');
      }
      if (m.remaining <= 0) {
        m.remaining = 0;
        return match.finish(world, 'p2', '时间结束',
          '剩余障碍 ' + countBricks(world.map));
      }
      // 命用完了
      var p = world.players[0];
      if (p && p.lives <= 0) {
        return match.finish(world, 'p2', '挑战结束', '用时 ' + m.elapsed.toFixed(1) + ' 秒');
      }
      return false;
    },

    /* ---------------- 同屏对战 ---------------- */

    stepVersus: function (world, dt, m) {
      // 回合刚结束：等待一会儿再开下一局
      if (m.roundEndsAt > 0) {
        if (world.time >= m.roundEndsAt) {
          m.roundEndsAt = 0;
          if (world.onNewRound) world.onNewRound();
        }
        return false;
      }

      m.remaining -= dt;

      // 超时加速：软砖全清 + 引信缩短，逼出胜负
      if (m.remaining <= 0 && !m.sudden) {
        m.sudden = true;
        m.remaining = CFG.VERSUS_SUDDEN_TIME;
        for (var i = 0; i < world.map.length; i++) {
          if (world.map[i] === T.BRICK) world.map[i] = T.EMPTY;
        }
        if (world.onSuddenDeath) world.onSuddenDeath();
      }
      if (m.sudden && m.remaining <= 0) {
        // 加速阶段还没分出胜负 —— 算平局，各加一分
        m.scores.p1++; m.scores.p2++;
        return match.settle(world, 'draw');
      }
      return false;
    },

    /* ---------------- 闯关打怪 ---------------- */

    /**
     * 清场后进入下一关；第10关清场则结束冒险。
     */
    stepAdventure: function (world, dt, m) {
      if (match.countEnemies(world) > 0) return false;
      if (m.level >= CFG.ADVENTURE_LEVELS) {
        m.levelClearAt = 0;
        return match.finish(world, 'p1', '冒险通关', '已完成全部 ' + CFG.ADVENTURE_LEVELS + ' 关');
      }

      if (m.levelClearAt === 0) {
        m.levelClearAt = world.time + CFG.LEVEL_CLEAR_DELAY;
        return false;
      }
      if (world.time >= m.levelClearAt) {
        m.levelClearAt = 0;
        m.level++;
        if (world.onNextLevel) world.onNextLevel();
      }
      return false;
    },

    /** 判断某玩家是否还能重生（对战模式回合结束时不要重生） */
    canRespawn: function (world, p) {
      var m = world.match;
      if (!m || m.over) return false;
      if (m.mode === 'versus') return m.roundEndsAt === 0;
      return p.lives > 0;
    },

    /* ---------------- 结束 ---------------- */

    settle: function (world, winner) {
      var m = world.match;
      if (m.over) return false;
      m.over = true;
      m.winner = winner;
      m.roundEndsAt = 0;

      if (m.mode === 'versus') {
        if (winner === 'draw') {
          m.title = '平局';
          m.subtitle = '本场对战结束';
        } else {
          m.title = (winner === 'p1' ? '1P' : '2P') + ' 获胜';
          m.subtitle = '比分 ' + m.scores.p1 + ' : ' + m.scores.p2;
        }
      }
      return true;
    },

    /** 单机/拆砖模式的收尾（统一走这里，方便结算界面拿到文案） */
    finish: function (world, winner, title, subtitle) {
      var m = world.match;
      if (m.over) return false;
      m.over = true;
      m.winner = winner;
      m.title = title;
      m.subtitle = subtitle || '';
      return true;
    },

    /** 结算界面用的统计 */
    summary: function (world) {
      var m = world.match;
      var s = {
        mode: m.mode,
        title: m.title,
        subtitle: m.subtitle,
        winner: m.winner,
        elapsed: m.elapsed,
        scores: { p1: m.scores.p1, p2: m.scores.p2 },
        round: m.round,
        level: m.level,
        totalLevels: CFG.ADVENTURE_LEVELS,
        enemiesLeft: match.countEnemies(world),
        bricksLeft: countBricks(world.map),
        bricksCleared: Math.max(0, m.startBricks - countBricks(world.map)),
        startBricks: m.startBricks,
        explosions: world.stats.explosions,
        kills: world.stats.kills || 0,
        maxChain: world.stats.maxChain,
        players: world.players.map(function (p) {
          return {
            id: p.id, name: p.name, charName: p.charName, color: p.color,
            power: p.power, maxBombs: p.maxBombs,
            speed: 1 + p.speedBonus, lives: BI.rules.lifeCount(p),
            picked: p.picked
          };
        })
      };
      return s;
    }
  };

})(window.BI = window.BI || {});
