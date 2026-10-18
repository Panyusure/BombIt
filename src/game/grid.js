/* ============================================================
 * grid.js —— 地图数据、坐标换算、碰撞判定
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, T = BI.T;
  var TILE = CFG.TILE, COLS = CFG.COLS, ROWS = CFG.ROWS;

  var grid = BI.grid = {

    cols: function (map) { return map && map.cols || COLS; },
    rows: function (map) { return map && map.rows || ROWS; },
    idx: function (c, r, map) { return r * grid.cols(map) + c; },
    inBounds: function (c, r, map) { return c >= 0 && r >= 0 && c < grid.cols(map) && r < grid.rows(map); },

    at: function (map, c, r) {
      if (!grid.inBounds(c, r, map)) return T.HARD;   // 越界当硬墙处理，避免到处判边界
      return map[r * grid.cols(map) + c];
    },
    set: function (map, c, r, v) {
      if (grid.inBounds(c, r, map) && map[r * grid.cols(map) + c] !== v) {
        map[r * grid.cols(map) + c] = v;
        map.revision = (map.revision || 0) + 1;
      }
    },

    /** 地图本身是否阻挡（硬墙 / 软砖） */
    isWall: function (map, c, r) {
      var v = grid.at(map, c, r);
      return v === T.HARD || v === T.BRICK;
    },

    canBreakHard: function (map, c, r) {
      if (c <= 0 || r <= 0 || c >= grid.cols(map)-1 || r >= grid.rows(map)-1 || grid.at(map,c,r) !== T.HARD) return false;
      var lm = map.landmark;
      return !lm || Math.abs(c-lm.c)>1 || Math.abs(r-lm.r)>1;
    },

    /* ---------- 像素 <-> 格子 ---------- */

    /** 像素坐标 -> 格子列号 */
    col: function (x) { return Math.floor(x / TILE); },
    /** 像素坐标 -> 格子行号 */
    row: function (y) { return Math.floor(y / TILE); },
    /** 格子中心（像素） */
    centerX: function (c) { return c * TILE + TILE / 2; },
    centerY: function (r) { return r * TILE + TILE / 2; },
    /** 某个像素坐标所在格子的中线（用于转角辅助） */
    laneX: function (x) { return grid.centerX(grid.col(x)); },
    laneY: function (y) { return grid.centerY(grid.row(y)); },

    /* ---------- 碰撞 ---------- */

    /**
     * 以 (x,y) 为中心、边长 box 的方块能否站得住。
     * bombs 里 solid 状态的炸弹算障碍；freeFor === playerId 的炸弹可穿过。
     */
    canStand: function (map, bombs, x, y, box, playerId) {
      var h = box / 2;
      // 减一个极小量：避免正好压在格子边界上时多算一格
      var x0 = x - h, x1 = x + h - 1e-6;
      var y0 = y - h, y1 = y + h - 1e-6;
      var c0 = Math.floor(x0 / TILE), c1 = Math.floor(x1 / TILE);
      var r0 = Math.floor(y0 / TILE), r1 = Math.floor(y1 / TILE);

      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          if (grid.isWall(map, c, r)) return false;
        }
      }
      if (bombs) {
        var radius = box === CFG.BOX ? CFG.PLAYER_BOMB_RADIUS : box / 2;
        for (var i = 0; i < bombs.length; i++) {
          var b = bombs[i];
          if (grid.bombAllows(b, playerId)) continue;
          var pos = grid.bombPosition(b);
          if (Math.hypot(x - pos.x, y - pos.y) < radius + CFG.BOMB_RADIUS - 1e-6) return false;
        }
      }
      return true;
    },

    // A monster may leave a bomb it is already overlapping, but cannot move
    // toward it or enter it from outside.
    //
    // 「已经重叠」不限于它自己放的炸弹：玩家可以在怪物身上直接放弹
    // （tryPlaceBomb 只检查炸弹，不检查角色），传送带也可能把炸弹送到它脚下。
    // 只认 ownerId 的话，怪物会被这颗弹永久钉死在原地 —— 任何方向的新位置
    // 都还在 32 像素碰撞圈里，连随带移动都被判成「撞弹」。
    // 判定与 moveBomb 的「已重叠可以向外离开」保持一致，两边对称。
    canMoveEnemy: function (world, e, x, y) {
      var radius = CFG.ENEMY_BOX / 2 + CFG.BOMB_RADIUS;
      var blockers = world.bombs.filter(function (b) {
        var pos = grid.bombPosition(b);
        var before = Math.hypot(e.x - pos.x, e.y - pos.y);
        var after = Math.hypot(x - pos.x, y - pos.y);
        return !(before < radius && after > before + 1e-9);
      });
      return grid.canStand(world.map, blockers, x, y, CFG.ENEMY_BOX, e.id);
    },

    bombPosition: function (b) {
      return { x: Number.isFinite(b.x) ? b.x : grid.centerX(b.cx),
        y: Number.isFinite(b.y) ? b.y : grid.centerY(b.cy) };
    },
    bombAllows: function (b, id) {
      return id != null && ((b.freeFor != null && b.freeFor === id) ||
        (b.passFor && b.passFor.indexOf(id) >= 0));
    },
    bombOverlapsPlayer: function (b, p) {
      var pos = grid.bombPosition(b);
      return Math.hypot(p.x - pos.x, p.y - pos.y) < CFG.PLAYER_BOMB_RADIUS + CFG.BOMB_RADIUS;
    },

    /** 该格子上的炸弹是否阻挡 playerId */
    bombBlocks: function (bombs, c, r, playerId) {
      for (var i = 0; i < bombs.length; i++) {
        var b = bombs[i];
        if (grid.bombAllows(b, playerId)) continue;
        var pos = grid.bombPosition(b);
        if (Math.hypot(grid.centerX(c) - pos.x, grid.centerY(r) - pos.y) >= CFG.BOMB_RADIUS + CFG.ENEMY_BOX / 2) continue;
        return true;
      }
      return false;
    },

    /** 方块是否与某个格子有任何重叠（用于判断玩家是否还站在自己的炸弹上） */
    overlapsTile: function (x, y, box, c, r) {
      var h = box / 2;
      return (x + h > c * TILE) && (x - h < (c + 1) * TILE) &&
             (y + h > r * TILE) && (y - h < (r + 1) * TILE);
    }
  };

})(window.BI = window.BI || {});
