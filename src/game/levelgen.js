/* ============================================================
 * levelgen.js —— 地图生成 + 出生点保护 + 连通性校验
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, T = BI.T, G = BI.grid;
  var COLS = CFG.COLS, ROWS = CFG.ROWS;

  /** 一个格子有几个「不是硬墙」的邻居 */
  function openExits(map, c, r) {
    var COLS = G.cols(map), ROWS = G.rows(map), n = 0;
    if (c + 1 < COLS && map[r * COLS + c + 1] !== T.HARD) n++;
    if (c - 1 >= 0 && map[r * COLS + c - 1] !== T.HARD) n++;
    if (r + 1 < ROWS && map[(r + 1) * COLS + c] !== T.HARD) n++;
    if (r - 1 >= 0 && map[(r - 1) * COLS + c] !== T.HARD) n++;
    return n;
  }

  /**
   * 整张图的结构是否合格。
   *
   * 两条要求（软砖一律算可通行，因为它能被炸开）：
   *   1. **全图连通** —— 所有非硬墙格子互相连通，不许有走不到的格点
   *   2. 每个非硬墙格子至少有 minExits 个非硬墙邻居
   *
   * 默认 minExits = 1，此时第 2 条其实被第 1 条蕴含（能连通就至少有 1 个出口），
   * 真正把关的是连通性：**允许只有一条进出的走廊，但不允许道路封死的孤岛**。
   * 想把死路也一起禁掉，把 CFG.MIN_EXITS 调成 2 即可。
   */
  function structureOk(map, minExits) {
    var COLS = G.cols(map), ROWS = G.rows(map);
    var total = 0, start = -1;
    for (var i = 0; i < map.length; i++) {
      if (map[i] === T.HARD) continue;
      total++;
      if (start < 0) start = i;
    }
    if (start < 0) return false;

    if (minExits > 0) {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (map[r * COLS + c] === T.HARD) continue;
          if (openExits(map, c, r) < minExits) return false;
        }
      }
    }

    var vis = new Uint8Array(map.length);
    var q = [start], head = 0, seen = 1;
    vis[start] = 1;
    while (head < q.length) {
      var cur = q[head++];
      var cc = cur % COLS, rr = (cur - cc) / COLS;
      var nb = [[cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]];
      for (var k = 0; k < 4; k++) {
        var nc = nb[k][0], nr = nb[k][1];
        if (!G.inBounds(nc, nr, map)) continue;
        var ni = nr * COLS + nc;
        if (vis[ni] || map[ni] === T.HARD) continue;
        vis[ni] = 1; seen++; q.push(ni);
      }
    }
    return seen === total;
  }

  /**
   * 随机铺硬墙。
   *
   * 手法是「**构造即合法**」：每放一块就立刻验证，一旦破坏结构当场撤销。
   * 比「先随便生成再反复重试碰运气」可靠得多 —— 后者墙一多几乎永远撞不出合法图。
   *
   * 出生点及其紧邻格不参与，免得一出生就贴着墙。
   */
  // 中央设施使用真实的 3×3 碰撞占地，外围预留完整环路。
  function isCore(theme, c, r) {
    return !!BI.THEMES[theme] && c >= 6 && c <= 8 && r >= 5 && r <= 7;
  }
  function scenicLane(c, r, theme) {
    if (theme === 'factory') return c >= 4 && c <= 10 && r >= 3 && r <= 9;
    if (theme === 'park') return c >= 4 && c <= 10 && r >= 3 && r <= 9;
    return theme === 'forest' && c >= 5 && c <= 9 && r >= 4 && r <= 8;
  }
  function reservedTrack(theme, c, r) {
    if (theme === 'forest') return false;
    var left = theme === 'factory' ? 4 : 5, right = theme === 'factory' ? 10 : 9;
    var top = theme === 'factory' ? 3 : 4, bottom = theme === 'factory' ? 9 : 8;
    return c >= left && c <= right && r >= top && r <= bottom &&
      (c === left || c === right || r === top || r === bottom);
  }
  function loop(left, top, right, bottom) {
    var path = [], c, r;
    for (c = left; c < right; c++) path.push([c, top]);
    for (r = top; r < bottom; r++) path.push([right, r]);
    for (c = right; c > left; c--) path.push([c, bottom]);
    for (r = bottom; r > top; r--) path.push([left, r]);
    return path;
  }
  function decorate(map, theme, rng) {
    map.landmark = BI.THEMES[theme] ? { theme: theme, c: 7, r: 6,
      path: theme === 'factory' ? loop(4, 3, 10, 9) : (theme === 'park' ? loop(5, 4, 9, 8) : []),
      fruitTimer: 8 } : null;
    map.variants = new Uint8Array(map.length);
    var bricks = [];
    for (var i = 0; i < map.length; i++) if (map[i] === T.BRICK) bricks.push(i);
    rng.shuffle(bricks);
    bricks.forEach(function (cell, index) { map.variants[cell] = index % (theme === 'forest' ? 4 : 3); });
    return map;
  }

  function placeWalls(rng, map, spawns, target, minExits, theme) {
    var cand = [], r, c, i;

    for (r = 1; r < ROWS - 1; r++) {
      for (c = 1; c < COLS - 1; c++) {
        var near = false;
        for (i = 0; i < spawns.length; i++) {
          if (Math.abs(spawns[i][0] - c) + Math.abs(spawns[i][1] - r) <= CFG.SAFE_RADIUS) {
            near = true; break;
          }
        }
        if (!near && !scenicLane(c, r, theme)) cand.push([c, r]);
      }
    }

    // Fisher-Yates（不依赖 rng 有没有 shuffle）
    for (i = cand.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = cand[i]; cand[i] = cand[j]; cand[j] = t;
    }

    var placed = 0;
    for (i = 0; i < cand.length && placed < target; i++) {
      var cc = cand[i][0], rr = cand[i][1];
      var idx = rr * COLS + cc;
      map[idx] = T.HARD;
      if (structureOk(map, minExits)) placed++;
      else map[idx] = T.EMPTY;          // 破坏结构，当场撤销
    }
    return placed;
  }

  /** 铺一张地图：外围硬墙 + 硬墙骨架 + 软砖 + 出生点保护 */
  function buildMap(rng, rate, spawns, theme) {
    var map = new Uint8Array(COLS * ROWS);
    var r, c, i;

    // 外围一圈
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        if (c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1) {
          map[r * COLS + c] = T.HARD;
        }
      }
    }

    if (BI.THEMES[theme]) {
      for (r = 5; r <= 7; r++) for (c = 6; c <= 8; c++) map[r * COLS + c] = T.HARD;
    }
    if (CFG.RANDOM_WALLS) {
      var interior = (COLS - 2) * (ROWS - 2);
      placeWalls(rng, map, spawns,
                 Math.max(0, Math.round(interior * CFG.WALL_RATE) - (BI.THEMES[theme] ? 9 : 0)), CFG.MIN_EXITS, theme);
    } else {
      // 经典棋盘格柱子（留作对照）
      for (r = 2; r < ROWS - 1; r += 2) {
        for (c = 2; c < COLS - 1; c += 2) if (!scenicLane(c, r, theme)) map[r * COLS + c] = T.HARD;
      }
    }

    // 剩下的空格按概率撒软砖
    for (i = 0; i < map.length; i++) {
      var rr = Math.floor(i / COLS), cc = i % COLS;
      var density = reservedTrack(theme, cc, rr) ? 0 : rate;
      if (map[i] === T.EMPTY && rng() < density) map[i] = T.BRICK;
    }

    // 出生点保护：菱形范围内清掉软砖（硬墙不动）
    for (i = 0; i < spawns.length; i++) {
      clearArea(map, spawns[i][0], spawns[i][1], CFG.SAFE_RADIUS);
    }
    return decorate(map, theme, rng);
  }

  function clearArea(map, c0, r0, rad) {
    var COLS = G.cols(map), ROWS = G.rows(map);
    for (var dr = -rad; dr <= rad; dr++) {
      for (var dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dc) + Math.abs(dr) > rad) continue;
        var c = c0 + dc, r = r0 + dr;
        if (!G.inBounds(c, r, map)) continue;
        if (map[r * COLS + c] === T.BRICK) map[r * COLS + c] = T.EMPTY;
      }
    }
  }

  /**
   * 从起点 BFS。
   * passable(值) 决定什么算「能走」：
   *   - 判定最终可达性时，软砖也算能走（因为它能被炸掉）
   *   - 想统计「开局不用炸就能走到哪」时，只算空地
   */
  function bfs(map, startIdx, passable) {
    var COLS = G.cols(map), ROWS = G.rows(map);
    var vis = new Uint8Array(COLS * ROWS);
    var q = [startIdx], head = 0;
    vis[startIdx] = 1;
    while (head < q.length) {
      var cur = q[head++];
      var c = cur % COLS, r = (cur - c) / COLS;
      var nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
      for (var i = 0; i < 4; i++) {
        var nc = nb[i][0], nr = nb[i][1];
        if (!G.inBounds(nc, nr, map)) continue;
        var ni = nr * COLS + nc;
        if (vis[ni]) continue;
        if (!passable(map[ni])) continue;
        vis[ni] = 1; q.push(ni);
      }
    }
    return vis;
  }

  var isNotHard = function (v) { return v !== T.HARD; };
  var isEmpty = function (v) { return v === T.EMPTY; };

  function countBricks(map) {
    var n = 0;
    for (var i = 0; i < map.length; i++) if (map[i] === T.BRICK) n++;
    return n;
  }

  /**
   * 校验地图是否可玩。
   *
   * 注意：这里**不能**用「开局不用炸就能走到的空地比例」当标准。
   * 泡泡堂的地图本来就该到处是软砖，要一路炸过去 ——
   * 用那个标准会把 8 成以上的正常地图误判成废图，退化成空白地图。
   *
   * 真正的可玩性判据只有两条：
   *   1. 所有出生点互相连通（把软砖视为可通行，因为它能被炸开）
   *   2. 每一块软砖都挨着一个可达格 —— 否则那块砖永远炸不到，
   *      拆砖模式就成了死局
   * 第 2 条同时也保证了「敌人 / 道具不会被困在炸不到的角落」。
   */
  function validate(map, spawns, mode) {
    var COLS = G.cols(map), ROWS = G.rows(map);
    var start = spawns[0][1] * COLS + spawns[0][0];

    // 最终可达性：软砖算可通行
    var vis = bfs(map, start, isNotHard);

    var spawnsOk = true;
    for (var s = 0; s < spawns.length; s++) {
      if (!vis[spawns[s][1] * COLS + spawns[s][0]]) { spawnsOk = false; break; }
    }

    var total = 0, bricks = 0, deadBricks = 0, reachableOpen = 0, reachableBricks = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var i = r * COLS + c;
        var v = map[i];
        if (v === T.HARD) continue;
        total++;
        if (vis[i]) { if (v === T.BRICK) reachableBricks++; else reachableOpen++; }

        if (v !== T.BRICK) continue;
        bricks++;
        // 这块砖四周有没有可达格？
        var touch = false;
        var nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
        for (var k = 0; k < 4; k++) {
          if (!G.inBounds(nb[k][0], nb[k][1], map)) continue;
          if (vis[nb[k][1] * COLS + nb[k][0]]) { touch = true; break; }
        }
        if (!touch) deadBricks++;
      }
    }

    // 信息用：开局不用炸就能走到的空地数
    var visNow = bfs(map, start, isEmpty);
    var openNow = 0;
    for (var j = 0; j < visNow.length; j++) if (visNow[j]) openNow++;

    // 结构：出口不足的格子 = 死路。
    // 随机铺墙时这一步由 placeWalls 逐块保证，这里只是兜底复查，
    // 万一以后有人改动生成逻辑破坏了它，测试能立刻发现。
    var deadEnds = 0;
    if (CFG.MIN_EXITS > 0) {
      for (var rr = 0; rr < ROWS; rr++) {
        for (var cc = 0; cc < COLS; cc++) {
          if (map[rr * COLS + cc] === T.HARD) continue;
          if (openExits(map, cc, rr) < CFG.MIN_EXITS) deadEnds++;
        }
      }
    }

    return {
      ok: spawnsOk && deadBricks === 0 && deadEnds === 0,
      spawnsOk: spawnsOk,
      bricks: bricks,
      deadBricks: deadBricks,
      deadEnds: deadEnds,
      reachableOpen: reachableOpen,
      reachableBricks: reachableBricks,
      openNow: openNow,
      total: total
    };
  }

  BI.levelgen = {
    // BOSS 使用常规三主题布局，包括中央设施、环路和可破坏障碍。
    generateBoss: function (rng, previousTheme, requestedTheme) {
      var level = BI.levelgen.generate(rng, { mode: 'adventure', previousTheme: previousTheme, theme: requestedTheme });
      level.map.bossBattle = true;
      return level;
    },
    buildMap: buildMap,
    isCore: isCore,
    bfs: bfs,
    validate: validate,
    openExits: openExits,
    structureOk: structureOk,

    /**
     * 生成一张地图。
     * opts: { mode:'versus'|'adventure'|'dig', spawns:[[c,r],...], seed:number }
     */
    generate: function (rng, opts) {
      opts = opts || {};
      var mode = opts.mode || 'versus';
      var themes = Object.keys(BI.THEMES).filter(function (id) { return id !== opts.previousTheme; });
      var theme = BI.THEMES[opts.theme] && opts.theme !== opts.previousTheme ? opts.theme : rng.pick(themes);
      var spawns = opts.spawns || [[1, 1], [COLS - 2, ROWS - 2]];
      var rate = CFG.BRICK_RATE[mode];
      if (rate == null) rate = 0.42;

      for (var i = 1; i <= CFG.CONNECT_TRIES; i++) {
        var map = buildMap(rng, rate, spawns, theme);
        var v = validate(map, spawns, mode);
        if (v.ok) {
          return { map: map, theme: theme, spawns: spawns, attempts: i, stats: v, degraded: false };
        }
      }

      // 兜底：先用稀疏软砖再试一次。
      // 注意不能直接退化成「一块砖都没有」—— 拆砖模式的胜利条件是
      // 「软砖清空」，空地图会变成开局瞬间获胜，等于没得玩。
      var sparse = buildMap(rng, 0.12, spawns, theme);
      var sv = validate(sparse, spawns, mode);
      if (sv.ok && countBricks(sparse) > 0) {
        return { map: sparse, theme: theme, spawns: spawns, attempts: CFG.CONNECT_TRIES, stats: sv, degraded: true };
      }

      // 最后兜底：一块砖都没有。宁可简单，也不能开局就死局 / 卡死。
      var safe = buildMap(rng, 0, spawns, theme);
      return {
        map: safe, theme: theme, spawns: spawns, attempts: CFG.CONNECT_TRIES,
        stats: validate(safe, spawns, mode), degraded: true
      };
    },

    /** 列出所有空地格子（用于撒敌人 / 道具） */
    openCells: function (map) {
      var out = [];
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (map[r * COLS + c] === T.EMPTY) out.push([c, r]);
        }
      }
      return out;
    }
  };

  BI.scenery = {
    point: function (path, progress) {
      var i = ((progress % path.length) + path.length) % path.length;
      var k = Math.floor(i), t = i - k, a = path[k], b = path[(k + 1) % path.length];
      return { x: G.centerX(a[0]) + (b[0] - a[0]) * CFG.TILE * t,
        y: G.centerY(a[1]) + (b[1] - a[1]) * CFG.TILE * t };
    },
    nearest: function (path, x, y) {
      var best = null;
      for (var i = 0; i < path.length; i++) {
        var a = path[i], b = path[(i + 1) % path.length];
        var ax = G.centerX(a[0]), ay = G.centerY(a[1]);
        var dx = (b[0] - a[0]) * CFG.TILE, dy = (b[1] - a[1]) * CFG.TILE;
        var t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (CFG.TILE * CFG.TILE)));
        var px = ax + dx * t, py = ay + dy * t, distance = Math.hypot(x - px, y - py);
        if (!best || distance < best.distance - .001 ||
            (Math.abs(distance - best.distance) < .001 && t < .999 && best.t >= .999)) {
          best = { progress: i + t, distance: distance, x: px, y: py, dx: dx / CFG.TILE, dy: dy / CFG.TILE, t: t };
        }
      }
      return best;
    },
    update: function (world, dt) {
      var lm = world.map.landmark;
      if (!lm || lm.theme !== 'forest' || (world.match && world.match.over)) return;
      lm.fruitTimer -= dt;
      if (lm.fruitTimer > 0) return;
      lm.fruitTimer = 14;
      if (world.items.filter(function (it) { return it.type === 'fruit'; }).length >= 2) return;
      var cells = loop(5, 4, 9, 8).filter(function (cell) {
        return G.at(world.map, cell[0], cell[1]) === T.EMPTY &&
          !BI.rules.bombAt(world, cell[0], cell[1]) && !BI.rules.flameAt(world, cell[0], cell[1]) &&
          !world.items.some(function (it) { return it.c === cell[0] && it.r === cell[1]; }) &&
          !world.players.concat(world.enemies || []).some(function (actor) {
            return actor.alive && G.col(actor.x) === cell[0] && G.row(actor.y) === cell[1];
          });
      });
      if (!cells.length) return;
      var cell = world.rng.pick(cells);
      world.items.push({ c: cell[0], r: cell[1], type: 'fruit', born: world.time });
      lm.lastFruitAt = world.time;
      if (world.onScenery) world.onScenery('fruit', G.centerX(cell[0]), G.centerY(cell[1]));
    },
    bombForecast: function (world, b, seconds) {
      var lm=world.map.landmark;
      if(!lm||(lm.theme!=='factory'&&lm.theme!=='park')||b.slide)return [];
      var pos=G.bombPosition(b),at=BI.scenery.nearest(lm.path,pos.x,pos.y);
      if(!at||at.distance>CFG.TILE*.48||!lm.path.some(function(cell){return cell[0]===b.cx&&cell[1]===b.cy;}))return [];
      var cells=[],seen={},distance=(lm.theme==='factory'?1.65:1.8)*Math.max(0,seconds),steps=Math.min(lm.path.length*2,Math.ceil(distance*2));
      for(var i=1;i<=steps;i++){
        var next=BI.scenery.point(lm.path,at.progress+Math.min(i*.5,distance)),c=G.col(next.x),r=G.row(next.y),key=c+','+r;
        if(!seen[key]){seen[key]=true;cells.push([c,r]);}
      }
      return cells;
    },
    carryBomb: function (world, b, dt) {
      var lm = world.map.landmark;
      if (!lm || (lm.theme !== 'factory' && lm.theme !== 'park')) return false;
      var pos = G.bombPosition(b), at = BI.scenery.nearest(lm.path, pos.x, pos.y);
      if (!at || at.distance > CFG.TILE * .48 || !lm.path.some(function (cell) { return cell[0] === b.cx && cell[1] === b.cy; })) return false;
      var distance = (lm.theme === 'factory' ? 1.65 : 1.8) * CFG.TILE * dt, parts = Math.max(1, Math.ceil(distance / 2)), moved = false;
      for (var i = 0; i < parts; i++) {
        pos = G.bombPosition(b); at = BI.scenery.nearest(lm.path, pos.x, pos.y);
        var next = BI.scenery.point(lm.path, at.progress + distance / parts / CFG.TILE);
        var correction = Math.min(1, distance / parts / Math.max(1, at.distance));
        var x = next.x + (pos.x - at.x) * (1 - correction), y = next.y + (pos.y - at.y) * (1 - correction);
        if (!BI.rules.moveBomb(world, b, x, y)) break;
        moved = true;
      }
      return moved;
    },
    carry: function (world, p, dt, manual) {
      var lm = world.map.landmark;
      if (!lm || !lm.path.length || !p.alive) { p.carouselTravel = 0; return false; }
      var at = BI.scenery.nearest(lm.path, p.x, p.y);
      var cellC = G.col(p.x), cellR = G.row(p.y);
      var onTrack = lm.path.some(function (cell) { return cell[0] === cellC && cell[1] === cellR; });
      if (!onTrack || !at || at.distance > CFG.TILE * .48) { p.carouselTravel = 0; return false; }
      if (lm.theme === 'park' && manual) { p.carouselTravel = 0; return false; }
      var speed = lm.theme === 'factory' ? 1.65 : 1.8;
      var distance = speed * CFG.TILE * dt, steps = Math.max(1, Math.ceil(distance / 2)), moved = 0;
      for (var n = 0; n < steps; n++) {
        at = BI.scenery.nearest(lm.path, p.x, p.y);
        var next = BI.scenery.point(lm.path, at.progress + distance / steps / CFG.TILE);
        var offsetX = p.x - at.x, offsetY = p.y - at.y;
        var correction = manual ? 0 : Math.min(1, distance / steps / Math.max(1, at.distance));
        var tx = next.x + offsetX * (1 - correction), ty = next.y + offsetY * (1 - correction);
        var ox = p.x, oy = p.y;
        if (G.canStand(world.map, world.bombs, tx, ty, CFG.BOX, p.id)) { p.x = tx; p.y = ty; }
        else break; // 被炸弹封路时停下，不能穿过炸弹或中央设施。
        moved += Math.hypot(p.x - ox, p.y - oy);
      }
      if (lm.theme === 'park') {
        p.carouselTravel = (p.carouselTravel || 0) + moved / CFG.TILE;
        if (p.carouselTravel >= lm.path.length - .01 && !p.carouselRewarded) {
          p.carouselRewarded = true; p.shield = 1;
          if (world.onScenery) world.onScenery('carousel', p.x, p.y, p);
        }
      }
      return moved > .0001;
    }
  };

})(window.BI = window.BI || {});
