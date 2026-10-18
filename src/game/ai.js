/* ============================================================
 * ai.js —— 敌人行为
 *
 * 移动模型：**格子锁定**。敌人永远从当前格中心走向目标格中心，
 * 到了再决定下一格。好处是永远不会走歪、不会贴墙抖动，
 * 而且"能不能进这一格"只需要判一次，逻辑非常干净。
 *
 * 决策优先级：
 *   1. 躲危险 —— 脚下有威胁就立刻往安全格跑（威胁图来自 danger.js）
 *   2. 类型化行为 —— 追人 / 放炸弹
 *   3. 随机游走 —— 尽量不原路返回，避免来回抽搐
 *
 * 不碰 DOM，可以无头测试。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, T = BI.T, G = BI.grid, DG = BI.danger, EN = BI.entities;

  var DIRS = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
  ];

  var ai = BI.ai = {
    DIRS: DIRS,
    planningSpeed: function (e) { var stage=EN.bossStage(e); return e.speed * (stage ? stage.speed : 1); },
    moveSpeed: function (e) { return ai.planningSpeed(e) * BI.skills.slowFactor(e); },
    bombQuota: function (e) { var stage=EN.bossStage(e); return Math.max(e.maxBombs || 1,stage && stage.id===3 ? 2 : 1); },

    /* ============================================================
     * 距离场：NPC 接近玩家时用它选择可走方向
     * 从玩家所在格计算带炸砖代价的距离，优先空地绕行。
     * 同一帧多个 NPC 共用一份，玩家移动或障碍变化时重算。
     * ============================================================ */
    target: function (world, e) {
      var best = null, distance = Infinity;
      world.players.forEach(function (p) {
        if (!p.alive) return;
        var d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
        if (d < distance) { distance = d; best = p; }
      });
      return best;
    },

    aggression: function (e) {
      var level = EN.difficultyLevel(e.level);
      var profile = { range: Math.min(9, 4 + Math.floor((level - 1) / 2)),
        cooldown: Math.max(.55, 1 - (level - 1) * .035),
        hunt: Math.min(1, .65 + (level - 1) * .04),
        abilityGap: Math.max(4.8, CFG.BOSS_POISON_GAP - Math.max(0, level - 5) * .08) };
      var stage=EN.bossStage(e);
      if(stage && stage.id===2)profile.hunt=Math.max(.9,profile.hunt);
      if(stage && stage.id===3){profile.hunt=1;profile.range=9;profile.cooldown*=.55;profile.abilityGap*=CFG.BOSS_POISON_RAGE_FACTOR;}
      return profile;
    },

    field: function (world, e) {
      var p = e ? ai.target(world, e) : world.players.filter(function (p) { return p.alive; })[0];
      if (!p || !p.alive) return null;
      var pc = G.col(p.x), pr = G.row(p.y);
      var stage=EN.bossStage(e),breakHard=!!(stage && stage.breakHard),cacheKey=breakHard?'_aiBreakField':'_aiField';
      var cache = world[cacheKey];
      if (cache && cache.map === world.map && cache.revision === world.map.revision && cache.c === pc && cache.r === pr && (world.time - cache.t) < 0.25) {
        return cache.data;
      }
      var data = ai.buildField(world, pc, pr, true, breakHard);
      world[cacheKey] = { map: world.map, revision: world.map.revision, c: pc, r: pr, t: world.time, data: data };
      return data;
    },

    buildField: function (world, tc, tr, breakable, breakHard) {
      var COLS = G.cols(world.map), ROWS = G.rows(world.map);
      var d = new Int16Array(COLS * ROWS);
      d.fill(-1);
      if (!G.inBounds(tc, tr, world.map)) return d;

      var start = tr * COLS + tc;
      if (G.isWall(world.map, tc, tr)) return d;
      d[start] = 0;

      var q = [start], head = 0;
      while (head < q.length) {
        // 带砖块代价时用 Dijkstra；优先绕行，必须开路时才选择炸砖。
        if (breakable) {
          var next = head;
          for (var k = head + 1; k < q.length; k++) if (d[q[k]] < d[q[next]]) next = k;
          var tmp = q[head]; q[head] = q[next]; q[next] = tmp;
        }
        var cur = q[head++];
        var c = cur % COLS, r = (cur - c) / COLS;
        for (var i = 0; i < 4; i++) {
          var nc = c + DIRS[i].x, nr = r + DIRS[i].y;
          if (!G.inBounds(nc, nr, world.map)) continue;
          if ((G.at(world.map, nc, nr) === T.HARD && !(breakHard && G.canBreakHard(world.map,nc,nr))) || (!breakable && G.isWall(world.map, nc, nr))) continue;
          var ni = nr * COLS + nc;
          var cost = d[cur] + (G.at(world.map,c,r)===T.HARD ? 7 : breakable && G.at(world.map, c, r) === T.BRICK ? 4 : 1);
          if (d[ni] !== -1 && d[ni] <= cost) continue;
          d[ni] = cost;
          q.push(ni);
        }
      }
      return d;
    },

    /* ============================================================
     * 每帧推进
     * ============================================================ */
    updateEnemy: function (world, e, dt) {
      if (!e.alive) { e.moving = false; return; }

      e.px = e.x; e.py = e.y;
      EN.syncBossPhase(world, e);
      if (world.timeStop && world.timeStop.remaining > 0) { e.moving = false; return; }
      // Environmental movement applies to every living enemy, including bosses.
      // Park riders, like players, can walk off; the factory belt always pushes.
      var carried = BI.scenery.carry(world, e, dt, !!(e.dir && e.moving && !e.stun && !e.windup));
      if (carried) {
        e.sceneryMotion = true;
        if (e.dir) {
          var c = G.col(e.x), r = G.row(e.y);
          var passed = (G.centerX(e.tc) - e.x) * e.dir.x + (G.centerY(e.tr) - e.y) * e.dir.y < -.001;
          var outside = !((c === e.fromC && r === e.fromR) || (c === e.tc && r === e.tr));
          if (passed || outside) { e.dir = null; e.returning = false; }
        }
      }
      if (e.stun > 0) { e.stun = Math.max(0, e.stun - dt); e.moving = carried; return; }
      e.phaseFlash = Math.max(0,(e.phaseFlash || 0)-dt);
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
      if (e.bombCd > 0) e.bombCd -= dt;

      if (e.ai === 'boss') ai.bossAbility(world, e, dt);
      if (e.windup > 0) {
        e.windup = Math.max(0, e.windup - dt); e.moving = carried;
        if (e.windup > 0) return;
        var bc = G.col(e.x), br = G.row(e.y);
        if (ai.placeBomb(world, e, bc, br)) {
          e.bombCd = (e.bombGap + world.rng() * 1.2) * ai.aggression(e).cooldown;
          e.queuedBomb = false;
          ai.apply(e, e.escapePath[0]);
        } else { e.bombCd = 2; e.dir = null; }
      }
      if (!e.dir) {
        ai.decide(world, e);
        if (!e.dir) { e.moving = carried; return; }   // 被堵死时仍可随场景运送
      }

      // 玩家可能在它移动途中封住下一格；回退到原来的格心重新规划。
      if (!e.returning && G.bombBlocks(world.bombs, e.tc, e.tr, null)) {
        if (e.glove) BI.motion.pushCheck(world, e, e.dir.x, e.dir.y);
        e.tc = e.fromC == null ? G.col(e.x) : e.fromC;
        e.tr = e.fromR == null ? G.row(e.y) : e.fromR;
        e.returning = true;
      }
      var tx = G.centerX(e.tc), ty = G.centerY(e.tr);
      var step = ai.moveSpeed(e) * CFG.TILE * dt;
      var dx = tx - e.x, dy = ty - e.y;

      // A conveyor can move an actor off its original lane. Follow waypoints
      // with real body collision until aligned again; never snap through walls.
      if (e.sceneryMotion) {
        ai.moveCarriedEnemy(world, e, tx, ty, step, carried);
        return;
      }

      if (Math.abs(dx) + Math.abs(dy) <= step) {
        // 到达目标格中心，立刻决定下一格
        e.x = tx; e.y = ty;
        e.moving = false;
        ai.decide(world, e);
      } else {
        if (dx !== 0) {
          e.x += (dx > 0 ? 1 : -1) * Math.min(step, Math.abs(dx));
          e.facing = dx > 0 ? 1 : -1;
        }
        if (dy !== 0) {
          e.y += (dy > 0 ? 1 : -1) * Math.min(step, Math.abs(dy));
        }
        e.moving = true;
      }
    },

    moveCarriedEnemy: function (world, e, tx, ty, distance, carried) {
      var moved = false;
      // Align the cross-axis before continuing along the selected corridor.
      var axes = e.dir.x ? ['y', 'x'] : ['x', 'y'];
      for (var i = 0; i < axes.length && distance > 1e-9; i++) {
        var axis = axes[i], delta = (axis === 'x' ? tx : ty) - e[axis];
        var amount = Math.min(Math.abs(delta), distance);
        var parts = Math.max(1, Math.ceil(amount / 2));
        for (var n = 0; n < parts && amount > 1e-9; n++) {
          var x = e.x, y = e.y, d = Math.sign(delta) * amount / parts;
          if (axis === 'x') x += d; else y += d;
          if (!G.canMoveEnemy(world, e, x, y)) {
            e.dir = null; e.moving = carried || moved; return;
          }
          e.x = x; e.y = y; moved = true;
          if (axis === 'x') e.facing = Math.sign(delta);
        }
        distance -= amount;
      }
      e.moving = carried || moved;
      if (Math.abs(tx - e.x) + Math.abs(ty - e.y) < 1e-7) {
        e.sceneryMotion = false;
        ai.decide(world, e);
      }
    },

    /** 选定下一个目标格 */
    decide: function (world, e) {
      var c = G.col(e.x), r = G.row(e.y);

      // 可走的邻居
      var opts = [];
      for (var i = 0; i < 4; i++) {
        var d = DIRS[i];
        var nc = c + d.x, nr = r + d.y;
        if (!G.inBounds(nc, nr, world.map)) continue;
        if (G.isWall(world.map, nc, nr)) continue;
        if (G.bombBlocks(world.bombs, nc, nr, null)) continue;
        opts.push({ x: d.x, y: d.y, c: nc, r: nr });
      }
      if (!opts.length) { e.dir = null; return; }

      // 在危险刚出现时就规划完整逃生路线，不能等到只剩 0.45 秒才逃。
      var timeline = DG.timeline(world);
      var hereWindows = timeline.windows[r * timeline.cols + c];
      if (hereWindows.length) {
        var escape = ai.findEscape(world, e, null, timeline);
        if (escape && escape.length) { ai.apply(e, escape[0]); return; }
      }
      // 未来的减速影响实际移动，不影响怪物原本的逃生判断。
      var travel = 1 / ai.planningSpeed(e) + .18;
      var safe = opts.filter(function (o) { return ai.safeDuring(timeline, o.c, o.r, 0, travel); });
      // 脚下已安全却没有安全出口时，留在避难格，避免重新走回自己的火焰。
      if (!hereWindows.length && !safe.length) { e.dir = null; return; }
      var pool = safe.length ? safe : ai.leastDangerousPool(world, opts);

      // ---- 2. 类型化行为 ----
      if (e.ai === 'bomb' || e.ai === 'boss') {
        if (ai.bombStep(world, e, pool, c, r)) return;
      }

      // ---- 3. 随机游走（尽量不原路返回）----
      var pool2 = pool;
      if (e.lastX !== undefined || e.lastY !== undefined) {
        var nostep = [];
        for (var k = 0; k < pool.length; k++) {
          if (pool[k].x === -e.lastX && pool[k].y === -e.lastY) continue;
          nostep.push(pool[k]);
        }
        if (nostep.length) pool2 = nostep;
      }
      ai.apply(e, world.rng.pick(pool2));
    },

    apply: function (e, opt) {
      if (e.dir) { e.lastX = e.dir.x; e.lastY = e.dir.y; }
      e.dir = { x: opt.x, y: opt.y };
      e.fromC = G.col(e.x); e.fromR = G.row(e.y); e.returning = false;
      e.tc = opt.c;
      e.tr = opt.r;
    },

    /** 朝玩家方向走一步 */
    stepToward: function (world, e, pool) {
      var f = ai.field(world, e);
      if (!f) return false;
      var COLS = G.cols(world.map);
      var best = null, bestD = 1e9;
      for (var i = 0; i < pool.length; i++) {
        var o = pool[i];
        var d = f[o.r * COLS + o.c];
        if (d < 0) continue;                 // 玩家那边走不过去
        if (d < bestD) { bestD = d; best = o; }
      }
      if (!best) return false;
      ai.apply(e, best);
      return true;
    },

    farthestFromPlayer: function (world, pool, c, r) {
      var p = ai.target(world, {x: G.centerX(c), y: G.centerY(r)});
      if (!p) return pool[0];
      var pc = G.col(p.x), pr = G.row(p.y);
      var best = pool[0], bestD = -1;
      for (var i = 0; i < pool.length; i++) {
        var o = pool[i];
        var d = Math.abs(o.c - pc) + Math.abs(o.r - pr);
        if (d > bestD) { bestD = d; best = o; }
      }
      return best;
    },

    /**
     * 所有候选格都在危险里时，挑「剩余时间最多」的那几格。
     * 正在燃烧（-1）的格子除非无处可去，否则一律排除。
     */
    leastDangerousPool: function (world, pool) {
      var notBurning = [], maxV = -1;
      var i, v;
      for (i = 0; i < pool.length; i++) {
        v = DG.at(world, pool[i].c, pool[i].r);
        if (v >= 0) notBurning.push(pool[i]);
      }
      var use = notBurning.length ? notBurning : pool;

      for (i = 0; i < use.length; i++) {
        v = DG.at(world, use[i].c, use[i].r);
        if (v > maxV) maxV = v;
      }
      var out = [];
      for (i = 0; i < use.length; i++) {
        if (DG.at(world, use[i].c, use[i].r) >= maxV) out.push(use[i]);
      }
      return out.length ? out : pool;
    },

    /**
     * 投弹 NPC：接近到四格内时预备放弹，然后沿安全路线撤退。
     * 所有角色共用 CFG.FUSE；投弹前仍需确认能及时撤离。
     */
    bombStep: function (world, e, pool, c, r) {
      var p = ai.target(world, e);
      if (!p || !p.alive) return false;

      var pc = G.col(p.x), pr = G.row(p.y);
      var dist = Math.abs(pc - c) + Math.abs(pr - r);

      var own = world.bombs.filter(function (b) { return b.ownerId === e.id; }).length;
      var pressure = world.bombs.filter(function (b) { return b.byEnemy; }).length;
      var ready = e.bombCd <= 0, profile = ai.aggression(e);
      var stage=EN.bossStage(e),rage=!!(stage && stage.breakHard);
      var field = ai.field(world, e), cols = G.cols(world.map), here = field && field[r * cols + c];
      var blockedRoute = field && DIRS.some(function (d) {
        var nc = c + d.x, nr = r + d.y;
        return (G.at(world.map, nc, nr) === T.BRICK || (rage && G.canBreakHard(world.map,nc,nr))) && field[nr * cols + nc] >= 0 && field[nr * cols + nc] < here;
      });
      var inRange = dist <= profile.range;
      // 目标被障碍隔开时，炸开通路；不会隔着硬墙盲目放弹。
      var attack = inRange && dist <= e.power + 1 && ai.canThreaten(world, e, pc, pr);
      if (ready && own < ai.bombQuota(e) && pressure < (world.map.bossBattle ? 4 : 2) && (attack || blockedRoute) &&
          !DG.isHot(world, c, r) && pool.length > 0) {
        // 先验证有逃生路线，再给玩家明确的投弹预备动作。
        var trial = { cx: c, cy: r, power: e.power, fuse: ai.fuseFor(e), ownerId: e.id, breakHard: rage };
        if (ai.findEscape(world, e, trial)) {
          e.windup = .7; e.dir = null; e.moving = false;
          return true;
        }
      }
      if ((own && !rage) || (e.type === 'claude' && dist < 3)) {
        ai.apply(e, ai.farthestFromPlayer(world, pool, c, r)); return true;
      }
      if (!rage && ai.seekItem(world, e, pool, c, r)) return true;
      if (!world.rng.chance(profile.hunt)) return false;
      return ai.stepToward(world, e, pool);
    },

    canThreaten: function (world, e, pc, pr) {
      var c = G.col(e.x), r = G.row(e.y);
      // 直线攻击或玩家附近的布防；远处优先开路与接近。
      if (Math.abs(pc - c) + Math.abs(pr - r) <= 2) return true;
      if (pc !== c && pr !== r) return false;
      var dc = Math.sign(pc - c), dr = Math.sign(pr - r);
      for (var k = 1; k < Math.abs(pc - c) + Math.abs(pr - r); k++) {
        if (G.isWall(world.map, c + dc * k, r + dr * k)) return false;
      }
      return true;
    },

    seekItem: function (world, e, pool, c, r) {
      var best = null, length = 6;
      world.items.forEach(function (it) {
        if (Math.abs(it.c-c)+Math.abs(it.r-r) > 5) return;
        if ((it.type === 'glove' && e.glove) ||
            ((it.type === 'shield' || it.type === 'fruit') && e.shield) ||
            (it.type === 'star' && e.starTime > 1) || (it.type === 'speed' && e.speedBonus >= CFG.SPEED_MAX_BONUS) ||
            (it.type === 'fire' && e.power >= CFG.MAX_POWER) || (it.type === 'bomb' && e.maxBombs >= 3)) return;
        var f = ai.buildField(world, it.c, it.r), cols = G.cols(world.map);
        var distance = f[r * cols + c];
        if (distance <= 0 || distance >= length) return;
        pool.forEach(function (o) {
          if (f[o.r * cols + o.c] === distance - 1) { best = o; length = distance; }
        });
      });
      if (!best) return false;
      ai.apply(e, best); return true;
    },

    fuseFor: function () { return CFG.FUSE; },

    bossAbility: function (world, e, dt) {
      EN.syncBossPhase(world,e);
      var stage=EN.bossStage(e);
      if(!stage || !stage.poison)return;
      e.abilityCd -= dt;
      if (e.abilityCd > 0) return;
      e.abilityCd = ai.aggression(e).abilityGap + world.rng() * .8;
      ai.castForks(world, e);
    },

    castForks: function (world, e) {
      var stage=EN.bossStage(e);
      if(!e.alive || !stage || !stage.poison)return;
      var list = world.poison || (world.poison = []), used = {};
      list.forEach(function (f) { used[f.c + ',' + f.r] = true; });
      var cols = G.cols(world.map), rows = G.rows(world.map), p = ai.target(world, e);
      var made = 0, count = world.map.bossBattle ? 6 : 12;
      for (var attempts = 0; attempts < 150 && made < count; attempts++) {
        // 四个落点随机散布在玩家附近，其余落点随机覆盖全场；全部先预警。
        var near = made < (world.map.bossBattle ? 2 : 4) && p;
        var c = near ? G.col(p.x) + Math.floor(world.rng() * 7) - 3 : 1 + Math.floor(world.rng() * (cols - 2));
        var r = near ? G.row(p.y) + Math.floor(world.rng() * 7) - 3 : 1 + Math.floor(world.rng() * (rows - 2));
        var key = c + ',' + r;
        if (c < 1 || r < 1 || c >= cols - 1 || r >= rows - 1 || used[key] || G.isWall(world.map, c, r)) continue;
        used[key] = true;
        list.push({ c: c, r: r, warn: CFG.BOSS_POISON_WARN, life: CFG.BOSS_POISON_LIFE, ownerId: e.id }); made++;
      }
    },

    placeBomb: function (world, e, c, r) {
      // 多只怪物可能同时结束预备动作，真正投弹时再次检查配额。
      if (world.bombs.filter(function (b) { return b.ownerId === e.id; }).length >= ai.bombQuota(e) ||
          world.bombs.filter(function (b) { return b.byEnemy; }).length >= (world.map.bossBattle ? 4 : 2)) return false;
      if (world.bombs.some(function(other) {
        var pos=G.bombPosition(other);
        return (other.cx===c&&other.cy===r)||Math.hypot(pos.x-G.centerX(c),pos.y-G.centerY(r)) < CFG.BOMB_RADIUS*2+1;
      })) return false;
      var stage=EN.bossStage(e);
      var bomb = {
        cx: c, cy: r, power: e.power,
        fuse: ai.fuseFor(e), fuseTotal: ai.fuseFor(e),
        ownerId: e.id, freeFor: null,
        passFor: world.players.filter(function (p) {
          return p.alive && Math.hypot(p.x - G.centerX(c), p.y - G.centerY(r)) < CFG.BOMB_RADIUS + CFG.PLAYER_BOMB_RADIUS;
        }).map(function (p) { return p.id; }), color: stage ? stage.color : e.color, slide: null, byEnemy: true,
        breakHard: !!(stage && stage.breakHard)
      };
      var route = ai.findEscape(world, e, bomb);
      if (!route || !route.length) return false; // 没有足够时间抵达避难格，放弃本次投弹。
      world.bombs.push(bomb);
      e.escapePath = route;
      DG.compute(world); // 同帧后行动的怪物也要看到这颗新炸弹。
      if (world.onEnemyBomb) world.onEnemyBomb(e);
      return true;
    },

    safeDuring: function (timeline, c, r, start, end) {
      return timeline.windows[r * timeline.cols + c].every(function (w) {
        return end < w[0] - .12 || start > w[1] + .12;
      });
    },

    findEscape: function (world, e, bomb, timeline) {
      timeline = timeline || DG.timeline(world, bomb);
      var c = G.col(e.x), r = G.row(e.y), duration = 1 / ai.planningSpeed(e) + 1 / 60;
      // Grid travel times cannot promise a retreat while a faster belt carries
      // the monster or its bomb. Only initiate a throw with an off-track route.
      // Emergency evasion of existing bombs can still use every open cell.
      var track = world.map.landmark && world.map.landmark.path || [];
      function onTrack(c, r) { return track.some(function (cell) { return cell[0] === c && cell[1] === r; }); }
      if (bomb && onTrack(c, r)) return null;
      var q = [{ c: c, r: r, t: 0, path: [] }], head = 0, visited = {};
      visited[c + ',' + r] = true;
      var p = ai.target(world, e);
      var dirs = DIRS.slice().sort(function (a, b) {
        if (!p) return 0;
        return (Math.abs(c + b.x - G.col(p.x)) + Math.abs(r + b.y - G.row(p.y))) -
          (Math.abs(c + a.x - G.col(p.x)) + Math.abs(r + a.y - G.row(p.y)));
      });
      while (head < q.length) {
        var cur = q[head++];
        if (cur.path.length && ai.safeDuring(timeline, cur.c, cur.r, cur.t, 60)) return cur.path;
        for (var i = 0; i < dirs.length; i++) {
          var d = dirs[i], nc = cur.c + d.x, nr = cur.r + d.y, key = nc + ',' + nr;
          if (!G.inBounds(nc, nr, world.map) || visited[key] || G.isWall(world.map, nc, nr)) continue;
          if (bomb && onTrack(nc, nr)) continue;
          var arrival = cur.t + duration;
          // 整段移动都留有余量，不依赖擦着火焰边缘侥幸逃生。
          if (!ai.safeDuring(timeline, cur.c, cur.r, cur.t, arrival + .10) ||
              !ai.safeDuring(timeline, nc, nr, cur.t, arrival + .10)) continue;
          var blocked = timeline.bombs.some(function (b, j) {
            return b.cx === nc && b.cy === nr && cur.t < timeline.times[j] + CFG.FLAME_TIME;
          });
          if (blocked) continue;
          visited[key] = true;
          q.push({ c: nc, r: nr, t: arrival, path: cur.path.concat([{ x: d.x, y: d.y, c: nc, r: nr }]) });
        }
      }
      return null;
    },

    /** 敌人初始化时挑个方向，免得开局站着不动 */
    wake: function (world, e) {
      ai.decide(world, e);
    }
  };

})(window.BI = window.BI || {});
