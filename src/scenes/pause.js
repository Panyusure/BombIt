/* ============================================================
 * pause.js —— 暂停菜单
 *
 * 「继续游戏 / 重新开始 / 返回菜单」三件事都能做。
 * 键盘（↑↓ 选择，Enter 确认，Esc 直接继续）和鼠标（移动高亮、点击确认）都能用。
 *
 * 单独拆成一个模块而不是塞在 main.js 里，是为了：
 *   · 能像 menu / result 一样单独测
 *   · 按钮的布局和命中区用同一份 layout()，避免"看到的位置"和"点到位置"不一致
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw;

  var CARD = { w: 400, h: 330 };
  var BTN = { w: 268, h: 54, gap: 14 };

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
        appear: 0,          // 0 -> 1 的入场动画
        index: 0,           // 键盘选中的项
        hover: -1           // 鼠标悬停的项
      };
    },

    /**
     * 每帧推进，返回被选中的动作：
     *   'resume' | 'restart' | 'menu' | null
     */
    update: function (st, dt) {
      st.t += dt;
      st.appear = Math.min(1, st.appear + dt * 6);

      var inp = BI.input, M = BI.mouse;

      // 鼠标悬停
      st.hover = -1;
      if (M.inside) {
        for (var i = 0; i < ITEMS.length; i++) {
          var r = btnRect(i);
          if (inp.hitRect(r.x, r.y, r.w, r.h)) { st.hover = i; break; }
        }
      }
      if (st.hover >= 0) st.index = st.hover;

      // 鼠标点击直接确认
      if (M.clicked && st.hover >= 0) {
        BI.sfx.play('menuConfirm');
        return ITEMS[st.hover].id;
      }

      // Esc / P 直接继续 —— **不受入场动画限制**。
      // 这是"再按一次取消"的直觉，不该等动画放完才有反应。
      // 暂停那一下的按键已经被 input.clear() 吃掉了，不会同帧来回切。
      if (inp.wasPressed('Escape') || inp.wasPressed('KeyP')) return 'resume';

      // 其余按键等入场动画放完再吃，避免刚暂停就误触到「重新开始」
      if (st.appear < 1) return null;

      // 键盘上下选择
      if (inp.wasPressed('ArrowDown') || inp.wasPressed('KeyS')) {
        st.index = (st.index + 1) % ITEMS.length;
        BI.sfx.play('menuMove');
      }
      if (inp.wasPressed('ArrowUp') || inp.wasPressed('KeyW')) {
        st.index = (st.index + ITEMS.length - 1) % ITEMS.length;
        BI.sfx.play('menuMove');
      }

      // 确认
      if (inp.wasPressed('Enter') || inp.wasPressed('Space') ||
          inp.wasPressed('NumpadEnter')) {
        BI.sfx.play('menuConfirm');
        return ITEMS[st.index].id;
      }

      // 快捷键：R 重开，M 回菜单
      if (inp.wasPressed('KeyR')) { BI.sfx.play('menuConfirm'); return 'restart'; }
      if (inp.wasPressed('KeyM')) { BI.sfx.play('menuMove'); return 'menu'; }

      return null;
    },

    /* ============================================================
     * 渲染
     * ============================================================ */
    draw: function (ctx, st) {
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      var e = st.appear;

      // 压暗战场
      ctx.save();
      ctx.globalAlpha = 0.66 * e;
      ctx.fillStyle = '#0d1220';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      var c = cardRect();
      var over = 1 - Math.pow(1 - e, 3);
      var scale = 0.90 + over * 0.10;

      ctx.save();
      ctx.translate(W / 2, H / 2 + (1 - over) * 26);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -H / 2);

      // 卡片
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 38;
      ctx.shadowOffsetY = 12;
      D.blob(ctx, c.x, c.y, c.w, c.h, 22, '#232b4a', 'rgba(255,255,255,.14)', 2);
      ctx.restore();

      // 顶部色条
      ctx.save();
      D.roundRect(ctx, c.x, c.y, c.w, 7, 22);
      ctx.clip();
      ctx.fillStyle = '#5ec8f0';
      ctx.fillRect(c.x, c.y, c.w, 7);
      ctx.restore();

      D.text(ctx, st.title || '已暂停', W / 2, c.y + 54, {
        font: 'bold 34px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: '#eef2ff', stroke: 'rgba(0,0,0,.45)', strokeWidth: 5
      });

      // 场上概况，让玩家知道自己暂停在哪
      var info = st.info || '';
      if (info) {
        D.text(ctx, info, W / 2, c.y + 88, {
          font: '13px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle', fill: 'rgba(200,212,245,.72)'
        });
      }

      ctx.restore();

      // 按钮不参与卡片缩放，单独画 —— 这样"看到的"和"点到的"完全一致
      pause.drawButtons(ctx, st);

      D.text(ctx, '↑↓ 选择　·　Enter 确认　·　Esc 继续', W / 2, H - 26, {
        font: '13px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: 'rgba(200,210,240,.55)'
      });
    },

    drawButtons: function (ctx, st) {
      for (var i = 0; i < ITEMS.length; i++) {
        var it = ITEMS[i];
        var r = btnRect(i);
        var hot = (st.index === i);
        var k = hot ? 1.035 : 1;

        var bg = it.primary ? '#5ec8f0' : 'rgba(255,255,255,.10)';
        var fg = it.primary ? '#0e2a38' : '#eef2ff';
        var edge = hot ? '#ffffff' : (it.primary ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.18)');

        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.scale(k, k);
        D.blob(ctx, -r.w / 2, -r.h / 2, r.w, r.h, 14, bg, edge, hot ? 3 : 2);
        D.text(ctx, it.label, -18, 0, {
          font: 'bold 20px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle', fill: fg
        });
        D.text(ctx, it.sub, r.w / 2 - 16, 1, {
          font: '11px Consolas, monospace',
          align: 'right', baseline: 'middle',
          fill: it.primary ? 'rgba(14,42,56,.6)' : 'rgba(200,210,240,.5)'
        });
        ctx.restore();
      }
    }
  };

})(window.BI = window.BI || {});
