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

})(window.BI = window.BI || {});
