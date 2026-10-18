/* ============================================================
 * menu.js —— 开始界面：选模式 + 选角色
 *
 * 布局：固定三行（模式 / 1P / 2P）+ 底部技能海报。
 * 视觉：BOMBIT Motion UI —— 奶油纸、墨线、糖果色块、硬阴影、编号标签。
 *
 * 交互与键位保持不变：
 *   方向键在行内/行间移动，Enter 开始，也可以用鼠标点。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw, S = BI.sprites, C = CFG.C, U = BI.ui;

  var MODES = [
    {
      id: 'adventure', inputMode: 'solo', label: '单人 · 闯关打怪',
      desc: '共' + CFG.ADVENTURE_LEVELS + '关 · 第5、10关BOSS战', players: 1,
      color: '#62DF88', soft: '#C9F2B7', abbr: 'ADV', motif: 'maze', no: '01'
    },
    {
      id: 'dig', inputMode: 'solo', label: '单人 · 计时拆砖',
      desc: '限时清除全部障碍', players: 1,
      color: '#5CE1F2', soft: '#C9F3F9', abbr: 'TIME', motif: 'clock', no: '02'
    },
    {
      id: 'versus', inputMode: 'versus', label: '双人 · 同屏对战',
      desc: '先得 2 分者获胜', players: 2,
      color: '#FF5E9E', soft: '#FFD0DE', abbr: 'VS', motif: 'versus', no: '03'
    }
  ];

  var CHAR_UI = {
    xiaonuo: { color: '#FFD23F', accent: '#5CE1F2', role: '时间' },
    axiu:    { color: '#F5233C', accent: '#FFD23F', role: '暗影' },
    arui:    { color: '#62DF88', accent: '#FFD23F', role: '守护' },
    xiaoyan: { color: '#FF5533', accent: '#FFD23F', role: '烈焰' },
    xiaotian:{ color: '#66C8FF', accent: '#FFFDF6', role: '洞察' },
    weilai:  { color: '#FF5E9E', accent: '#5CE1F2', role: '通灵' }
  };

  var ITEMS_X = 90, ITEMS_W = 608;
  var ROW_GAP = 14;
  var MODE_H = 78, CHAR_H = 86;
  var BTN = { w: 360, h: 56, y: 566 };
  var REPLAY_BTN = { x: 558, y: 22, w: 142, h: 38 };

  function itemW(count) { return (ITEMS_W - ROW_GAP * (count - 1)) / count; }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /** 按当前行/列返回某个玩家的主题色，P1 固定青、P2 固定粉 */
  function playerColor(player) { return player ? U.C.pink : U.C.cyan; }

  function charVisual(ch) {
    return CHAR_UI[ch && ch.id] || {
      color: ch && ch.color || U.C.cyan, accent: U.C.yellow, role: '精灵'
    };
  }

  function wrapText(ctx, text, x, y, maxWidth, size, lineHeight, color, maxLines, weight, family) {
    var chars = Array.from(String(text || ''));
    var line = '', row = 0;
    var font = U.font(size, weight || 500, family || U.F.cn);
    ctx.save();
    ctx.font = font;
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        U.text(ctx, line, x, y + row * lineHeight, {
          size: size, weight: weight || 500, family: family || U.F.cn, fill: color
        });
        row++;
        line = chars[i];
        if (maxLines && row >= maxLines - 1) {
          while (i < chars.length - 1 && ctx.measureText(line + '…').width <= maxWidth) {
            i++; line += chars[i];
            if (ctx.measureText(line + '…').width > maxWidth) { line = line.slice(0, -1); break; }
          }
          line += '…';
          break;
        }
      } else {
        line = test;
      }
    }
    if (line) {
      U.text(ctx, line, x, y + row * lineHeight, {
        size: size, weight: weight || 500, family: family || U.F.cn, fill: color
      });
    }
    ctx.restore();
    return row + 1;
  }

  var menu = BI.menu = {

    MODES: MODES,
    REPLAY_BUTTON: REPLAY_BTN,

    create: function () {
      var chars = menu.charList();
      var st = {
        t: 0,
        focus: 0,
        modeIndex: 0,
        charIndex: [0, chars.length > 1 ? 1 : 0],
        chars: chars,
        rows: [],
        info: { x: 20, y: 392, w: 680, h: 164 },
        hover: null,
        pulse: 0
      };
      menu.layout(st);
      return st;
    },

    charList: function () {
      var ids = BI.assets.selectable();
      if (!ids.length) return [{ id: null, name: '占位小人', color: U.C.cyan, accent: U.C.yellow, role: '精灵' }];
      return ids.map(function (id) {
        var a = BI.assets.get(id);
        var v = CHAR_UI[id] || { color: U.C.cyan, accent: U.C.yellow, role: '精灵' };
        return {
          id: id,
          name: (a && a.name) || id,
          color: v.color,
          accent: v.accent,
          role: v.role
        };
      });
    },

    /**
     * 固定骨架：模式行永远在 y=190，选角从 y=290 开始。
     * 这样切换单人/双人时标题和模式卡不会上下跳，视线有稳定锚点。
     */
    layout: function (st) {
      var versus = MODES[st.modeIndex].players === 2;
      var rows = [
        { type: 'mode', h: MODE_H, label: '模式', no: '01', y: 190 }
      ];
      rows.push({ type: 'char', player: 0, h: CHAR_H, label: '1P 精灵', no: '02', y: 290 });
      if (versus) rows.push({ type: 'char', player: 1, h: CHAR_H, label: '2P 精灵', no: '03', y: 390 });

      st.rows = rows;
      st.versus = versus;
      st.info = versus
        ? { x: 20, y: 490, w: 680, h: 66 }
        : { x: 20, y: 392, w: 680, h: 164 };
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
      if (moved) BI.sfx.play('menuMove');

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
        var w = (ITEMS_W - 20) / MODES.length;
        for (var i = 0; i < MODES.length; i++) {
          out.push({ x: ITEMS_X + i * (w + 10), y: row.y, w: w, h: row.h });
        }
      } else {
        var n = st.chars.length;
        var gap = n > 5 ? 6 : 14;
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
      } else {
        st.charIndex[row.player] = idx;
      }
    },

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
      menu.drawBackground(ctx, st);
      menu.drawHeader(ctx, st);
      menu.drawReplay(ctx, st);
      for (var r = 0; r < st.rows.length; r++) menu.drawRow(ctx, st, r);
      menu.drawInfo(ctx, st);
      menu.drawStart(ctx, st);
      menu.drawFooter(ctx, st);
    },

    drawBackground: function (ctx, st) {
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      ctx.fillStyle = U.C.paper;
      ctx.fillRect(0, 0, W, H);
      // 壁纸作为极淡的全屏底纹保留世界观；信息层靠奶油纸和墨线压住。
      var wp = BI.assets && BI.assets.wallpaper;
      if (wp && wp.ok && wp.canvas) {
        ctx.save();
        ctx.globalAlpha = .07;
        ctx.drawImage(wp.canvas, 0, 0, W, H);
        ctx.restore();
      }
      U.dots(ctx, 0, 0, W, H, U.C.ink, .07, 16);

      // 纸张边缘的印刷色条
      var bars = [U.C.orange, U.C.cyan, U.C.yellow, U.C.pink, U.C.green, U.C.ink];
      for (var i = 0; i < bars.length; i++) {
        ctx.fillStyle = bars[i];
        ctx.fillRect(0, i * (H / bars.length), 4, H / bars.length);
        ctx.fillRect(W - 4, H - (i + 1) * (H / bars.length), 4, H / bars.length);
      }

      // 背景幽灵字
      U.text(ctx, 'BOMBIT', W / 2, 438, {
        size: 112, weight: 900, family: U.F.impact, fill: 'rgba(20,16,25,0)',
        stroke: 'rgba(20,16,25,.055)', strokeWidth: 2, align: 'center'
      });

      // 太阳 + 炸弹母题
      U.sun(ctx, 606, 112, 89, U.C.orange, st.t * .025);
      U.bomb(ctx, 610, 111, 31, { rot: -.12 });

      // 漂浮小星星
      var stars = [
        [512, 48, 7, U.C.yellow, 0.2],
        [690, 172, 5, U.C.cream, 0.6],
        [490, 180, 4, U.C.pink, 0.8],
        [268, 164, 3, U.C.cyan, 1.2]
      ];
      for (var s = 0; s < stars.length; s++) {
        var o = stars[s];
        var bob = Math.sin(st.t * 2.2 + o[4] * 4) * 4;
        U.star(ctx, o[0], o[1] + bob, o[2], o[2] * .45, o[3], 5, st.t * .4);
      }

      // 细斜线装饰
      ctx.save();
      ctx.strokeStyle = 'rgba(20,16,25,.12)';
      ctx.lineWidth = 1;
      for (var l = 0; l < 5; l++) {
        ctx.beginPath();
        ctx.moveTo(440 + l * 64, 0);
        ctx.lineTo(300 + l * 64, 210);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawHeader: function (ctx, st) {
      var W = CFG.VIEW_W;
      // 黑色报头
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(0, 0, W, 18);
      U.text(ctx, 'BOMBIT®  /  Q-BAN BUBBLE HALL', 13, 9, {
        size: 6.5, family: U.F.mono, weight: 700, fill: U.C.cream, alpha: .82
      });
      U.text(ctx, 'MOTION UI  /  2026', W - 13, 9, {
        size: 6.5, family: U.F.mono, weight: 700, fill: U.C.cream, alpha: .55, align: 'right'
      });

      // kicker
      ctx.fillStyle = U.C.orange;
      ctx.fillRect(26, 35, 7, 7);
      U.text(ctx, 'GAME MOTION ID / 006', 40, 39, {
        size: 7, family: U.F.mono, weight: 700, fill: U.C.ink, alpha: .64
      });

      // Q版 标签 + 中文大标题
      U.tag(ctx, 'Q版', 26, 61, {
        size: 10, weight: 900, family: U.F.cn, fill: U.C.ink, fg: U.C.cream,
        padX: 7, h: 18, align: 'left', rot: -.035, stroke: null,
        shadow: U.C.orange, shadowX: 3, shadowY: 3
      });
      U.text(ctx, '泡泡堂', 24, 105, {
        size: 56, weight: 900, family: U.F.cn, fill: U.C.ink,
        shadow: U.C.orange, shadowX: 4, shadowY: 4
      });
      U.text(ctx, 'BOMBIT', 26, 151, {
        size: 44, weight: 900, family: U.F.impact, fill: U.C.orange,
        stroke: U.C.ink, strokeWidth: 1.7, shadow: U.C.ink, shadowX: 3, shadowY: 3
      });

      // 标题右侧的信息带
      U.text(ctx, '精灵冒险  ×  同屏对战', 268, 85, {
        size: 10, weight: 700, family: U.F.cn, fill: U.C.ink
      });
      U.text(ctx, '6 SPIRITS  /  3 MODES  /  1 FUSE', 268, 101, {
        size: 7, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .62
      });
      var scenes = [['晨露森林', U.C.green], ['星汽工厂', U.C.cyan], ['星糖游乐园', U.C.pink]];
      var sx = 268;
      for (var i = 0; i < scenes.length; i++) {
        ctx.fillStyle = scenes[i][1];
        ctx.fillRect(sx, 119, 4, 4);
        U.text(ctx, scenes[i][0], sx + 8, 122, {
          size: 7.5, weight: 500, family: U.F.cn, fill: U.C.ink, alpha: .78
        });
        sx += U.measure(ctx, scenes[i][0], 7.5, 500, U.F.cn) + 20;
      }
      U.text(ctx, 'SELECT MODE & SPIRIT  /  ↑↓  →', 268, 141, {
        size: 6.5, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .48
      });

      // 标题下方细线
      ctx.save();
      ctx.strokeStyle = 'rgba(20,16,25,.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(26, 175);
      ctx.lineTo(694, 175);
      ctx.stroke();
      ctx.restore();
    },

    drawReplay: function (ctx, st) {
      var r = REPLAY_BTN;
      var hover = BI.mouse.inside && BI.input.hitRect(r.x, r.y, r.w, r.h);
      U.panel(ctx, r.x, r.y, r.w, r.h, {
        fill: hover ? U.C.ink : U.C.cream,
        stroke: U.C.ink, lw: 2, r: 3,
        shadow: hover ? U.C.orange : U.C.ink, shadowX: 3, shadowY: 3
      });
      U.text(ctx, '↗', r.x + 13, r.y + r.h / 2, {
        size: 13, weight: 900, family: U.F.mono, fill: hover ? U.C.yellow : U.C.orange
      });
      U.text(ctx, '对局回放', r.x + 30, r.y + r.h / 2 - 1, {
        size: 9.5, weight: 700, family: U.F.cn, fill: hover ? U.C.cream : U.C.ink
      });
      U.text(ctx, 'REPLAY', r.x + r.w - 12, r.y + r.h / 2 + 1, {
        size: 5.5, weight: 700, family: U.F.mono, fill: hover ? U.C.cyan : U.C.ink, alpha: .65, align: 'right'
      });
    },

    drawFooter: function (ctx, st) {
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      U.text(ctx, '↑↓ 切换    ←→ 选择    ENTER 开始', W / 2, H - 39, {
        size: 9, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .58, align: 'center'
      });
      U.text(ctx, (CFG.VERSION ? CFG.VERSION + '　·　作者：初霁' : '作者：初霁'), W / 2, H - 17, {
        size: 7.2, weight: 500, family: U.F.cn, fill: U.C.ink, alpha: .45, align: 'center'
      });
      // 右下角条码
      ctx.save();
      ctx.fillStyle = 'rgba(20,16,25,.55)';
      for (var i = 0; i < 22; i++) {
        var bw = (i % 4 === 0) ? 2 : 1;
        ctx.fillRect(634 + i * 3, H - 23, bw, 11);
      }
      ctx.restore();
    },

    /* ---------- 行 / 卡片 ---------- */
    drawRow: function (ctx, st, r) {
      var row = st.rows[r];
      var focused = (r === st.focus);
      var items = menu.itemsOf(st, row);
      var cur = menu.currentIndex(st, r);

      // 左侧黑色行标签
      var lx = 20, lw = 56, ly = row.y, lh = row.h;
      U.panel(ctx, lx, ly, lw, lh, {
        fill: focused ? U.C.ink : 'rgba(20,16,25,.56)',
        stroke: U.C.ink, lw: 1.5, r: 3,
        shadow: focused ? U.C.orange : null, shadowX: 3, shadowY: 3
      });
      if (focused) {
        ctx.fillStyle = U.C.orange;
        ctx.fillRect(lx, ly, lw, 4);
      }
      U.text(ctx, row.no, lx + lw / 2, ly + 25, {
        size: 22, weight: 900, family: U.F.impact, fill: focused ? U.C.yellow : U.C.cream,
        align: 'center'
      });
      U.text(ctx, row.type === 'mode' ? '模式' : (row.player === 0 ? '1P' : '2P'), lx + lw / 2, ly + 49, {
        size: 9, weight: 700, family: U.F.cn, fill: U.C.cream, align: 'center'
      });
      U.text(ctx, row.type === 'mode' ? 'MODE' : 'SPIRIT', lx + lw / 2, ly + 64, {
        size: 5.5, weight: 700, family: U.F.mono, fill: U.C.cyan, align: 'center', alpha: .9
      });

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
      var lift = (selected ? Math.sin(st.pulse * 3) * 1.1 : 0) + (hovered && !selected ? -1 : 0);
      var x = it.x, y = it.y + lift, w = it.w, h = it.h;
      var dim = (!focused && !selected) ? .8 : 1;
      ctx.save();
      ctx.globalAlpha = dim;

      if (selected) {
        U.panel(ctx, x, y, w, h, {
          fill: U.C.ink, stroke: U.C.ink, lw: 2.5, r: 4,
          shadow: mode.color, shadowX: 5, shadowY: 5
        });
        ctx.fillStyle = mode.color;
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = mode.color;
        ctx.fillRect(x + w - 6, y, 6, h - 5);
        U.tag(ctx, 'ON', x + w - 10, y + 17, {
          size: 6, family: U.F.mono, fill: U.C.yellow, fg: U.C.ink,
          padX: 4, h: 12, align: 'right', rot: .02, stroke: U.C.ink, lw: 1
        });
        U.text(ctx, mode.no, x + 12, y + 27, {
          size: 24, weight: 900, family: U.F.impact, fill: mode.color
        });
        U.text(ctx, mode.label, x + 12, y + 48, {
          size: 15, weight: 900, family: U.F.cn, fill: U.C.cream
        });
        U.text(ctx, mode.desc, x + 12, y + 65, {
          size: 8.2, weight: 500, family: U.F.cn, fill: hexA(U.C.cream, .74)
        });
        U.text(ctx, mode.abbr, x + 42, y + 27, {
          size: 6, weight: 700, family: U.F.mono, fill: hexA(U.C.cream, .42)
        });
      } else {
        U.panel(ctx, x, y, w, h, {
          fill: mode.soft, stroke: U.C.ink, lw: 1.7, r: 4,
          shadow: U.C.ink, shadowX: 3, shadowY: 3
        });
        ctx.fillStyle = mode.color;
        ctx.fillRect(x, y, w, 5);
        U.text(ctx, mode.no, x + 12, y + 27, {
          size: 24, weight: 900, family: U.F.impact, fill: U.C.ink, alpha: .3
        });
        U.text(ctx, mode.label, x + 12, y + 48, {
          size: 15, weight: 900, family: U.F.cn, fill: U.C.ink
        });
        U.text(ctx, mode.desc, x + 12, y + 65, {
          size: 8.2, weight: 500, family: U.F.cn, fill: hexA(U.C.ink, .7)
        });
        U.text(ctx, mode.abbr, x + 42, y + 27, {
          size: 6, weight: 700, family: U.F.mono, fill: hexA(U.C.ink, .42)
        });
        if (hovered) {
          U.panel(ctx, x, y, w, h, {
            fill: 'rgba(255,253,246,.16)', stroke: null, r: 4
          });
        }
      }

      // 模式图标简笔
      menu.drawModeIcon(ctx, mode.motif, x + w - 27, y + 53, mode.color, selected);
      ctx.restore();
    },

    drawModeIcon: function (ctx, motif, x, y, color, dark) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = dark ? color : U.C.ink;
      ctx.fillStyle = dark ? color : U.C.ink;
      ctx.lineWidth = 1.5;
      if (motif === 'clock') {
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 0); ctx.lineTo(4, 2); ctx.stroke();
      } else if (motif === 'versus') {
        U.star(ctx, 0, 0, 9, 4, dark ? color : U.C.ink, 4, 0);
        ctx.strokeStyle = dark ? U.C.ink : U.C.cream;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.stroke();
      } else {
        ctx.fillRect(-9, -7, 6, 6);
        ctx.fillRect(1, -7, 6, 6);
        ctx.fillRect(-4, 3, 6, 6);
      }
      ctx.restore();
    },

    drawCharCard: function (ctx, st, it, playerIdx, idx, selected, focused, hovered) {
      var ch = st.chars[idx];
      var v = charVisual(ch);
      var pcolor = playerColor(playerIdx);
      var asset = ch.id ? BI.assets.get(ch.id) : null;
      var lift = (selected ? Math.sin(st.pulse * 3 + playerIdx) * 1.2 : 0) + (hovered ? -1 : 0);
      var x = it.x, y = it.y + lift, w = it.w, h = it.h;
      var dim = (!focused && !selected) ? .84 : 1;

      ctx.save();
      ctx.globalAlpha = dim;

      if (selected) {
        U.panel(ctx, x, y, w, h, {
          fill: v.color, stroke: U.C.ink, lw: 3, r: 4,
          shadow: pcolor, shadowX: 4, shadowY: 4
        });
        // 奶油色内框，隔离角色和底色
        U.panel(ctx, x + 4, y + 4, w - 8, h - 26, {
          fill: U.C.cream, stroke: U.C.ink, lw: 1, r: 2
        });
        U.tag(ctx, playerIdx ? '2P' : '1P', x + 4, y + 4, {
          size: 6, family: U.F.mono, fill: pcolor, fg: U.C.ink,
          padX: 4, h: 12, align: 'left', stroke: U.C.ink, lw: 1
        });
        U.star(ctx, x + w - 10, y + 11, 4, 1.8, U.C.yellow, 5, .2);
      } else {
        U.panel(ctx, x, y, w, h, {
          fill: U.C.cream, stroke: U.C.ink, lw: 1.5, r: 4,
          shadow: 'rgba(20,16,25,.16)', shadowX: 2, shadowY: 2
        });
        ctx.fillStyle = v.color;
        ctx.fillRect(x, y, w, 4);
      }

      // 头像 / 头部裁切
      var portraitH = h - 28;
      U.head(ctx, asset, x + 4, y + (selected ? 4 : 5), w - 8, portraitH, v.color);

      // 底部名字条
      var stripY = y + h - 22;
      ctx.fillStyle = selected ? U.C.ink : U.C.ink;
      ctx.fillRect(x + 2, stripY, w - 4, 20);
      U.text(ctx, ch.name || '？', x + 7, stripY + 10, {
        size: 10, weight: 900, family: U.F.cn,
        fill: selected ? U.C.cream : U.C.cream
      });
      U.text(ctx, pad2(idx + 1), x + w - 7, stripY + 10, {
        size: 6, weight: 700, family: U.F.mono,
        fill: selected ? pcolor : hexA(U.C.cream, .58), align: 'right'
      });

      // 选中角色也标出角色主题色
      if (selected) {
        ctx.fillStyle = pcolor;
        ctx.fillRect(x + 4, y + h - 4, w - 8, 3);
      }

      ctx.restore();
    },

    /* ---------- 技能 / 背景海报 ---------- */
    drawInfo: function (ctx, st) {
      if (st.versus) menu.drawVersusInfo(ctx, st);
      else menu.drawSoloInfo(ctx, st);
    },

    drawSoloInfo: function (ctx, st) {
      var infoRect = st.info;
      var ch = st.chars[st.charIndex[0]];
      if (!ch) return;
      var v = charVisual(ch);
      var data = BI.SKILLS[ch.id] || BI.SKILLS.xiaonuo;
      var lore = BI.CHARACTER_LORE[ch.id];
      var x = infoRect.x, y = infoRect.y, w = infoRect.w, h = infoRect.h;
      var pcolor = U.C.cyan;
      var asset = ch.id ? BI.assets.get(ch.id) : null;

      U.panel(ctx, x, y, w, h, {
        fill: U.C.ink, stroke: U.C.ink, lw: 2, r: 4,
        shadow: U.C.orange, shadowX: 4, shadowY: 4
      });
      U.dots(ctx, x, y, w, h, U.C.cream, .06, 12);
      ctx.fillStyle = v.color;
      ctx.fillRect(x, y, 7, h);

      // 大号幽灵角色名
      U.text(ctx, ch.name || '', x + w - 24, y + 46, {
        size: 86, weight: 900, family: U.F.cn, fill: 'rgba(245,235,216,0)',
        stroke: 'rgba(245,235,216,.075)', strokeWidth: 1.5, align: 'right'
      });

      // 角色头像
      var px = x + 22, py = y + 24, pw = 88, ph = 94;
      U.panel(ctx, px, py, pw, ph, {
        fill: U.C.cream, stroke: U.C.ink, lw: 2, r: 3,
        shadow: pcolor, shadowX: 4, shadowY: 4
      });
      U.head(ctx, asset, px + 4, py + 3, pw - 8, ph - 6, v.color);
      U.tag(ctx, '1P', px + 4, py + 4, {
        size: 6, family: U.F.mono, fill: pcolor, fg: U.C.ink,
        padX: 4, h: 12, align: 'left', stroke: U.C.ink, lw: 1
      });

      // 左侧编号 / 角色类型
      U.text(ctx, pad2(st.charIndex[0] + 1) + ' / 06', x + 22, y + 138, {
        size: 7, weight: 700, family: U.F.mono, fill: hexA(U.C.cream, .48)
      });
      ctx.fillStyle = pcolor;
      ctx.fillRect(x + 71, y + 134, 16, 2);

      // 右侧技能信息
      var tx = x + 128;
      U.text(ctx, 'SELECTED SPIRIT  /  ' + (v.role || '精灵'), tx, y + 26, {
        size: 7, weight: 700, family: U.F.mono, fill: v.accent
      });
      U.text(ctx, ch.name || '', tx, y + 52, {
        size: 19, weight: 900, family: U.F.cn, fill: U.C.cream
      });
      U.text(ctx, (data.passive ? '被动 · ' : '') + data.name, tx, y + 78, {
        size: 17, weight: 900, family: U.F.cn, fill: v.accent
      });
      wrapText(ctx, data.desc, tx, y + 99, w - 260, 9.5, 12.5, hexA(U.C.cream, .84), 2, 500, U.F.cn);
      if (data.passive) {
        U.text(ctx, '放弹' + data.bombsToEvolve + '次或击杀通灵', tx, y + 123, {
          size: 7.6, weight: 700, family: U.F.cn, fill: hexA(U.C.cream, .64)
        });
      }
      if (lore) {
        U.text(ctx, 'LORE', tx, y + 138, {
          size: 6, weight: 700, family: U.F.mono, fill: v.color, alpha: .85
        });
        wrapText(ctx, lore.summary, tx + 33, y + 138, w - 290, 8.4, 11, hexA(U.C.cream, .55), 1, 500, U.F.cn);
      }

      // 按键 / 冷却
      var kx = x + w - 82, ky = y + 22;
      var keyText = data.passive ? '被动' : 'Q';
      U.panel(ctx, kx, ky, 60, 25, {
        fill: v.accent, stroke: U.C.ink, lw: 1.5, r: 2,
        shadow: U.C.ink, shadowX: 2, shadowY: 2
      });
      U.text(ctx, keyText, kx + 30, ky + 13, {
        size: 9, weight: 900, family: U.F.cn, fill: U.C.ink, align: 'center'
      });
      U.text(ctx, data.passive ? '6 格通灵' : '冷却' + data.cd + '秒', kx + 60, ky + 39, {
        size: 7, weight: 700, family: U.F.mono, fill: hexA(U.C.cream, .55), align: 'right'
      });

      // 右下角角色主题标签
      U.tag(ctx, (v.role || '精灵') + '系', x + w - 22, y + h - 20, {
        size: 7, family: U.F.cn, fill: U.C.cream, fg: U.C.ink,
        padX: 6, h: 16, align: 'right', stroke: U.C.ink, lw: 1
      });
    },

    drawVersusInfo: function (ctx, st) {
      var infoRect = st.info;
      var x = infoRect.x, y = infoRect.y, w = infoRect.w, h = infoRect.h;
      U.panel(ctx, x, y, w, h, {
        fill: U.C.ink, stroke: U.C.ink, lw: 2, r: 4,
        shadow: U.C.orange, shadowX: 5, shadowY: 5
      });
      U.dots(ctx, x, y, w, h, U.C.cream, .055, 12);

      for (var i = 0; i < 2; i++) {
        var ch = st.chars[st.charIndex[i]];
        if (!ch) continue;
        var v = charVisual(ch);
        var data = BI.SKILLS[ch.id] || BI.SKILLS.xiaonuo;
        var pcolor = playerColor(i);
        var cx = x + 14 + i * (w / 2);
        var colW = w / 2 - 26;
        U.tag(ctx, i ? '2P' : '1P', cx, y + 14, {
          size: 6, family: U.F.mono, fill: pcolor, fg: U.C.ink,
          padX: 4, h: 12, align: 'left', stroke: U.C.ink, lw: 1
        });
        U.text(ctx, ch.name || '', cx + 34, y + 14, {
          size: 10, weight: 900, family: U.F.cn, fill: pcolor
        });
        U.text(ctx, '· ' + data.name, cx + 34 + 27, y + 14, {
          size: 9, weight: 700, family: U.F.cn, fill: U.C.cream
        });
        U.text(ctx, data.passive ? '被动' : (i ? 'F' : '右Shift'), cx + colW, y + 14, {
          size: 6.5, weight: 700, family: U.F.mono, fill: hexA(U.C.cream, .45), align: 'right'
        });
        wrapText(ctx, data.desc, cx + 34, y + 31, colW - 34, 7.2, 9, hexA(U.C.cream, .68), 2, 500, U.F.cn);
        U.text(ctx, data.passive ? '6 格通灵' : '冷却' + data.cd + 's', cx + colW, y + 52, {
          size: 6, weight: 700, family: U.F.mono, fill: v.accent, align: 'right'
        });
        if (i === 0) {
          ctx.strokeStyle = 'rgba(245,235,216,.16)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + w / 2, y + 10);
          ctx.lineTo(x + w / 2, y + h - 10);
          ctx.stroke();
        }
      }
    },

    drawStart: function (ctx, st) {
      var W = CFG.VIEW_W;
      var x = (W - BTN.w) / 2;
      var hover = BI.mouse.inside && BI.input.hitRect(x, BTN.y, BTN.w, BTN.h);
      var lift = Math.sin(st.t * 3) * 1.2 + (hover ? -2 : 0);
      var y = BTN.y + lift;
      U.panel(ctx, x, y, BTN.w, BTN.h, {
        fill: hover ? U.C.orange : U.C.yellow,
        stroke: U.C.ink, lw: 2.5, r: 4,
        shadow: U.C.ink, shadowX: 5, shadowY: 5
      });
      U.play(ctx, x + 30, y + BTN.h / 2, 13, U.C.ink);
      U.text(ctx, '开始游戏', x + 48, y + BTN.h / 2, {
        size: 22, weight: 900, family: U.F.cn, fill: U.C.ink
      });
      U.text(ctx, 'START', x + 145, y + BTN.h / 2 + 1, {
        size: 6.5, weight: 700, family: U.F.mono, fill: hexA(U.C.ink, .5)
      });
      U.keycap(ctx, 'ENTER', x + BTN.w - 80, y + 18, 56, 20, U.C.ink, U.C.cream);
      ctx.save();
      ctx.globalAlpha = .22;
      U.text(ctx, '06  /  03  /  01', x + BTN.w - 20, y + 47, {
        size: 5.5, weight: 700, family: U.F.mono, fill: U.C.ink, align: 'right'
      });
      ctx.restore();
    }
  };

})(window.BI = window.BI || {});
