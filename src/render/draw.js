/* ============================================================
 * draw.js —— 基础绘制工具（圆角、圆、阴影等）
 * ============================================================ */
(function (BI) {
  'use strict';

  var TAU = Math.PI * 2;

  var draw = BI.draw = {
    TAU: TAU,

    /** 圆角矩形路径（优先用原生 roundRect，不支持的浏览器手写兜底） */
    roundRect: function (ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
        return;
      }
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    },

    circle: function (ctx, x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
    },

    ellipse: function (ctx, x, y, rx, ry) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    },

    /** 带描边的圆角矩形（Q 版所有形状都走这个，保证圆润统一） */
    blob: function (ctx, x, y, w, h, r, fill, stroke, lw) {
      draw.roundRect(ctx, x, y, w, h, r);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) {
        ctx.lineWidth = lw || 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    },

    /** 地面椭圆阴影 */
    groundShadow: function (ctx, x, y, rx, ry, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#141a2d';
      draw.ellipse(ctx, x, y, rx, ry);
      ctx.fill();
      ctx.restore();
    },

    /** 带描边的文字（Q 版标题常用） */
    text: function (ctx, str, x, y, opt) {
      opt = opt || {};
      ctx.save();
      ctx.font = opt.font || '16px "Microsoft YaHei", sans-serif';
      ctx.textAlign = opt.align || 'left';
      ctx.textBaseline = opt.baseline || 'middle';
      if (opt.stroke) {
        ctx.lineWidth = opt.strokeWidth || 4;
        ctx.strokeStyle = opt.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(str, x, y);
      }
      ctx.fillStyle = opt.fill || '#fff';
      ctx.fillText(str, x, y);
      ctx.restore();
    },

    lerp: function (a, b, t) { return a + (b - a) * t; },
    clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  };

  /* ============================================================
   * BOMBIT MOTION UI KIT
   *
   * 游戏 UI 不再用玻璃拟态胶囊，改用 Motion ID 的印刷海报语言：
   * 奶油纸、墨色硬边、糖果色色块、错位硬阴影、半调网点、编号与迷你标签。
   * 所有 UI 共用这一层，保证菜单、HUD、暂停、结算说同一种话。
   * ============================================================ */
  var U = draw.ui = {
    C: {
      ink: '#141019',
      ink2: '#211A2B',
      cream: '#F5EBD8',
      paper: '#F1E4CF',
      white: '#FFFDF6',
      orange: '#FF5533',
      pink: '#FF5E9E',
      hot: '#F5233C',
      cyan: '#5CE1F2',
      sky: '#66C8FF',
      yellow: '#FFD23F',
      lemon: '#FFE979',
      green: '#62DF88',
      red: '#F5233C',
      navy: '#17122E',
      muted: '#9A8C7A'
    },
    F: {
      cn: '"HarmonyOS Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif',
      heavy: '"HarmonyOS Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif',
      impact: 'Impact, "Arial Black", "Microsoft YaHei", sans-serif',
      mono: 'Consolas, "Courier New", monospace'
    },

    font: function (size, weight, family) {
      return (weight || 700) + ' ' + size + 'px ' + (family || U.F.cn);
    },

    measure: function (ctx, str, size, weight, family) {
      ctx.save();
      ctx.font = U.font(size, weight, family);
      var w = ctx.measureText(str).width;
      ctx.restore();
      return w;
    },

    /** 带硬阴影 / 描边的文字；仍然走 D.text，便于测试捕获所有 UI 文案 */
    text: function (ctx, str, x, y, o) {
      o = o || {};
      var family = o.family || U.F.cn;
      var font = U.font(o.size || 12, o.weight || 700, family);
      var baseline = o.baseline || 'middle';
      var align = o.align || 'left';
      ctx.save();
      if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      if (o.shadow) {
        draw.text(ctx, str, x + (o.shadowX == null ? 2 : o.shadowX), y + (o.shadowY == null ? 2 : o.shadowY), {
          font: font, align: align, baseline: baseline, fill: o.shadow
        });
      }
      draw.text(ctx, str, x, y, {
        font: font, align: align, baseline: baseline,
        fill: o.fill || U.C.ink,
        stroke: o.stroke || null,
        strokeWidth: o.strokeWidth || 0
      });
      ctx.restore();
    },

    /** 直角感更强的贴纸面板：错位硬阴影 + 墨线 */
    panel: function (ctx, x, y, w, h, o) {
      o = o || {};
      var r = o.r == null ? 6 : o.r;
      ctx.save();
      if (o.shadow) {
        draw.roundRect(ctx, x + (o.shadowX == null ? 4 : o.shadowX), y + (o.shadowY == null ? 4 : o.shadowY), w, h, r);
        ctx.fillStyle = o.shadow;
        ctx.fill();
      }
      draw.roundRect(ctx, x, y, w, h, r);
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) {
        ctx.lineWidth = o.lw || 2;
        ctx.strokeStyle = o.stroke;
        ctx.stroke();
      }
      if (o.inner) {
        draw.roundRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(0, r - 2));
        ctx.lineWidth = 1;
        ctx.strokeStyle = o.inner;
        ctx.stroke();
      }
      ctx.restore();
    },

    /** 小贴纸：自动测量宽度并返回矩形 */
    tag: function (ctx, text, x, y, o) {
      o = o || {};
      var size = o.size || 9;
      var weight = o.weight || 700;
      var family = o.family || U.F.mono;
      var padX = o.padX == null ? 7 : o.padX;
      var h = o.h || size + 8;
      var w = o.w || (U.measure(ctx, text, size, weight, family) + padX * 2);
      var align = o.align || 'center';
      var left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      ctx.save();
      ctx.translate(left + w / 2, y);
      if (o.rot) ctx.rotate(o.rot);
      U.panel(ctx, -w / 2, -h / 2, w, h, {
        r: o.r == null ? 3 : o.r,
        fill: o.fill || U.C.yellow,
        stroke: o.stroke === undefined ? U.C.ink : o.stroke,
        lw: o.lw || 1.5,
        shadow: o.shadow || null,
        shadowX: o.shadowX, shadowY: o.shadowY
      });
      U.text(ctx, text, 0, 0.5, {
        size: size, weight: weight, family: family,
        fill: o.fg || U.C.ink, align: 'center', baseline: 'middle'
      });
      ctx.restore();
      return { x: left, y: y - h / 2, w: w, h: h };
    },

    /** 斜纹 / 警告条 */
    stripes: function (ctx, x, y, w, h, c1, c2, gap, angle) {
      var a = angle == null ? -.6 : angle;
      var g = gap || 10;
      ctx.save();
      draw.roundRect(ctx, x, y, w, h, 0);
      ctx.clip();
      ctx.fillStyle = c1 || U.C.ink;
      ctx.fillRect(x, y, w, h);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(a);
      ctx.fillStyle = c2 || U.C.yellow;
      var span = (w + h) * 1.4;
      for (var i = -span; i < span; i += g * 2) ctx.fillRect(i, -span, g, span * 2);
      ctx.restore();
    },

    /** 低密度半调网点。用 pattern 缓存，不做每帧几百次 arc */
    dotPattern: function (ctx, color, step, radius) {
      var UU = draw.ui;
      var key = color + '|' + step + '|' + radius;
      UU._patterns = UU._patterns || {};
      if (UU._patterns[key]) return UU._patterns[key];
      if (typeof document === 'undefined') return null;
      var cv = document.createElement('canvas');
      cv.width = cv.height = step;
      var g = cv.getContext('2d');
      g.fillStyle = color;
      g.beginPath();
      g.arc(step / 2, step / 2, radius, 0, Math.PI * 2);
      g.fill();
      var pat = ctx.createPattern(cv, 'repeat');
      UU._patterns[key] = pat;
      return pat;
    },

    dots: function (ctx, x, y, w, h, color, alpha, step) {
      var s = step || 16;
      var pat = U.dotPattern(ctx, color || U.C.ink, s, 1);
      ctx.save();
      ctx.globalAlpha *= alpha == null ? .12 : alpha;
      ctx.fillStyle = pat || color || U.C.ink;
      if (!pat) {
        for (var yy = y; yy < y + h; yy += s) for (var xx = x; xx < x + w; xx += s) ctx.fillRect(xx, yy, 1.4, 1.4);
      } else {
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    },

    sun: function (ctx, cx, cy, r, color, rot) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot || 0);
      ctx.fillStyle = color || U.C.orange;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = .18;
      ctx.strokeStyle = U.C.cream;
      ctx.lineWidth = 2;
      for (var i = 0; i < 24; i++) {
        var a = i * Math.PI * 2 / 24;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = 2;
      ctx.strokeStyle = U.C.ink;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },

    /** 笑脸炸弹：菜单主视觉和加载页共用的图形母题 */
    bomb: function (ctx, cx, cy, r, o) {
      o = o || {};
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(o.rot || -.08);
      ctx.lineCap = 'round';
      ctx.strokeStyle = U.C.ink;
      ctx.lineWidth = Math.max(2, r * .12);
      ctx.beginPath();
      ctx.moveTo(r * .25, -r * .88);
      ctx.bezierCurveTo(r * .7, -r * 1.3, r * 1.35, -r * 1.05, r * 1.12, -r * 1.5);
      ctx.stroke();
      ctx.strokeStyle = U.C.orange;
      ctx.lineWidth = Math.max(1.2, r * .06);
      ctx.beginPath();
      ctx.moveTo(r * .25, -r * .88);
      ctx.bezierCurveTo(r * .7, -r * 1.3, r * 1.35, -r * 1.05, r * 1.12, -r * 1.5);
      ctx.stroke();
      var sx = r * 1.12, sy = -r * 1.5;
      ctx.fillStyle = U.C.yellow;
      draw.circle(ctx, sx, sy, r * .28 * (o.spark === false ? .55 : 1));
      ctx.fill();
      ctx.fillStyle = U.C.cream;
      draw.circle(ctx, sx, sy, r * .1);
      ctx.fill();
      ctx.fillStyle = U.C.ink;
      draw.circle(ctx, 0, 0, r);
      ctx.fill();
      ctx.strokeStyle = U.C.ink;
      ctx.lineWidth = 2;
      ctx.fillStyle = U.C.white;
      draw.circle(ctx, -r * .24, -r * .06, r * .13);
      ctx.fill();
      draw.circle(ctx, r * .22, -r * .06, r * .13);
      ctx.fill();
      ctx.fillStyle = U.C.ink;
      draw.circle(ctx, -r * .21, -r * .04, r * .055);
      ctx.fill();
      draw.circle(ctx, r * .23, -r * .04, r * .055);
      ctx.fill();
      ctx.strokeStyle = U.C.white;
      ctx.lineWidth = Math.max(1.5, r * .04);
      ctx.beginPath();
      ctx.arc(0, r * .1, r * .16, .35, Math.PI - .35);
      ctx.stroke();
      ctx.restore();
    },

    star: function (ctx, cx, cy, r1, r2, color, points, rot) {
      var n = points || 5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot || -Math.PI / 2);
      ctx.beginPath();
      for (var i = 0; i < n * 2; i++) {
        var a = i * Math.PI / n;
        var rr = i % 2 ? r2 : r1;
        var x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = color || U.C.yellow;
      ctx.fill();
      ctx.strokeStyle = U.C.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    },

    heart: function (ctx, x, y, size, fill, stroke) {
      var s = size / 16;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-2, 3, -8, 0, -8, -4);
      ctx.bezierCurveTo(-8, -9, -2, -10, 0, -5);
      ctx.bezierCurveTo(2, -10, 8, -9, 8, -4);
      ctx.bezierCurveTo(8, 0, 2, 3, 0, 6);
      ctx.closePath();
      ctx.fillStyle = fill || U.C.pink;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke || U.C.ink;
      ctx.stroke();
      ctx.restore();
    },

    keycap: function (ctx, text, x, y, w, h, bg, fg) {
      U.panel(ctx, x, y, w, h, {
        fill: bg || U.C.ink, stroke: bg === U.C.cream ? U.C.ink : null,
        lw: 1.5, r: 3, shadow: bg === U.C.cream ? null : 'rgba(0,0,0,.28)', shadowY: 2
      });
      U.text(ctx, text, x + w / 2, y + h / 2 + .5, {
        size: Math.min(9, h * .42), weight: 700, family: U.F.mono,
        fill: fg || U.C.cream, align: 'center'
      });
    },

    play: function (ctx, x, y, size, color) {
      ctx.save();
      ctx.fillStyle = color || U.C.ink;
      ctx.beginPath();
      ctx.moveTo(x - size * .35, y - size * .5);
      ctx.lineTo(x + size * .55, y);
      ctx.lineTo(x - size * .35, y + size * .5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    /** 把裁好的角色 sprite 的头部区域装进矩形，菜单小人更抓眼 */
    head: function (ctx, asset, x, y, w, h, fallbackColor) {
      if (asset && asset.sprite) {
        var img = asset.sprite;
        var iw = img.width, ih = img.height;
        var cropH = ih * .68;
        var s = Math.min(w / iw, h / cropH);
        var dw = iw * s, dh = cropH * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(img, 0, 0, iw, cropH, x + (w - dw) / 2, y + h - dh + 2, dw, dh);
        ctx.restore();
        return;
      }
      if (BI.sprites && BI.sprites.drawAssetFit) {
        BI.sprites.drawAssetFit(ctx, asset, x, y, w, h, fallbackColor);
      } else {
        ctx.save();
        ctx.fillStyle = fallbackColor || U.C.cyan;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * .28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  };
  BI.ui = U;

})(window.BI = window.BI || {});
