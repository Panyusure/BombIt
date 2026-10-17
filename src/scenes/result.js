/* ============================================================
 * result.js —— 结算界面
 *
 * 胜负横幅 + 本局数据 + 「再来一局 / 返回菜单」。
 * 键盘和鼠标都能用。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw, C = CFG.C;

  var CARD = { w: 520, h: 384 };
  var BTN = { w: 200, h: 52, gap: 24 };

  function cardRect() {
    return {
      x: (CFG.VIEW_W - CARD.w) / 2,
      y: (CFG.VIEW_H - CARD.h) / 2,
      w: CARD.w, h: CARD.h
    };
  }

  function btnRect(i) {
    var c = cardRect();
    var total = BTN.w * 2 + BTN.gap;
    var x0 = c.x + (c.w - total) / 2;
    return { x: x0 + i * (BTN.w + BTN.gap), y: c.y + c.h - BTN.h - 22, w: BTN.w, h: BTN.h };
  }

  var result = BI.result = {

    create: function (summary) {
      var st = {
        t: 0,
        appear: 0,                 // 0 -> 1 的入场动画
        summary: summary,
        confetti: result.makeConfetti(summary),
        hover: -1
      };
      return st;
    },

    makeConfetti: function (summary) {
      var win = summary.winner === 'p1' || summary.winner === 'p2';
      if (!win) return [];
      var out = [];
      for (var i = 0; i < 60; i++) {
        out.push({
          x: (i * 137.5) % CFG.VIEW_W,
          y: -((i * 53) % 400) - 20,
          vy: 60 + (i % 7) * 22,
          sway: (i % 5) * 0.6,
          rot: (i % 11) * 0.4,
          w: 6 + (i % 4) * 3,
          h: 10 + (i % 3) * 4,
          color: ['#ffd166', '#5ec8f0', '#ff9eb5', '#8fe3a1', '#c78bff'][i % 5]
        });
      }
      return out;
    },

    /* ============================================================
     * 每帧
     * ============================================================ */
    update: function (st, dt) {
      st.t += dt;
      st.appear = Math.min(1, st.appear + dt * 3.2);

      // 彩带
      for (var i = 0; i < st.confetti.length; i++) {
        var c = st.confetti[i];
        c.y += c.vy * dt;
        c.rot += dt * 3;
        if (c.y > CFG.VIEW_H + 20) { c.y = -20; c.x = (c.x + 91) % CFG.VIEW_W; }
      }

      var inp = BI.input, M = BI.mouse;

      // 鼠标
      st.hover = -1;
      if (M.inside) {
        for (var b = 0; b < 2; b++) {
          var r = btnRect(b);
          if (inp.hitRect(r.x, r.y, r.w, r.h)) st.hover = b;
        }
      }
      if (M.clicked && st.hover >= 0) {
        BI.sfx.play('menuConfirm');
        return st.hover === 0 ? 'replay' : 'menu';
      }

      // 键盘：入场动画没放完之前不吃输入，避免误触
      if (st.appear < 1) return null;

      if (inp.wasPressed('Enter') || inp.wasPressed('Space') ||
          inp.wasPressed('NumpadEnter') || inp.wasPressed('KeyR')) {
        BI.sfx.play('menuConfirm');
        return 'replay';
      }
      if (inp.wasPressed('Escape') || inp.wasPressed('KeyM') || inp.wasPressed('Backspace')) {
        BI.sfx.play('menuMove');
        return 'menu';
      }
      return null;
    },

    /* ============================================================
     * 渲染
     * ============================================================ */
    draw: function (ctx, st) {
      var s = st.summary;
      var W = CFG.VIEW_W, H = CFG.VIEW_H;

      // 压暗背景
      ctx.save();
      ctx.globalAlpha = 0.72 * st.appear;
      ctx.fillStyle = '#0d1220';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // 彩带
      ctx.save();
      for (var i = 0; i < st.confetti.length; i++) {
        var cf = st.confetti[i];
        ctx.save();
        ctx.translate(cf.x, cf.y);
        ctx.rotate(cf.rot);
        ctx.globalAlpha = 0.85 * st.appear;
        ctx.fillStyle = cf.color;
        ctx.fillRect(-cf.w / 2, -cf.h / 2, cf.w, cf.h);
        ctx.restore();
      }
      ctx.restore();

      // 卡片入场：从下方弹入 + 轻微过冲
      var e = st.appear;
      var over = e < 1 ? 1 - Math.pow(1 - e, 3) : 1;
      var scale = 0.86 + over * 0.14 + (e < 1 ? Math.sin(e * Math.PI) * 0.03 : 0);
      var c = cardRect();

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -(H / 2) + (1 - over) * 40);

      // 卡片底
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 12;
      D.blob(ctx, c.x, c.y, c.w, c.h, 22, '#232b4a', 'rgba(255,255,255,.14)', 2);
      ctx.restore();

      // 顶部色条：赢了金色、输了灰蓝、平局紫色
      var accent = (s.winner === 'p1' || s.winner === 'p2') ? '#ffd166'
        : (s.winner === 'draw' ? '#c78bff' : '#7f8bb5');
      ctx.save();
      D.roundRect(ctx, c.x, c.y, c.w, 8, 22);
      ctx.clip();
      ctx.fillStyle = accent;
      ctx.fillRect(c.x, c.y, c.w, 8);
      ctx.restore();

      // 主标题
      D.text(ctx, s.title, W / 2, c.y + 62, {
        font: 'bold 40px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: accent, stroke: 'rgba(0,0,0,.45)', strokeWidth: 6
      });

      // 副标题
      if (s.subtitle) {
        D.text(ctx, s.subtitle, W / 2, c.y + 102, {
          font: '15px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle',
          fill: 'rgba(220,228,255,.8)'
        });
      }

      // 分隔线
      ctx.save();
      ctx.globalAlpha = .16;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(c.x + 34, c.y + 130, c.w - 68, 1);
      ctx.restore();

      // 数据区
      result.drawStats(ctx, st, c.x + 34, c.y + 148, c.w - 68);

      ctx.restore();

      // 按钮不参与卡片缩放，单独画（这样点击区域和视觉一致）
      result.drawButtons(ctx, st);

      D.text(ctx, 'Enter / R 再来一局　·　Esc / M 返回菜单', W / 2, H - 26, {
        font: '13px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: 'rgba(200,210,240,.55)'
      });
    },

    drawStats: function (ctx, st, x, y, w) {
      var s = st.summary;
      var left = [], right = [];

      if (s.mode === 'dig') {
        left.push(['用时', s.elapsed.toFixed(1) + ' 秒']);
        left.push(['已清除障碍', s.bricksCleared + ' / ' + s.startBricks]);
        left.push(['剩余障碍', String(s.bricksLeft)]);
        right.push(['爆炸次数', String(s.explosions)]);
        right.push(['剩余生命', String(s.players[0] ? s.players[0].lives : 0)]);
        var p0 = s.players[0];
        if (p0) {
          right.push(['火力 / 炸弹', p0.power + '格 / ' + p0.maxBombs + '颗']);
        }
      } else if (s.mode === 'adventure') {
        left.push([s.winner === 'p1' ? '完成关卡' : '到达关卡', s.level + ' / ' + (s.totalLevels || CFG.ADVENTURE_LEVELS) + '关']);
        left.push(['击败敌人', String(s.kills || 0)]);
        left.push(['用时', s.elapsed.toFixed(1) + '秒']);
        right.push(['爆炸次数', String(s.explosions)]);
        right.push(['剩余生命', String(s.players[0] ? s.players[0].lives : 0)]);
        var adventurer=s.players[0];
        if(adventurer)right.push(['火力 / 炸弹', adventurer.power+'格 / '+adventurer.maxBombs+'颗']);
      } else {
        left.push(['最终比分', s.scores.p1 + ' : ' + s.scores.p2]);
        left.push(['回合数', String(s.round)]);
        left.push(['爆炸次数', String(s.explosions)]);
        right.push(['1P 火力 / 炸弹', s.players[0] ? (s.players[0].power + '格 / ' + s.players[0].maxBombs + '颗') : '-']);
        right.push(['2P 火力 / 炸弹', s.players[1] ? (s.players[1].power + '格 / ' + s.players[1].maxBombs + '颗') : '-']);
      }

      var colW = w / 2;
      var lineH = 30;
      result.drawCol(ctx, left, x, y, colW - 12, lineH);
      result.drawCol(ctx, right, x + colW + 12, y, colW - 12, lineH);
    },

    drawCol: function (ctx, rows, x, y, w, lineH) {
      for (var i = 0; i < rows.length; i++) {
        var yy = y + i * lineH;
        D.text(ctx, rows[i][0], x, yy, {
          font: '14px "Microsoft YaHei", sans-serif',
          baseline: 'middle', fill: 'rgba(190,200,230,.72)'
        });
        D.text(ctx, rows[i][1], x + w, yy, {
          font: 'bold 15px "Microsoft YaHei", sans-serif',
          align: 'right', baseline: 'middle', fill: '#eef2ff'
        });
      }
    },

    drawButtons: function (ctx, st) {
      var labels = ['再来一局', '返回菜单'];
      var sub = ['Enter / R', 'Esc / M'];
      var colors = ['#ffd166', 'rgba(255,255,255,.10)'];
      var textColors = ['#3a2a10', '#eef2ff'];
      var edges = ['rgba(0,0,0,.3)', 'rgba(255,255,255,.2)'];

      for (var i = 0; i < 2; i++) {
        var r = btnRect(i);
        var hot = st.hover === i;
        var k = hot ? 1.04 : 1;
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.scale(k, k);
        D.blob(ctx, -r.w / 2, -r.h / 2, r.w, r.h, 14,
          colors[i], hot ? '#ffffff' : edges[i], hot ? 3 : 2);
        D.text(ctx, labels[i], 0, -6, {
          font: 'bold 19px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle', fill: textColors[i]
        });
        D.text(ctx, sub[i], 0, 14, {
          font: '11px Consolas, monospace',
          align: 'center', baseline: 'middle',
          fill: i === 0 ? 'rgba(58,42,16,.65)' : 'rgba(200,210,240,.5)'
        });
        ctx.restore();
      }
    }
  };

})(window.BI = window.BI || {});
