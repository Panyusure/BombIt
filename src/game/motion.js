/* ============================================================
 * motion.js —— 移动与手感（本文件不碰 DOM，可以无头测试）
 *
 * 手感三件事：
 *   1. 位移以像素为单位，不跳格 -> 丝滑
 *   2. 碰撞盒比格子小 12px（36 vs 48）-> 窄缝能蹭过去
 *   3. 转角辅助：偏差在 ASSIST 内自动对齐通道中线
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, G = BI.grid;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var motion = BI.motion = {

    clamp: clamp,

    /**
     * 沿一个轴尝试移动，返回是否真的动了。
     * dir: -1 / +1 ｜ dist: 本帧位移像素 ｜ axis: 'x' / 'y'
     */
    moveAxis: function (world, p, dir, dist, axis) {
      var dx = (axis === 'x') ? dir * dist : 0;
      var dy = (axis === 'y') ? dir * dist : 0;
      var map = world.map, bombs = world.bombs, box = CFG.BOX;

      // 直接走
      if (G.canStand(map, bombs, p.x + dx, p.y + dy, box, p.id)) {
        p.x += dx; p.y += dy;
        return true;
      }

      // 转角辅助：被挡住时，若与通道中线偏差在 ASSIST 内，先对齐再通过
      if (axis === 'x') {
        var offY = G.laneY(p.y) - p.y;
        if (offY !== 0 && Math.abs(offY) <= CFG.ASSIST) {
          var sy = clamp(offY, -dist, dist);
          if (G.canStand(map, bombs, p.x + dx, p.y + sy, box, p.id)) { p.x += dx; p.y += sy; return true; }
          if (G.canStand(map, bombs, p.x, p.y + sy, box, p.id)) { p.y += sy; return true; }
        }
      } else {
        var offX = G.laneX(p.x) - p.x;
        if (offX !== 0 && Math.abs(offX) <= CFG.ASSIST) {
          var sx = clamp(offX, -dist, dist);
          if (G.canStand(map, bombs, p.x + sx, p.y + dy, box, p.id)) { p.x += sx; p.y += dy; return true; }
          if (G.canStand(map, bombs, p.x + sx, p.y, box, p.id)) { p.x += sx; return true; }
        }
      }
      return false;
    },

    /**
     * 按输入方向推进一个玩家。
     * hx / hy 为 -1 / 0 / 1。
     *
     * **一次只走一个轴** —— 泡泡堂不该有斜着走。
     * 两个方向同时按住时，走「后按下的那个轴」（p.axisPref），
     * 松开其中一个就立刻回到另一个轴，手感是"拐弯"而不是"斜插"。
     *
     * 注意 moveAxis 里的转角辅助仍然会在垂直轴上微调几像素把角色对齐通道 ——
     * 那是一次性的对齐吸附（最多 ASSIST 像素），不是持续斜走，是手感的一部分。
     */
    step: function (world, p, hx, hy, dt) {
      var skillSpeed = (p.insightTime > 0 ? 1.30 : 1) * Math.min(p.slowTime > 0 ? .5 : 1, BI.skills.slowFactor(p));
      var spd = CFG.SPEED_BASE * (1 + p.speedBonus) * skillSpeed * CFG.TILE;
      var dist = spd * dt;

      var useX = (hx !== 0);
      var useY = (hy !== 0);
      if (useX && useY) {
        // 谁后按谁说了算
        if (p.axisPref === 'y') useX = false;
        else useY = false;
      }

      // 朝向跟随选中的输入轴；停下或随场景运送时保持，不受转角吸附干扰。
      if (useX) { p.facing = hx; p.facingDir = hx < 0 ? 'left' : 'right'; }
      else if (useY) p.facingDir = hy < 0 ? 'up' : 'down';

      var moved = false;
      if (useX) moved = motion.moveAxis(world, p, hx, dist, 'x');
      else if (useY) moved = motion.moveAxis(world, p, hy, dist, 'y');

      if (BI.scenery && BI.scenery.carry(world, p, dt, useX || useY)) moved = true;
      return moved;
    },

    /** 踢弹：撞到炸弹就把它推出去（吃到踢弹道具后才生效） */
    kickCheck: function (world, p, hx, hy) {
      if (hx === 0 && hy === 0) return false;
      if (hx && hy) { if (p.axisPref === 'y') hx = 0; else hy = 0; }
      for (var i = 0; i < world.bombs.length; i++) {
        var b = world.bombs[i];
        var pos = G.bombPosition(b);
        var close = Math.hypot(p.x - pos.x, p.y - pos.y) <= CFG.BOMB_RADIUS + CFG.PLAYER_BOMB_RADIUS + 5;
        var ahead = (pos.x-p.x)*hx+(pos.y-p.y)*hy > 0;
        var side = Math.abs((pos.y-p.y)*hx-(pos.x-p.x)*hy) < 21;
        if (ahead && side && close && !b.slide && b.freeFor === null) {
          b.slide = { dc: hx, dr: hy, t: 0, speed: CFG.KICK_SPEED };
          return true;
        }
      }
      return false;
    }
  };

})(window.BI = window.BI || {});
