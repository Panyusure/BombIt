/* ============================================================
 * effects.js —— 粒子 / 屏幕震动 / 飘字
 *
 * 这一层是「果汁」：同样的规则，加不加这些效果，手感差一个档次。
 * 逻辑部分完全不碰 DOM，可以无头测试（粒子的生命周期、震动衰减）。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw;

  var fx = BI.fx = {
    particles: [],
    texts: [],
    shake: 0,          // 当前震屏强度（像素）
    shakeDecay: 42,    // 每秒衰减多少
    maxShake: 7,       // 上限压小一点：晃太狠会露出场地边缘，也容易晕
    ox: 0, oy: 0,      // 本帧的震屏偏移，渲染时加到场地上
    _rng: Math.random,

    reset: function () {
      this.particles.length = 0;
      this.texts.length = 0;
      this.shake = 0;
      this.ox = 0;
      this.oy = 0;
    },

    /** 让测试可以用确定性随机 */
    setRng: function (rng) { this._rng = rng || Math.random; },

    /* ============================================================
     * 粒子
     * ============================================================ */
    burst: function (x, y, opt) {
      opt = opt || {};
      var rng = this._rng;
      var n = opt.count == null ? 10 : opt.count;
      var colors = opt.colors || ['#ffd166'];
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + rng() * 0.6;
        var sp = (opt.speed == null ? 90 : opt.speed) * (0.45 + rng() * 0.9);
        var life = (opt.life == null ? 0.5 : opt.life) * (0.65 + rng() * 0.7);
        this.particles.push({
          x: x, y: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (opt.lift || 0),
          g: (opt.gravity == null ? 260 : opt.gravity),
          t: life, total: life,
          r: (opt.size == null ? 4 : opt.size) * (0.55 + rng() * 0.9),
          color: colors[(rng() * colors.length) | 0],
          shape: opt.shape || 'circle',
          rot: rng() * 6.283,
          spin: (rng() - 0.5) * 14
        });
      }
    },

    /** 飘字："+1"、连爆数之类 */
    text: function (x, y, str, color, opt) {
      opt = opt || {};
      var life = opt.life == null ? 0.95 : opt.life;
      this.texts.push({
        x: x, y: y, str: String(str),
        color: color || '#ffffff',
        t: life, total: life,
        vy: opt.vy == null ? -38 : opt.vy,
        size: opt.size || 16
      });
    },

    /** 震屏（取较大值，不叠加，避免连续爆炸把画面晃吐） */
    shakeIt: function (amount) {
      var v = Math.min(this.maxShake, amount);
      if (v > this.shake) this.shake = v;
    },

    /* ============================================================
     * 预设：游戏事件 -> 效果组合
     * ============================================================ */
    explosion: function (cx, cy, cells) {
      var x = cx * CFG.TILE + CFG.TILE / 2;
      var y = cy * CFG.TILE + CFG.TILE / 2;
      this.burst(x, y, {
        count: 14, speed: 165, size: 4.5, life: 0.42, gravity: 130, lift: 30,
        colors: ['#ffffff', '#ffd166', '#ff6b35', '#ff9e5c']
      });
      // 火焰末端也甩几个火星，让爆炸看起来很"宽"
      if (cells && cells.length > 1) {
        var step = Math.max(1, Math.floor(cells.length / 3));
        for (var i = step; i < cells.length; i += step) {
          this.burst(cells[i][0] * CFG.TILE + CFG.TILE / 2,
                     cells[i][1] * CFG.TILE + CFG.TILE / 2,
                     { count: 3, speed: 80, size: 3, life: 0.3, gravity: 90,
                       colors: ['#ffd166', '#ff6b35'] });
        }
      }
      this.shakeIt(9);
    },

    death: function (x, y) {
      this.burst(x, y, {
        count: 16, speed: 120, size: 4, life: 0.85, gravity: 220, lift: 120,
        colors: ['#ffd166', '#ffffff', '#8fd8ff'], shape: 'star'
      });
      this.shakeIt(7);
    },

    enemyDeath: function (x, y, color) {
      this.burst(x, y, {
        count: 12, speed: 130, size: 4, life: 0.6, gravity: 240, lift: 70,
        colors: [color || '#8fe3a1', '#ffffff']
      });
    },

    pickup: function (x, y, label) {
      this.burst(x, y, {
        count: 8, speed: 75, size: 3, life: 0.45, gravity: -30,
        colors: ['#ffffff', '#8fe3a1', '#ffd166']
      });
      if (label) this.text(x, y - 12, label, '#ffffff', { size: 15 });
    },

    shieldBreak: function (x, y) {
      this.burst(x, y, {
        count: 12, speed: 140, size: 3.5, life: 0.5, gravity: 160,
        colors: ['#8fd8ff', '#ffffff', '#63b8ff'], shape: 'rect'
      });
    },

    levelClear: function () {
      // 全屏彩带雨
      for (var i = 0; i < 70; i++) {
        this.particles.push({
          x: this._rng() * CFG.FIELD_W,
          y: -20 - this._rng() * 120,
          vx: (this._rng() - 0.5) * 40,
          vy: 90 + this._rng() * 120,
          g: 30,
          t: 2.2, total: 2.2,
          r: 4 + this._rng() * 4,
          color: ['#ffd166', '#5ec8f0', '#ff9eb5', '#8fe3a1', '#c78bff'][(this._rng() * 5) | 0],
          shape: 'rect',
          rot: this._rng() * 6.283,
          spin: (this._rng() - 0.5) * 10
        });
      }
      this.text(CFG.FIELD_W / 2, CFG.FIELD_H / 2 - 40, '过关！', '#ffd166', { size: 44, life: 1.4, vy: -14 });
    },

    /* ============================================================
     * 推进
     * ============================================================ */
    update: function (dt) {
      var ps = this.particles;
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.t -= dt;
        if (p.t <= 0) { ps.splice(i, 1); continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }

      var ts = this.texts;
      for (var j = ts.length - 1; j >= 0; j--) {
        var t = ts[j];
        t.t -= dt;
        if (t.t <= 0) { ts.splice(j, 1); continue; }
        t.y += t.vy * dt;
        t.vy *= 0.93;
      }

      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * this.shakeDecay);
        var amp = this.shake;
        this.ox = (this._rng() - 0.5) * amp * 2;
        this.oy = (this._rng() - 0.5) * amp * 2;
      } else {
        this.ox = 0; this.oy = 0;
      }
    },

    /* ============================================================
     * 渲染（粒子应该画在角色之上，飘字画在最上面）
     * ============================================================ */
    draw: function (ctx) {
      var ps = this.particles;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        var a = p.t / p.total;
        if (a <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 1.4);
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r * 0.55, p.r * 2, p.r * 1.1);
        } else if (p.shape === 'star') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          D.circle(ctx, 0, 0, p.r * (0.5 + a * 0.5));
          ctx.fill();
          ctx.globalAlpha *= 0.5;
          D.circle(ctx, 0, 0, p.r * (1.1 + a * 0.6));
          ctx.fill();
        } else {
          D.circle(ctx, p.x, p.y, p.r * (0.35 + a * 0.75));
          ctx.fill();
        }
        ctx.restore();
      }
    },

    drawTexts: function (ctx) {
      var ts = this.texts;
      for (var i = 0; i < ts.length; i++) {
        var t = ts[i];
        var a = t.t / t.total;
        // 后段才开始淡出，前段保持清晰
        var alpha = a > 0.45 ? 1 : a / 0.45;
        ctx.save();
        ctx.globalAlpha = alpha;
        D.text(ctx, t.str, t.x, t.y, {
          font: 'bold ' + t.size + 'px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle',
          fill: t.color, stroke: 'rgba(0,0,0,.5)', strokeWidth: 4
        });
        ctx.restore();
      }
    },

    /** 调试 / 测试用 */
    stats: function () {
      return { particles: this.particles.length, texts: this.texts.length, shake: +this.shake.toFixed(2) };
    }
  };

})(window.BI = window.BI || {});
