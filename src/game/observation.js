/* Public game observations. Internal AI plans and random state stay private. */
(function (BI) {
  'use strict';
  var G = BI.grid, CFG = BI.config;
  function round(n) { return Math.round(n * 1000000) / 1000000; }
  function pick(value, keys) {
    var out = {};
    keys.forEach(function (k) { if (value[k] !== undefined) out[k] = typeof value[k] === 'number' ? round(value[k]) : value[k]; });
    return out;
  }
  var common = ['id', 'alive', 'x', 'y', 'facingDir', 'facing', 'power', 'maxBombs', 'speedBonus',
    'shield', 'starTime', 'invuln', 'kick', 'glove', 'soulSlowTime', 'soulSlowRate'];
  function actor(p) {
    var out = pick(p, common);
    out.col = G.col(p.x); out.row = G.row(p.y);
    return out;
  }
  BI.observe = function (w, assist) {
    var cols = G.cols(w.map), rows = G.rows(w.map), terrain = [];
    for (var r = 0; r < rows; r++) {
      var line = '';
      for (var c = 0; c < cols; c++) {
        var t = G.at(w.map, c, r);
        line += t === BI.T.HARD ? '#' : t === BI.T.BRICK ? '+' : '.';
      }
      terrain.push(line);
    }
    var out = {
      protocol: 'bombit/1', mode: w.mode, seed: w.seedRoot, frame: w.frame,
      time: round(w.time), phase: w.match.over ? 'finished' : w.briefing ? 'briefing' :
        w.match.roundEndsAt > 0 ? 'round_end' : w.match.levelClearAt > 0 ? 'level_clear' : 'playing',
      map: { cols: cols, rows: rows, tileSize: CFG.TILE, theme: w.theme, terrain: terrain,
        landmark: w.map.landmark ? JSON.parse(JSON.stringify(w.map.landmark)) : null, bossBattle: !!w.map.bossBattle },
      match: pick(w.match, ['level', 'round', 'remaining', 'elapsed', 'scores', 'targetScore', 'over', 'winner',
        'title', 'subtitle', 'sudden', 'roundEndsAt', 'levelClearAt']),
      players: w.players.map(function (p) {
        var a = Object.assign(actor(p), pick(p, ['assetId', 'lives', 'skillCd', 'flameGuard', 'insightTime',
          'slowTime', 'soulEvolved', 'soulBombs', 'carouselTravel', 'carouselRewarded']));
        a.character = p.assetId;
        a.bombsOut = w.bombs.filter(function (b) { return b.ownerId === p.id; }).length;
        a.speedTilesPerSecond = round(CFG.SPEED_BASE * (1 + p.speedBonus) *
          (p.insightTime > 0 ? 1.3 : 1) * Math.min(p.slowTime > 0 ? .5 : 1, BI.skills.slowFactor(p)));
        a.skill = Object.assign({}, BI.skills.info(p));
        a.skillReady = p.alive && !a.skill.passive && p.skillCd <= 0 && !w.briefing && !w.match.over;
        a.respawnIn = !p.alive && BI.match.canRespawn(w, p) ? round(Math.max(0, CFG.RESPAWN_DELAY - (w.time - p.deadAt))) : null;
        return a;
      }),
      enemies: w.enemies.map(function (e) {
        return Object.assign(actor(e), pick(e, ['type', 'name', 'hp', 'maxHp', 'phase', 'windup', 'stun']),
          { speedTilesPerSecond: round(BI.ai.moveSpeed(e) * (1 + e.speedBonus)) });
      }),
      bombs: w.bombs.map(function (b) {
        var pos = G.bombPosition(b);
        return Object.assign(pick(b, ['ownerId', 'power', 'fuse', 'fuseTotal', 'slide', 'freeFor', 'passFor', 'byEnemy', 'breakHard']),
          { col: b.cx, row: b.cy, x: round(pos.x), y: round(pos.y) });
      }),
      flames: w.flames.map(function (f) { return { cells: f.cells.map(function (cell) { return cell.slice(); }), remaining: round(f.t) }; }),
      poison: (w.poison || []).map(function (p) { return pick(p, ['c', 'r', 'warn', 'life']); }),
      items: w.items.map(function (it) { return { col: it.c, row: it.r, type: it.type }; }),
      timeStop: w.timeStop ? Object.assign({}, w.timeStop) : null,
      briefing: w.briefing ? JSON.parse(JSON.stringify(w.briefing)) : null,
      bricksLeft: BI.match.countBricks(w.map), enemiesLeft: BI.match.countEnemies(w), stats: Object.assign({}, w.stats)
    };
    if (assist) {
      var tl = BI.danger.timeline(w);
      out.assist = { assumption: 'Conservative forecast using current bombs; future placements and terrain changes can alter it.',
        dangerWindows: tl.windows.map(function (windows, i) {
          return { col: i % cols, row: Math.floor(i / cols), windows: windows.map(function (win) { return win.map(round); }) };
        }).filter(function (entry) { return entry.windows.length; }) };
    }
    return out;
  };
})(window.BI = window.BI || {});
