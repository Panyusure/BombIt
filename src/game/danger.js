/* ============================================================
 * danger.js —— 威胁图
 *
 * 一张与地图同尺寸的表，记录每一格「还有多少秒会变危险」：
 *     0   安全
 *    >0   这么多秒后会挨炸（数值就是炸弹引信剩余时间）
 *    -1   正在燃烧，立刻致命
 *
 * 这是让敌人显得聪明的关键：它们会主动绕开炸弹的杀伤范围，
 * 于是玩家一放炸弹，旁边的敌人就开始逃 —— 成就感立刻就有了。
 *
 * 每次炸弹增删 / 爆炸后重算一次。15x13 的格子 × 最多 8 颗炸弹
 * 也就是一千多次运算，每帧重算都毫无压力。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, T = BI.T, G = BI.grid;
  var COLS = CFG.COLS, ROWS = CFG.ROWS;

  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  var danger = BI.danger = {

    alloc: function (map) {
      var d = new Float32Array(G.cols(map) * G.rows(map));
      d.cols = G.cols(map); d.rows = G.rows(map); return d;
    },

    // 同一份几何同时用于真实爆炸、连锁预测和 AI 的按时间逃生。
    timeline: function (world, extraBomb) {
      var COLS = G.cols(world.map), ROWS = G.rows(world.map);
      var bombs = extraBomb ? world.bombs.concat([extraBomb]) : world.bombs.slice();
      var view = Object.create(world); view.bombs = bombs;
      var geometry = bombs.map(function (b) {
        var result=BI.rules.bombCells(view,b),seen={};
        result.cells.forEach(function(cell){seen[cell[0]+','+cell[1]]=true;});
        // 传送带会让炸弹沿途移动，也可能被挡停。AI 按所有可能停点保守规划退路。
        var forecast=b.slide ? BI.rules.slideForecast(world,b) : (BI.scenery ? BI.scenery.bombForecast(world,b,b.fuse) : []);
        forecast.forEach(function(cell){
          var projected=Object.assign({},b,{cx:cell[0],cy:cell[1]});
          var futureView=Object.create(world);futureView.bombs=bombs.filter(function(other){return other!==b;});
          var geo=BI.rules.bombCells(futureView,projected);
          geo.cells.forEach(function(point){var key=point[0]+','+point[1];if(!seen[key]){seen[key]=true;result.cells.push(point);}});
          geo.chain.forEach(function(other){if(result.chain.indexOf(other)<0)result.chain.push(other);});
        });
        return result;
      });
      // 推动不改变引信；沿途停点与运送位置统一按剩余引信预测。
      var times = bombs.map(function (b) { return Math.max(.001, b.fuse); });
      var windows = Array.from({ length: COLS * ROWS }, function () { return []; });
      world.flames.forEach(function (f) {
        f.cells.forEach(function (cell) {
          windows[cell[1] * COLS + cell[0]].push([0, f.t || CFG.FLAME_TIME]);
          bombs.forEach(function (b, i) { if (b.cx === cell[0] && b.cy === cell[1]) times[i] = .001; });
        });
      });
      // 引信短的炸弹会提前引爆长引信炸弹；迭代传播直到整条连锁稳定。
      for (var pass = 0; pass < bombs.length; pass++) {
        var changed = false;
        geometry.forEach(function (geo, i) {
          geo.chain.forEach(function (b) {
            var j = bombs.indexOf(b);
            if (times[j] > times[i]) { times[j] = times[i]; changed = true; }
          });
        });
        if (!changed) break;
      }
      geometry.forEach(function (geo, i) {
        geo.cells.forEach(function (cell) { windows[cell[1] * COLS + cell[0]].push([times[i], times[i] + CFG.FLAME_TIME]); });
      });
      return { windows: windows, bombs: bombs, times: times, cols: COLS };
    },

    compute: function (world) {
      var size = G.cols(world.map) * G.rows(world.map);
      var d = world.danger;
      if (!d || d.length !== size) d = world.danger = danger.alloc(world.map);
      d.fill(0);
      var timeline = danger.timeline(world);
      timeline.windows.forEach(function (windows, i) {
        windows.forEach(function (w) {
          if (w[0] === 0) d[i] = -1;
          else if (d[i] !== -1 && (d[i] === 0 || w[0] < d[i])) d[i] = w[0];
        });
      });
      return d;
    },

    /** 取「更危险」的那个写进去 */
    mark: function (d, c, r, t) {
      var cols = d.cols || COLS, rows = d.rows || ROWS;
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      var i = r * cols + c;
      if (d[i] === -1) return;                   // 已经在烧了，不用再标
      if (t < 0) { d[i] = -1; return; }
      if (d[i] === 0 || t < d[i]) d[i] = t;
    },

    at: function (world, c, r) {
      if (!world.danger || !G.inBounds(c, r, world.map)) return 0;
      return world.danger[r * G.cols(world.map) + c];
    },

    /**
     * 这一格对这个敌人来说危不危险。
     * margin 是安全余量（秒）：只要「还有不到 margin 秒就炸」就不去。
     */
    isHot: function (world, c, r, margin) {
      var v = danger.at(world, c, r);
      if (v === 0) return false;
      if (v < 0) return true;
      return v <= (margin == null ? CFG.DANGER_MARGIN : margin);
    },

    /** 调试用：把威胁图打成字符画 */
    dump: function (world) {
      var COLS = G.cols(world.map), ROWS = G.rows(world.map);
      var out = [];
      for (var r = 0; r < ROWS; r++) {
        var line = '';
        for (var c = 0; c < COLS; c++) {
          var v = danger.at(world, c, r);
          if (G.at(world.map, c, r) === T.HARD) line += '#';
          else if (G.at(world.map, c, r) === T.BRICK) line += 'B';
          else if (v < 0) line += '*';
          else if (v === 0) line += '.';
          else line += String(Math.min(9, Math.ceil(v)));
        }
        out.push(line);
      }
      return out.join('\n');
    }
  };

})(window.BI = window.BI || {});
