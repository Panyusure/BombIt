/* ============================================================
 * menu.js —— 开始界面：选模式 + 选角色
 *
 * 三行式布局，方向键在行内/行间移动，Enter 开始，也可以用鼠标点：
 *   第 0 行  模式     单人·闯关打怪 / 单人·计时拆砖 / 双人·同屏对战
 *   第 1 行  1P 角色
 *   第 2 行  2P 角色   （只有双人模式才有这一行）
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw, S = BI.sprites, C = CFG.C;

  var MODES = [
    {
      id: 'adventure', inputMode: 'solo', label: '单人 · 闯关打怪',
      desc: '共' + CFG.ADVENTURE_LEVELS + '关 · 第5、10关BOSS战', players: 1, color: '#8fe3a1'
    },
    {
      id: 'dig', inputMode: 'solo', label: '单人 · 计时拆砖',
      desc: '限时清除全部障碍', players: 1, color: '#5ec8f0'
    },
    {
      id: 'versus', inputMode: 'versus', label: '双人 · 同屏对战',
      desc: '先得 2 分者获胜', players: 2, color: '#ff9eb5'
    }
  ];

  var TITLE_TOP = 34, BLOCK_TOP = 146, BLOCK_BOTTOM = 520;
  var LABEL_X = 30, ITEMS_X = 152, ITEMS_W = 548;
  var ROW_GAP = 26, MODE_H = 78, CHAR_H = 86;
  var BTN = { w: 268, h: 56, y: 566 };
  var REPLAY_BTN = { x: 558, y: 22, w: 142, h: 38 };

  function itemW(count) { return (ITEMS_W - ROW_GAP * (count - 1)) / count; }

  var menu = BI.menu = {

    MODES: MODES,
    REPLAY_BUTTON: REPLAY_BTN,

    create: function () {
      var chars = menu.charList();
      var st = {
        t: 0,
        focus: 0,                 // 当前行 0=模式 1=1P 2=2P
        modeIndex: 0,
        charIndex: [0, chars.length > 1 ? 1 : 0],
        chars: chars,
        rows: [],
        hover: null,              // 鼠标悬停的对象
        pulse: 0
      };
      menu.layout(st);
      return st;
    },

    /** 可选角色列表；一个素材都没有时给一个占位项，菜单照样能用 */
    charList: function () {
      var ids = BI.assets.selectable();
      if (!ids.length) return [{ id: null, name: '占位小人', color: C.p1 }];
      return ids.map(function (id) {
        var a = BI.assets.get(id);
        return { id: id, name: (a && a.name) || id, color: C.p1 };
      });
    },

    /** 重新计算行位置（模式切换后行数会变） */
    layout: function (st) {
      var versus = MODES[st.modeIndex].players === 2;
      var rows = [
        { type: 'mode', h: MODE_H, label: '模式' },
        { type: 'char', player: 0, h: CHAR_H, label: '1P 角色' }
      ];
      if (versus) rows.push({ type: 'char', player: 1, h: CHAR_H, label: '2P 角色' });

      var total = 0;
      for (var i = 0; i < rows.length; i++) total += rows[i].h;
      total += ROW_GAP * (rows.length - 1);

      var y = BLOCK_TOP + Math.max(0, (BLOCK_BOTTOM - BLOCK_TOP - total) / 2);
      for (var j = 0; j < rows.length; j++) {
        rows[j].y = y;
        y += rows[j].h + ROW_GAP;
      }
      st.rows = rows;
      st.layoutMode = st.modeIndex;
      if (st.focus >= rows.length) st.focus = rows.length - 1;
    },

    /* ============================================================
     * 每帧
     * ============================================================ */
    update: function (st, dt) {
      if (st.layoutMode !== st.modeIndex) menu.layout(st);
      st.t += dt;
      st.pulse += dt;

      var inp = BI.input, M = BI.mouse;
      var rows = st.rows;

      /* ---- 鼠标悬停 ---- */
      st.hover = null;
      if (M.inside) {
        for (var r = 0; r < rows.length; r++) {
          var items = menu.itemsOf(st, rows[r]);
          for (var i = 0; i < items.length; i++) {
            if (inp.hitRect(items[i].x, items[i].y, items[i].w, items[i].h)) {
              st.hover = { row: r, index: i };
            }
          }
        }
      }

      /* ---- 鼠标点击 ---- */
      if (M.clicked) {
        if (inp.hitRect(REPLAY_BTN.x, REPLAY_BTN.y, REPLAY_BTN.w, REPLAY_BTN.h)) {
          BI.sfx.play('menuConfirm');
          return { screen: 'replay' };
        }
        if (st.hover) {
          var hr = st.hover.row, hi = st.hover.index;
          if (st.focus === hr && menu.currentIndex(st, hr) === hi) {
            // 点在已经选中的项上 -> 直接开始（省一次 Enter）
            if (rows[hr].type === 'mode') return menu.confirm(st);
          }
          st.focus = hr;
          menu.setIndex(st, hr, hi);
          BI.sfx.play('menuMove');
        } else if (inp.hitRect((CFG.VIEW_W - BTN.w) / 2, BTN.y, BTN.w, BTN.h)) {
          return menu.confirm(st);
        }
      }

      rows = st.rows;
      /* ---- 键盘 ---- */
      var moved = false;
      if (inp.wasPressed('ArrowUp')) { st.focus = (st.focus - 1 + rows.length) % rows.length; moved = true; }
      if (inp.wasPressed('ArrowDown')) { st.focus = (st.focus + 1) % rows.length; moved = true; }

      if (inp.wasPressed('ArrowLeft') || inp.wasPressed('ArrowRight')) {
        var dir = inp.wasPressed('ArrowRight') ? 1 : -1;
        var n = menu.itemsOf(st, rows[st.focus]).length;
        var cur = menu.currentIndex(st, st.focus);
        menu.setIndex(st, st.focus, (cur + dir + n) % n);
        moved = true;
      }
      if (moved) {
        BI.sfx.play('menuMove');
      }

      // 确认开始
      if (inp.wasPressed('Enter') || inp.wasPressed('Space') ||
          inp.wasPressed('NumpadEnter')) {
        return menu.confirm(st);
      }

      // 快速切换模式：1 / 2 / 3 键
      if (inp.wasPressed('Digit1') || inp.wasPressed('Digit2') || inp.wasPressed('Digit3')) {
        var pick = inp.wasPressed('Digit3') ? 2 : (inp.wasPressed('Digit2') ? 1 : 0);
        if (pick < MODES.length) {
          st.modeIndex = pick;
          st.focus = 0;
          menu.layout(st);
          BI.sfx.play('menuMove');
        }
      }

      return null;
    },

    /** 某一行上有哪些可选项（含屏幕矩形） */
    itemsOf: function (st, row) {
      var out = [];
      if (row.type === 'mode') {
        var w = itemW(MODES.length);
        for (var i = 0; i < MODES.length; i++) {
          out.push({ x: ITEMS_X + i * (w + ROW_GAP), y: row.y, w: w, h: row.h });
        }
      } else {
        var n = st.chars.length;
        var gap = n > 5 ? 12 : ROW_GAP;
        var cw = (ITEMS_W - gap * (n - 1)) / n;
        for (var j = 0; j < n; j++) {
          out.push({ x: ITEMS_X + j * (cw + gap), y: row.y, w: cw, h: row.h });
        }
      }
      return out;
    },

    currentIndex: function (st, rowIdx) {
      var row = st.rows[rowIdx];
      if (!row) return 0;
      return (row.type === 'mode') ? st.modeIndex : st.charIndex[row.player];
    },

    setIndex: function (st, rowIdx, idx) {
      var row = st.rows[rowIdx];
      if (!row) return;
      if (row.type === 'mode') {
        st.modeIndex = idx;
        menu.layout(st);
        st.hover = null;
      }
      else st.charIndex[row.player] = idx;
    },

    /** 确认开始，返回启动参数；否则返回 null */
    confirm: function (st) {
      var mode = MODES[st.modeIndex];
      var c1 = st.chars[st.charIndex[0]];
      var c2 = st.chars[st.charIndex[1]];

      // 双人模式下两个玩家别选同一个角色，否则 HUD 上分不清谁是谁
      if (mode.players === 2 && st.chars.length > 1 && c1 === c2) {
        st.charIndex[1] = (st.charIndex[1] + 1) % st.chars.length;
        c2 = st.chars[st.charIndex[1]];
      }

      BI.sfx.play('menuConfirm');

      return {
        mode: mode.id,
        inputMode: mode.inputMode,
        label: mode.label,
        chars: [c1 ? c1.id : null, c2 ? c2.id : null]
      };
    },

    /* ============================================================
     * 渲染
     * ============================================================ */
    draw: function (ctx, st) {
      if (st.layoutMode !== st.modeIndex) menu.layout(st);
      var W = CFG.VIEW_W, H = CFG.VIEW_H;

      // 背景：奥奇传说壁纸（已按菜单尺寸裁好缓存），没加载好就退回原来的渐变，
      // 开始界面永远可用，不会因为一张装饰图缺失而开不了局。
      var wp = BI.assets.wallpaper;
      if (wp && wp.ok && wp.canvas) {
        ctx.drawImage(wp.canvas, 0, 0, W, H);
        // 压暗压冷：壁纸本身很亮，不压一层的话卡片上的白字会被云朵吃掉
        var scrim = ctx.createLinearGradient(0, 0, 0, H);
        scrim.addColorStop(0, 'rgba(10,26,38,.62)');
        scrim.addColorStop(.46, 'rgba(9,22,34,.58)');
        scrim.addColorStop(1, 'rgba(7,16,26,.80)');
        ctx.fillStyle = scrim;
        ctx.fillRect(0, 0, W, H);
      } else {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#39505c');
        g.addColorStop(1, '#182b37');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      menu.drawBg(ctx, st);

      // 观战入口独立于模式与角色选择，不会开新对局。
      var replayHover = BI.mouse.inside && BI.input.hitRect(REPLAY_BTN.x, REPLAY_BTN.y, REPLAY_BTN.w, REPLAY_BTN.h);
      D.blob(ctx, REPLAY_BTN.x, REPLAY_BTN.y, REPLAY_BTN.w, REPLAY_BTN.h, 11,
        replayHover ? '#d3f4e4' : '#b4e4ce', 'rgba(255,255,255,.28)', 1);
      D.text(ctx, '▶  对局回放', REPLAY_BTN.x + REPLAY_BTN.w / 2, REPLAY_BTN.y + REPLAY_BTN.h / 2, {
        font: 'bold 14px "Microsoft YaHei", sans-serif', align: 'center', baseline: 'middle', fill: '#15352d'
      });

      // 标题
      var bob = Math.sin(st.t * 2) * 3;
      D.text(ctx, 'Q 版 泡 泡 堂', W / 2, TITLE_TOP + 40 + bob, {
        font: 'bold 40px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: '#f7e7bf', stroke: 'rgba(14,36,46,.6)', strokeWidth: 4
      });
      D.text(ctx, 'BombIt · 精灵冒险与同屏对战', W / 2, TITLE_TOP + 80 + bob, {
        font: '15px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: 'rgba(220,228,255,.72)'
      });

      ['森林', '工厂', '游乐园'].forEach(function (name, i) {
        var x = 260 + i * 100;
        D.circle(ctx, x - 24, 156, 3); ctx.fillStyle = ['#b5d49d', '#a9d0db', '#e6bdd4'][i]; ctx.fill();
        D.text(ctx, name, x - 14, 156, { font: '12px "Microsoft YaHei", sans-serif', fill: '#b5cad0' });
      });

      // 三行
      for (var r = 0; r < st.rows.length; r++) {
        menu.drawRow(ctx, st, r);
      }

      // 选人时直接看到所选技能，避免开局后还不知道角色差异。
      var versus = MODES[st.modeIndex].players === 2;
      D.blob(ctx, 152, 486, 548, 72, 12, 'rgba(230,241,224,.06)', 'rgba(227,240,220,.08)', 1);
      [0, 1].slice(0, versus ? 2 : 1).forEach(function (player, i) {
        var ch = st.chars[st.charIndex[player]], info = BI.SKILLS[ch.id] || BI.SKILLS.xiaonuo;
        var lore = BI.CHARACTER_LORE[ch.id];
        // 通灵次数直接读配置：以后调数值，菜单不会再写着旧数字
        var soulText = '放弹' + info.bombsToEvolve + '次或击杀通灵';
        if (versus) {
          D.text(ctx, (player ? '2P · ' : '1P · ') + ch.name + ' · ' + info.name + (info.passive ? ' · 每回合' + soulText : ' · ' + (player ? 'F' : '右 Shift') + ' / ' + info.cd + '秒'),
            168, 499 + i * 35, { font: '12px "Microsoft YaHei", sans-serif', fill: info.color });
          if (lore) D.text(ctx, lore.summary, 168, 515 + i * 35, { font: '11px "Microsoft YaHei", sans-serif', fill: '#bdcfd5' });
        } else {
          D.text(ctx, (info.passive ? '被动 · ' : 'Q · ') + info.name + (info.passive ? ' · 每关' + soulText : ' · 冷却' + info.cd + '秒'),
            168, 503, { font: 'bold 13px "Microsoft YaHei", sans-serif', fill: info.color });
          D.text(ctx, info.desc, 168, 524, { font: '12px "Microsoft YaHei", sans-serif', fill: '#bdcfd5' });
          if (lore) D.text(ctx, lore.summary, 168, 545, { font: '11.5px "Microsoft YaHei", sans-serif', fill: '#e8c7ec' });
        }
      });

      // 开始按钮
      var hoverBtn = BI.mouse.inside &&
        BI.input.hitRect((W - BTN.w) / 2, BTN.y, BTN.w, BTN.h);
      var pulse = 1 + Math.sin(st.t * 4) * 0.02;
      ctx.save();
      ctx.translate(W / 2, BTN.y + BTN.h / 2);
      ctx.scale(pulse, pulse);
      D.blob(ctx, -BTN.w / 2, -BTN.h / 2, BTN.w, BTN.h, 16,
        hoverBtn ? '#ffd166' : '#5ec8f0', 'rgba(0,0,0,.35)', 3);
      D.text(ctx, '开始游戏', 0, 2, {
        font: 'bold 24px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: hoverBtn ? '#3a2a10' : '#0f2233'
      });
      ctx.restore();

      // 底部提示
      D.text(ctx, '↑↓ 切换　←→ 选择　Enter 开始',
        W / 2, H - 40, {
          font: '13px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle',
          fill: 'rgba(200,210,240,.6)'
        });

      D.text(ctx, (CFG.VERSION ? CFG.VERSION + '　·　' : '') + '作者：初霁', W / 2, H - 16, {
        font: '12px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: 'rgba(200,210,240,.5)'
      });

    },

    /** 背景装饰：飘动的泡泡 */
    drawBg: function (ctx, st) {
      ctx.save();
      for (var i = 0; i < 14; i++) {
        var seed = i * 97.3;
        var x = (seed * 7.1) % CFG.VIEW_W;
        var speed = 12 + (i % 5) * 6;
        var y = CFG.VIEW_H - ((st.t * speed + seed * 13) % (CFG.VIEW_H + 120)) + 60;
        var r = 10 + (i % 4) * 7;
        var a = 0.05 + (i % 3) * 0.025;
        ctx.globalAlpha = a;
        D.circle(ctx, x, y, r);
        ctx.fillStyle = '#cfe6ff';
        ctx.fill();
        D.circle(ctx, x - r * 0.3, y - r * 0.3, r * 0.28);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.restore();
    },

    /** 画一行 */
    drawRow: function (ctx, st, r) {
      var row = st.rows[r];
      var focused = (r === st.focus);
      var items = menu.itemsOf(st, row);
      var cur = menu.currentIndex(st, r);

      // 行标签
      D.text(ctx, row.label, LABEL_X, row.y + row.h / 2, {
        font: 'bold 15px "Microsoft YaHei", sans-serif',
        baseline: 'middle',
        fill: focused ? '#ffffff' : 'rgba(200,210,240,.45)'
      });
      if (focused) {
        ctx.save();
        ctx.globalAlpha = .8;
        D.blob(ctx, LABEL_X - 8, row.y + row.h / 2 - 12, 4, 24, 2, '#ffd166', null);
        ctx.restore();
      }

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var selected = (i === cur);
        var hovered = st.hover && st.hover.row === r && st.hover.index === i;
        if (row.type === 'mode') menu.drawModeCard(ctx, st, it, i, selected, focused, hovered);
        else menu.drawCharCard(ctx, st, it, row.player, i, selected, focused, hovered);
      }
    },

    drawModeCard: function (ctx, st, it, idx, selected, focused, hovered) {
      var mode = MODES[idx];
      var lift = selected ? Math.sin(st.pulse * 3) * 1.5 : 0;
      var y = it.y + lift;
      // 三张卡时宽度变窄，字号相应收一点，别顶出边框
      var fs = MODES.length >= 3 ? 16.5 : 21;
      var ds = MODES.length >= 3 ? 11.5 : 13;

      ctx.save();
      if (!focused && !selected) ctx.globalAlpha = .62;

      var fill = selected ? mode.color : 'rgba(11,25,38,.46)';
      var edge = selected ? '#ffffff' : 'rgba(255,255,255,.24)';
      D.blob(ctx, it.x, y, it.w, it.h, 14, fill, edge, selected ? 3 : 1.5);

      if (hovered && !selected) {
        D.blob(ctx, it.x, y, it.w, it.h, 14, 'rgba(255,255,255,.10)', null);
      }

      var dark = selected ? '#12233a' : '#eef2ff';
      D.text(ctx, mode.label, it.x + it.w / 2, y + it.h / 2 - 11, {
        font: 'bold ' + fs + 'px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle', fill: dark
      });
      D.text(ctx, mode.desc, it.x + it.w / 2, y + it.h / 2 + 15, {
        font: ds + 'px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: selected ? 'rgba(18,35,58,.75)' : 'rgba(200,210,240,.6)'
      });

      ctx.restore();
    },

    drawCharCard: function (ctx, st, it, playerIdx, idx, selected, focused, hovered) {
      var ch = st.chars[idx];
      var color = playerIdx === 0 ? C.p1 : C.p2;
      var lift = selected ? Math.sin(st.pulse * 3 + playerIdx) * 1.5 : 0;
      var y = it.y + lift;
      var asset = ch.id ? BI.assets.get(ch.id) : null;

      ctx.save();
      if (!focused && !selected) ctx.globalAlpha = .62;

      D.blob(ctx, it.x, y, it.w, it.h, 14,
        selected ? 'rgba(255,255,255,.16)' : 'rgba(11,25,38,.42)',
        selected ? color : 'rgba(255,255,255,.20)',
        selected ? 3 : 1.5);

      if (hovered && !selected) {
        D.blob(ctx, it.x, y, it.w, it.h, 14, 'rgba(255,255,255,.10)', null);
      }

      // 头像
      var av = Math.min(it.w - 16, it.h - 24);
      S.drawAssetFit(ctx, asset, it.x + (it.w - av) / 2, y + 4, av, av - 4,
        playerIdx === 0 ? C.p1 : C.p2);

      // 名字
      D.text(ctx, ch.name, it.x + it.w / 2, y + it.h - 10, {
        font: 'bold 12px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: selected ? color : 'rgba(220,228,255,.72)'
      });

      ctx.restore();
    }
  };

})(window.BI = window.BI || {});
