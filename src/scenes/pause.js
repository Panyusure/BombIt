/* ============================================================
 * pause.js —— 暂停菜单
 *
 * 「继续游戏 / 重新开始 / 返回菜单」三件事都能做。
 * 键盘（↑↓ 选择，Enter 确认，Esc 直接继续）和鼠标（移动高亮、点击确认）都能用。
 *
 * 视觉：一张从战场上方压下来的奶油色“作战暂停”海报，硬阴影 + 墨线 + 胶片编号。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw, U = BI.ui;

  var CARD = { w: 430, h: 430 };
  var BTN = { w: 300, h: 52, gap: 12 };

  var ITEMS = [
    { id: 'resume', label: '继续游戏', sub: 'Esc / Enter', primary: true },
    { id: 'restart', label: '重新开始', sub: 'R' },
    { id: 'menu', label: '返回菜单', sub: 'M' }
  ];

  function cardRect() {
    return {
      x: (CFG.VIEW_W - CARD.w) / 2,
      y: (CFG.VIEW_H - CARD.h) / 2,
      w: CARD.w, h: CARD.h
    };
  }

  function btnRect(i) {
    var c = cardRect();
    var total = ITEMS.length * BTN.h + (ITEMS.length - 1) * BTN.gap;
    var y0 = c.y + c.h - total - 24;
    return {
      x: c.x + (c.w - BTN.w) / 2,
      y: y0 + i * (BTN.h + BTN.gap),
      w: BTN.w, h: BTN.h
    };
  }

  var pause = BI.pause = {

    ITEMS: ITEMS,
    cardRect: cardRect,
    btnRect: btnRect,

    create: function () {
      return {
        t: 0,
        appear: 0,
        index: 0,
        hover: -1
      };
    },

    update: function (st, dt) {
      st.t += dt;
      st.appear = Math.min(1, st.appear + dt * 6);

      var inp = BI.input, M = BI.mouse;

      st.hover = -1;
      if (M.inside) {
        for (var i = 0; i < ITEMS.length; i++) {
          var r = btnRect(i);
          if (inp.hitRect(r.x, r.y, r.w, r.h)) { st.hover = i; break; }
        }
      }
      if (st.hover >= 0) st.index = st.hover;

      if (M.clicked && st.hover >= 0) {
        BI.sfx.play('menuConfirm');
        return ITEMS[st.hover].id;
      }

      // Esc / P 直接继续，不等入场动画。
      if (inp.wasPressed('Escape') || inp.wasPressed('KeyP')) return 'resume';

      if (st.appear < 1) return null;

      if (inp.wasPressed('ArrowDown') || inp.wasPressed('KeyS')) {
        st.index = (st.index + 1) % ITEMS.length;
        BI.sfx.play('menuMove');
      }
      if (inp.wasPressed('ArrowUp') || inp.wasPressed('KeyW')) {
        st.index = (st.index + ITEMS.length - 1) % ITEMS.length;
        BI.sfx.play('menuMove');
      }

      if (inp.wasPressed('Enter') || inp.wasPressed('Space') ||
          inp.wasPressed('NumpadEnter')) {
        BI.sfx.play('menuConfirm');
        return ITEMS[st.index].id;
      }

      if (inp.wasPressed('KeyR')) { BI.sfx.play('menuConfirm'); return 'restart'; }
      if (inp.wasPressed('KeyM')) { BI.sfx.play('menuMove'); return 'menu'; }

      return null;
    },

    draw: function (ctx, st) {
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      var e = st.appear;

      // 压暗战场 + 墨色网点
      ctx.save();
      ctx.globalAlpha = .84 * e;
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      U.dots(ctx, 0, 0, W, H, U.C.cream, .04 * e, 15);

      var c = cardRect();
      var over = 1 - Math.pow(1 - e, 3);
      var scale = .92 + over * .08;

      ctx.save();
      ctx.translate(W / 2, H / 2 + (1 - over) * 30);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -H / 2);

      U.panel(ctx, c.x, c.y, c.w, c.h, {
        fill: U.C.cream, stroke: U.C.ink, lw: 3, r: 5,
        shadow: U.C.orange, shadowX: 8, shadowY: 8
      });

      // 顶部墨色刊头
      ctx.save();
      D.roundRect(ctx, c.x, c.y, c.w, c.h, 5);
      ctx.clip();
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(c.x, c.y, c.w, 58);
      U.dots(ctx, c.x, c.y, c.w, 58, U.C.cream, .06, 12);
      ctx.restore();
      U.text(ctx, 'PAUSED  /  TACTICAL BREAK', c.x + 22, c.y + 22, {
        size: 6.8, weight: 700, family: U.F.mono, fill: U.C.cyan
      });
      U.text(ctx, 'BATTLE LOG  /  03', c.x + c.w - 22, c.y + 22, {
        size: 6.8, weight: 700, family: U.F.mono, fill: 'rgba(245,235,216,.48)', align: 'right'
      });
      U.text(ctx, '战场已冻结', c.x + 22, c.y + 43, {
        size: 9, weight: 700, family: U.F.cn, fill: 'rgba(245,235,216,.7)'
      });

      // 标题与场上概况
      U.text(ctx, st.title || '已暂停', c.x + 24, c.y + 106, {
        size: 38, weight: 900, family: U.F.cn, fill: U.C.ink,
        shadow: U.C.orange, shadowX: 3, shadowY: 3
      });
      U.text(ctx, 'PAUSE / 战术会议', c.x + 26, c.y + 134, {
        size: 6.5, weight: 700, family: U.F.mono, fill: 'rgba(20,16,25,.42)'
      });
      var info = st.info || '';
      if (info) {
        U.text(ctx, info, c.x + 24, c.y + 158, {
          size: 9, weight: 500, family: U.F.cn, fill: 'rgba(20,16,25,.62)'
        });
      }
      ctx.strokeStyle = 'rgba(20,16,25,.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x + 24, c.y + 174);
      ctx.lineTo(c.x + c.w - 24, c.y + 174);
      ctx.stroke();
      U.text(ctx, '选择下一步 / SELECT NEXT MOVE', c.x + 24, c.y + 187, {
        size: 6.5, weight: 700, family: U.F.mono, fill: 'rgba(20,16,25,.42)'
      });

      // 大面积幽灵编号
      U.text(ctx, pad2((st.index || 0) + 1), c.x + c.w - 24, c.y + 244, {
        size: 108, weight: 900, family: U.F.impact, fill: 'rgba(20,16,25,0)',
        stroke: 'rgba(20,16,25,.065)', strokeWidth: 1.5, align: 'right'
      });
      U.star(ctx, c.x + c.w - 44, c.y + 204, 10, 4.5, U.C.yellow, 5, st.t * .3);

      ctx.restore();

      // 按钮不参与卡片缩放，保证点击区域和视觉一致
      pause.drawButtons(ctx, st);

      U.tag(ctx, '↑↓ 选择　·　Enter 确认　·　Esc 继续', W / 2, H - 25, {
        size: 6.2, weight: 700, family: U.F.mono, fill: U.C.ink, fg: U.C.cream,
        padX: 9, h: 18, align: 'center', stroke: U.C.cream, lw: 1
      });
    },

    drawButtons: function (ctx, st) {
      for (var i = 0; i < ITEMS.length; i++) {
        var it = ITEMS[i];
        var r = btnRect(i);
        var hot = (st.index === i);
        var primary = it.primary;
        var k = hot ? 1.012 : 1;
        var fill = hot ? U.C.ink : (primary ? U.C.yellow : U.C.cream);
        var fg = hot ? U.C.cream : U.C.ink;
        var accent = primary ? U.C.orange : (i === 1 ? U.C.cyan : U.C.pink);

        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.scale(k, k);
        U.panel(ctx, -r.w / 2, -r.h / 2, r.w, r.h, {
          fill: fill, stroke: U.C.ink, lw: 2, r: 3,
          shadow: hot ? accent : (primary ? U.C.orange : 'rgba(20,16,25,.18)'),
          shadowX: hot ? 4 : 2, shadowY: hot ? 4 : 2
        });
        if (hot) {
          ctx.fillStyle = accent;
          ctx.fillRect(-r.w / 2, -r.h / 2, 5, r.h);
        }
        U.text(ctx, pad2(i + 1), -r.w / 2 + 18, 0, {
          size: 11, weight: 900, family: U.F.impact,
          fill: hot ? U.C.yellow : (primary ? U.C.ink : accent), alpha: .95
        });
        U.text(ctx, it.label, -r.w / 2 + 42, 0, {
          size: 17, weight: 900, family: U.F.cn, fill: fg
        });
        U.text(ctx, it.sub, r.w / 2 - 42, 0, {
          size: 6.5, weight: 700, family: U.F.mono, fill: hot ? 'rgba(245,235,216,.55)' : 'rgba(20,16,25,.5)', align: 'right'
        });
        U.text(ctx, primary ? 'RESUME' : (it.id === 'restart' ? 'RETRY' : 'MENU'), r.w / 2 - 12, 13, {
          size: 5, weight: 700, family: U.F.mono, fill: hot ? accent : 'rgba(20,16,25,.35)', align: 'right'
        });
        ctx.restore();
      }
    }
  };

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

})(window.BI = window.BI || {});
