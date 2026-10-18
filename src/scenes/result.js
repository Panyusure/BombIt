/* ============================================================
 * result.js —— 结算界面
 *
 * 胜负横幅 + 本局数据 + 「再来一局 / 返回菜单」。
 * 视觉：Motion UI 的赛后战报，奶油纸 + 胜者色硬阴影 + 数据表。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw, C = CFG.C, U = BI.ui;

  var CARD = { w: 560, h: 430 };
  var BTN = { w: 210, h: 52, gap: 20 };

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
      return {
        t: 0,
        appear: 0,
        summary: summary,
        confetti: result.makeConfetti(summary),
        hover: -1
      };
    },

    makeConfetti: function (summary) {
      var win = summary.mode === 'versus'
        ? (summary.winner === 'p1' || summary.winner === 'p2')
        : summary.winner === 'p1';
      if (!win) return [];
      var out = [];
      var colors = [U.C.yellow, U.C.cyan, U.C.pink, U.C.green, U.C.orange, U.C.cream];
      for (var i = 0; i < 48; i++) {
        out.push({
          x: (i * 149.5) % CFG.VIEW_W,
          y: -((i * 57) % 430) - 20,
          vy: 55 + (i % 7) * 24,
          sway: (i % 5) * .6,
          rot: (i % 11) * .42,
          w: 4 + (i % 4) * 3,
          h: 9 + (i % 3) * 5,
          star: i % 7 === 0,
          color: colors[i % colors.length]
        });
      }
      return out;
    },

    update: function (st, dt) {
      st.t += dt;
      st.appear = Math.min(1, st.appear + dt * 3.2);

      for (var i = 0; i < st.confetti.length; i++) {
        var c = st.confetti[i];
        c.y += c.vy * dt;
        c.rot += dt * 3;
        if (c.y > CFG.VIEW_H + 20) { c.y = -20; c.x = (c.x + 91) % CFG.VIEW_W; }
      }

      var inp = BI.input, M = BI.mouse;

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

    draw: function (ctx, st) {
      var s = st.summary;
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      var versus = s.mode === 'versus';
      var playerWin = s.winner === 'p1';
      var anyWin = s.winner === 'p1' || s.winner === 'p2';
      var draw = s.winner === 'draw';
      var accent = draw ? U.C.pink : ((versus ? anyWin : playerWin) ? U.C.yellow : U.C.sky);
      var stamp = draw ? 'DRAW' : (versus
        ? (s.winner === 'p1' ? '1P WIN' : '2P WIN')
        : (playerWin ? 'WIN' : 'LOSE'));

      // 压暗 + 网点
      ctx.save();
      ctx.globalAlpha = .84 * st.appear;
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      U.dots(ctx, 0, 0, W, H, U.C.cream, .04 * st.appear, 15);

      // 彩带
      ctx.save();
      for (var i = 0; i < st.confetti.length; i++) {
        var cf = st.confetti[i];
        ctx.save();
        ctx.translate(cf.x, cf.y);
        ctx.rotate(cf.rot);
        ctx.globalAlpha = .9 * st.appear;
        if (cf.star) {
          U.star(ctx, 0, 0, cf.w * 1.7, cf.w * .7, cf.color, 5, cf.rot);
        } else {
          ctx.fillStyle = cf.color;
          ctx.fillRect(-cf.w / 2, -cf.h / 2, cf.w, cf.h);
        }
        ctx.restore();
      }
      ctx.restore();

      var e = st.appear;
      var over = e < 1 ? 1 - Math.pow(1 - e, 3) : 1;
      var scale = .88 + over * .12 + (e < 1 ? Math.sin(e * Math.PI) * .02 : 0);
      var c = cardRect();

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -(H / 2) + (1 - over) * 34);

      U.panel(ctx, c.x, c.y, c.w, c.h, {
        fill: U.C.cream, stroke: U.C.ink, lw: 3, r: 5,
        shadow: accent, shadowX: 8, shadowY: 8
      });

      // 顶部墨色刊头
      ctx.save();
      D.roundRect(ctx, c.x, c.y, c.w, c.h, 5);
      ctx.clip();
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(c.x, c.y, c.w, 64);
      U.dots(ctx, c.x, c.y, c.w, 64, U.C.cream, .055, 12);
      ctx.restore();
      U.text(ctx, 'MATCH REPORT  /  RESULT', c.x + 24, c.y + 22, {
        size: 6.8, weight: 700, family: U.F.mono, fill: U.C.cyan
      });
      U.text(ctx, 'BOMBIT  /  BATTLE LOG', c.x + c.w - 24, c.y + 22, {
        size: 6.8, weight: 700, family: U.F.mono, fill: 'rgba(245,235,216,.45)', align: 'right'
      });
      U.text(ctx, 'FINAL WHISTLE  /  ' + (s.title || '对局结束'), c.x + 24, c.y + 48, {
        size: 8, weight: 700, family: U.F.mono, fill: 'rgba(245,235,216,.55)'
      });

      // 主标题
      U.text(ctx, s.title || '对局结束', c.x + 28, c.y + 112, {
        size: 40, weight: 900, family: U.F.cn, fill: U.C.ink,
        shadow: accent, shadowX: 4, shadowY: 4
      });
      if (s.subtitle) {
        U.text(ctx, s.subtitle, c.x + 30, c.y + 145, {
          size: 9.5, weight: 500, family: U.F.cn, fill: 'rgba(20,16,25,.6)'
        });
      }

      // 右上角赛果贴纸
      U.tag(ctx, stamp, c.x + c.w - 28, c.y + 102, {
        size: 12, weight: 900, family: U.F.impact, fill: accent, fg: U.C.ink,
        padX: 11, h: 26, align: 'right', stroke: U.C.ink, lw: 1.5, rot: .04,
        shadow: U.C.ink, shadowX: 3, shadowY: 3
      });
      U.star(ctx, c.x + c.w - 52, c.y + 144, 7, 3, accent, 5, st.t * .2);

      // 数据板
      var sx = c.x + 28, sy = c.y + 184, sw = c.w - 56, sh = 148;
      U.panel(ctx, sx, sy, sw, sh, {
        fill: '#FAF1E2', stroke: U.C.ink, lw: 1.5, r: 3,
        shadow: 'rgba(20,16,25,.16)', shadowX: 3, shadowY: 3
      });
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(sx, sy, sw, 25);
      U.text(ctx, 'MATCH DATA  /  对局数据', sx + 12, sy + 13, {
        size: 6.5, weight: 700, family: U.F.mono, fill: U.C.cream
      });
      U.text(ctx, 'SNAPSHOT  ' + pad2(st.summary.round || 1), sx + sw - 12, sy + 13, {
        size: 6, weight: 700, family: U.F.mono, fill: U.C.cyan, align: 'right'
      });
      result.drawStats(ctx, st, sx + 16, sy + 44, sw - 32);

      ctx.restore();

      // 按钮不参与卡片缩放，保证点击区域和视觉一致
      result.drawButtons(ctx, st);

      U.tag(ctx, 'Enter / R 再来一局　·　Esc / M 返回菜单', W / 2, H - 25, {
        size: 6.2, weight: 700, family: U.F.mono, fill: U.C.ink, fg: U.C.cream,
        padX: 9, h: 18, align: 'center', stroke: U.C.cream, lw: 1
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
        if (p0) right.push(['火力 / 炸弹', p0.power + '格 / ' + p0.maxBombs + '颗']);
      } else if (s.mode === 'adventure') {
        left.push([s.winner === 'p1' ? '完成关卡' : '到达关卡', s.level + ' / ' + (s.totalLevels || CFG.ADVENTURE_LEVELS) + '关']);
        left.push(['击败敌人', String(s.kills || 0)]);
        left.push(['用时', s.elapsed.toFixed(1) + '秒']);
        right.push(['爆炸次数', String(s.explosions)]);
        right.push(['剩余生命', String(s.players[0] ? s.players[0].lives : 0)]);
        var adventurer = s.players[0];
        if (adventurer) right.push(['火力 / 炸弹', adventurer.power + '格 / ' + adventurer.maxBombs + '颗']);
      } else {
        left.push(['最终比分', s.scores.p1 + ' : ' + s.scores.p2]);
        left.push(['回合数', String(s.round)]);
        left.push(['爆炸次数', String(s.explosions)]);
        right.push(['1P 火力 / 炸弹', s.players[0] ? (s.players[0].power + '格 / ' + s.players[0].maxBombs + '颗') : '-']);
        right.push(['2P 火力 / 炸弹', s.players[1] ? (s.players[1].power + '格 / ' + s.players[1].maxBombs + '颗') : '-']);
      }

      var colW = w / 2;
      result.drawCol(ctx, left, x, y, colW - 12, 28);
      ctx.strokeStyle = 'rgba(20,16,25,.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + colW, y - 8);
      ctx.lineTo(x + colW, y + 82);
      ctx.stroke();
      result.drawCol(ctx, right, x + colW + 12, y, colW - 12, 28);
    },

    drawCol: function (ctx, rows, x, y, w, lineH) {
      for (var i = 0; i < rows.length; i++) {
        var yy = y + i * lineH;
        if (i > 0) {
          ctx.strokeStyle = 'rgba(20,16,25,.09)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, yy - 12);
          ctx.lineTo(x + w, yy - 12);
          ctx.stroke();
        }
        U.text(ctx, rows[i][0], x, yy, {
          size: 8.5, weight: 500, family: U.F.cn, fill: 'rgba(20,16,25,.55)'
        });
        U.text(ctx, rows[i][1], x + w, yy, {
          size: 11.5, weight: 900, family: U.F.mono, fill: U.C.ink, align: 'right'
        });
      }
    },

    drawButtons: function (ctx, st) {
      var labels = ['再来一局', '返回菜单'];
      var sub = ['Enter / R', 'Esc / M'];
      var accent = [U.C.yellow, U.C.cream];

      for (var i = 0; i < 2; i++) {
        var r = btnRect(i);
        var hot = st.hover === i;
        var k = hot ? 1.018 : 1;
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.scale(k, k);
        U.panel(ctx, -r.w / 2, -r.h / 2, r.w, r.h, {
          fill: hot ? U.C.ink : (i === 0 ? U.C.yellow : U.C.cream),
          stroke: U.C.ink, lw: 2, r: 3,
          shadow: hot ? U.C.orange : (i === 0 ? U.C.orange : 'rgba(20,16,25,.18)'),
          shadowX: hot ? 4 : 2, shadowY: hot ? 4 : 2
        });
        if (hot) {
          ctx.fillStyle = i === 0 ? U.C.yellow : U.C.cyan;
          ctx.fillRect(-r.w / 2, -r.h / 2, 5, r.h);
        }
        U.play(ctx, -r.w / 2 + 22, 0, 10, hot ? U.C.yellow : U.C.ink);
        U.text(ctx, labels[i], -r.w / 2 + 40, -2, {
          size: 15, weight: 900, family: U.F.cn, fill: hot ? U.C.cream : U.C.ink
        });
        U.text(ctx, sub[i], -r.w / 2 + 40, 15, {
          size: 5.8, weight: 700, family: U.F.mono, fill: hot ? 'rgba(245,235,216,.5)' : 'rgba(20,16,25,.4)'
        });
        U.keycap(ctx, i === 0 ? 'R' : 'ESC', r.w / 2 - 44, -11, 30, 20,
          hot ? U.C.yellow : U.C.ink, hot ? U.C.ink : U.C.cream);
        ctx.restore();
      }
    }
  };

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

})(window.BI = window.BI || {});
