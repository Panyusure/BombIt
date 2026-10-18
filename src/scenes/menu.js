/* ============================================================
 * menu.js —— 两层开始菜单
 *
 * STEP 01  选择模式：三张大幅模式卡
 * STEP 02  选择精灵：左侧小卡网格，右侧大幅动效海报
 *
 * 单人：选完精灵 → 开始游戏
 * 双人：1P 确认 → 切到 2P → 确认 → 开始对战
 *
 * 视觉：BOMBIT Motion UI —— 奶油纸、墨线、糖果色、硬阴影、
 *       印刷编号、半调网点、微旋转贴纸。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw, S = BI.sprites, C = CFG.C, U = BI.ui;

  var MODES = [
    {
      id: 'adventure', inputMode: 'solo', label: '单人 · 闯关打怪',
      desc: '共' + CFG.ADVENTURE_LEVELS + '关 · 第5、10关BOSS战', players: 1,
      color: '#62DF88', soft: '#C9F2B7', abbr: 'ADV', motif: 'maze', no: '01',
      tagline: '十关清场 · 鲁鲁旦三阶段'
    },
    {
      id: 'dig', inputMode: 'solo', label: '单人 · 计时拆砖',
      desc: '限时清除全部障碍', players: 1,
      color: '#5CE1F2', soft: '#C9F3F9', abbr: 'TIME', motif: 'clock', no: '02',
      tagline: '倒计时 · 全图障碍'
    },
    {
      id: 'versus', inputMode: 'versus', label: '双人 · 同屏对战',
      desc: '先得 2 分者获胜', players: 2,
      color: '#FF5E9E', soft: '#FFD0DE', abbr: 'VS', motif: 'versus', no: '03',
      tagline: '同屏双打 · 先到 2 分'
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

  /* 固定骨架 */
  var BTN = { w: 360, h: 56, y: 566 };
  var REPLAY_BTN = { x: 544, y: 22, w: 118, h: 38 };
  var SETTINGS_BTN = { x: 670, y: 24, w: 32, h: 34 };
  var BACK_BTN = { x: 20, y: 566, w: 136, h: 56 };
  var MODE_CARD = { x: 20, y: 226, w: 218, h: 314, gap: 13 };
  var GRID = { x: 20, y: 450, w: 106, h: 80, gapX: 8, gapY: 0, cols: 6 };
  var POSTER = { x: 20, y: 128, w: 680, h: 310 };
  var SETTINGS_CARD = { x: 150, y: 170, w: 420, h: 360 };
  var SETTINGS_SLIDER = { x: 178, y: 306, w: 364, h: 8, gap: 72 };

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function playerColor(player) { return player ? U.C.pink : U.C.cyan; }
  function charVisual(ch) {
    return CHAR_UI[ch && ch.id] || {
      color: ch && ch.color || U.C.cyan, accent: U.C.yellow, role: '精灵'
    };
  }

  function charRects() {
    var out = [];
    for (var i = 0; i < 6; i++) {
      out.push({
        x: GRID.x + i * (GRID.w + GRID.gapX),
        y: GRID.y,
        w: GRID.w, h: GRID.h
      });
    }
    return out;
  }

  function modeRects() {
    var out = [];
    for (var i = 0; i < MODES.length; i++) {
      out.push({
        x: MODE_CARD.x + i * (MODE_CARD.w + MODE_CARD.gap),
        y: MODE_CARD.y, w: MODE_CARD.w, h: MODE_CARD.h
      });
    }
    return out;
  }

  function tabRects(st) {
    if (MODES[st.modeIndex].players === 1) {
      return [{ x: 20, y: 96, w: 154, h: 24, player: 0 }];
    }
    return [
      { x: 20, y: 96, w: 140, h: 24, player: 0 },
      { x: 166, y: 96, w: 140, h: 24, player: 1 }
    ];
  }

  /** 将整张精灵图按底部居中等比装进海报 */
  function drawFullSprite(ctx, asset, cx, bottom, maxW, maxH, fallbackColor) {
    if (asset && asset.sprite) {
      var img = asset.sprite;
      var iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
      if (iw && ih) {
        var s = Math.min(maxW / iw, maxH / ih);
        var dw = iw * s, dh = ih * s;
        ctx.drawImage(img, cx - dw / 2, bottom - dh, dw, dh);
        return true;
      }
    }
    if (asset && asset.img && asset.img.complete && asset.img.naturalWidth) {
      var iw2 = asset.img.naturalWidth, ih2 = asset.img.naturalHeight;
      var crop = asset.crop || [0, 0, iw2, ih2];
      var s2 = Math.min(maxW / crop[2], maxH / crop[3]);
      var dw2 = crop[2] * s2, dh2 = crop[3] * s2;
      ctx.drawImage(asset.img, crop[0], crop[1], crop[2], crop[3],
        cx - dw2 / 2, bottom - dh2, dw2, dh2);
      return true;
    }
    // 占位：一个戴头巾的小剪影，素材加载完自动替换
    var h = Math.min(maxH, 220), w = h * .72;
    ctx.save();
    ctx.fillStyle = fallbackColor || U.C.cyan;
    ctx.beginPath();
    ctx.ellipse(cx, bottom - h * .45, w * .38, h * .42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = U.C.cream;
    ctx.beginPath();
    ctx.arc(cx, bottom - h * .62, w * .2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = U.C.ink;
    ctx.beginPath();
    ctx.arc(cx - w * .07, bottom - h * .64, 2.2, 0, Math.PI * 2);
    ctx.arc(cx + w * .07, bottom - h * .64, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return false;
  }

  /**
   * 中文换行。maxLines 到达后截断补省略号，避免 Canvas 文本压出卡片。
   */
  function wrapText(ctx, text, x, y, maxWidth, size, lineHeight, color, maxLines, weight, family) {
    var chars = Array.from(String(text || ''));
    var lines = [], line = '';
    ctx.save();
    ctx.font = U.font(size, weight || 500, family || U.F.cn);
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = chars[i];
        if (maxLines && lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (line && (!maxLines || lines.length < maxLines)) lines.push(line);
    if (maxLines && lines.length > maxLines) lines.length = maxLines;
    if (maxLines && lines.length === maxLines) {
      var last = lines[lines.length - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      if (Array.from(String(text)).length > lines.join('').length) lines[lines.length - 1] = last + '…';
    }
    for (var l = 0; l < lines.length; l++) {
      U.text(ctx, lines[l], x, y + l * lineHeight, {
        size: size, weight: weight || 500, family: family || U.F.cn, fill: color
      });
    }
    ctx.restore();
    return lines.length;
  }

  var menu = BI.menu = {

    MODES: MODES,
    REPLAY_BUTTON: REPLAY_BTN,
    SETTINGS_BUTTON: SETTINGS_BTN,
    SETTINGS_CARD: SETTINGS_CARD,
    BACK_BUTTON: BACK_BTN,
    BUTTON: BTN,
    GRID: GRID,
    POSTER: POSTER,

    create: function () {
      var chars = menu.charList();
      var st = {
        t: 0,
        pulse: 0,
        step: 'mode',
        modeIndex: 0,
        player: 0,
        focus: 0,
        charIndex: [0, chars.length > 1 ? 1 : 0],
        chars: chars,
        rows: [],
        cards: [],
        tabs: [],
        hover: null,
        stepT: 1,
        switchT: 1,
        settings: {
          open: false,
          drag: null,
          sfx: 1,
          music: 1
        }
      };
      menu.layout(st);
      menu.loadAudioSettings(st);
      return st;
    },

    charList: function () {
      var ids = BI.assets.selectable();
      if (!ids.length) return [{ id: null, name: '占位小人', color: U.C.cyan, accent: U.C.yellow, role: '精灵' }];
      return ids.map(function (id) {
        var a = BI.assets.get(id);
        var v = CHAR_UI[id] || { color: U.C.cyan, accent: U.C.yellow, role: '精灵' };
        return { id: id, name: (a && a.name) || id, color: v.color, accent: v.accent, role: v.role };
      });
    },

    /* ============================================================
     * 状态 / 布局
     * ============================================================ */
    layout: function (st) {
      var mode = MODES[st.modeIndex] || MODES[0];
      st.playerCount = mode.players;
      st.versus = mode.players === 2;
      st.cards = st.step === 'mode' ? modeRects() : charRects();
      st.tabs = st.step === 'mode' ? [] : tabRects(st);
      st.rows = st.step === 'mode'
        ? [{ type: 'mode', y: MODE_CARD.y, h: MODE_CARD.h, label: '模式' }]
        : [{ type: 'char', player: st.player, y: GRID.y, h: GRID.h, label: st.player ? '2P 精灵' : '1P 精灵' }];
      st.focus = clamp(st.focus || 0, 0, st.cards.length - 1);
      if (st.step === 'chars') st.player = clamp(st.player || 0, 0, st.playerCount - 1);
    },

    openMode: function (st) {
      st.step = 'mode';
      st.player = 0;
      st.focus = st.modeIndex;
      st.stepT = 0;
      st.switchT = 0;
      st.hover = null;
      st.settings.open = false;
      st.settings.drag = null;
      menu.layout(st);
    },

    openCharacter: function (st, modeIndex) {
      if (modeIndex != null) st.modeIndex = clamp(modeIndex, 0, MODES.length - 1);
      st.step = 'chars';
      st.player = 0;
      st.focus = st.charIndex[0];
      st.stepT = 0;
      st.switchT = 0;
      st.hover = null;
      st.settings.open = false;
      st.settings.drag = null;
      menu.ensureDistinct(st);
      menu.layout(st);
    },

    ensureDistinct: function (st) {
      if (MODES[st.modeIndex].players !== 2 || st.chars.length < 2) return;
      if (st.charIndex[0] !== st.charIndex[1]) return;
      var next = (st.charIndex[1] + 1) % st.chars.length;
      st.charIndex[1] = next;
      if (st.player === 1) st.focus = next;
    },

    selectPlayer: function (st, player) {
      if (st.step !== 'chars' || MODES[st.modeIndex].players !== 2) return;
      st.player = clamp(player, 0, 1);
      st.focus = st.charIndex[st.player];
      st.switchT = 0;
      st.hover = null;
      menu.layout(st);
      BI.sfx.play('menuMove');
    },

    /** 兼容旧测试：当前步骤的可点击项 */
    itemsOf: function (st, row) {
      if (!row) return [];
      if (row.type === 'mode') return menu.modeRects ? menu.modeRects() : modeRects();
      if (row.type === 'char') return charRects();
      return [];
    },

    currentIndex: function (st, rowIdx) {
      var row = st.rows[rowIdx];
      if (!row) return 0;
      return row.type === 'mode' ? st.modeIndex : st.charIndex[st.player];
    },

    setIndex: function (st, rowIdx, idx) {
      var row = st.rows[rowIdx];
      if (!row) return;
      if (row.type === 'mode') {
        st.modeIndex = clamp(idx, 0, MODES.length - 1);
        st.focus = st.modeIndex;
        menu.layout(st);
        st.hover = null;
      } else {
        idx = clamp(idx, 0, st.chars.length - 1);
        st.charIndex[st.player] = idx;
        st.focus = idx;
        st.switchT = 0;
      }
    },

    confirm: function (st) {
      var mode = MODES[st.modeIndex];
      var c1 = st.chars[st.charIndex[0]];
      var c2 = st.chars[st.charIndex[1]];
      if (mode.players === 2 && st.chars.length > 1 && st.charIndex[0] === st.charIndex[1]) {
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

    confirmChar: function (st) {
      if (st.step === 'mode') { menu.openCharacter(st); return null; }
      var mode = MODES[st.modeIndex];
      if (mode.players === 2 && st.player === 0) {
        if (st.chars.length > 1 && st.charIndex[0] === st.charIndex[1]) {
          st.charIndex[1] = (st.charIndex[0] + 1) % st.chars.length;
        }
        st.player = 1;
        st.focus = st.charIndex[1];
        st.switchT = 0;
        st.stepT = 0;
        BI.sfx.play('menuConfirm');
        menu.layout(st);
        return null;
      }
      return menu.confirm(st);
    },

    /* ============================================================
     * 设置 / 音量
     * ============================================================ */
    sliderRects: function (st) {
      var s = st.settings || {};
      return {
        sfx: { x: SETTINGS_SLIDER.x, y: SETTINGS_SLIDER.y, w: SETTINGS_SLIDER.w, h: SETTINGS_SLIDER.h, value: s.sfx == null ? 1 : s.sfx },
        music: { x: SETTINGS_SLIDER.x, y: SETTINGS_SLIDER.y + SETTINGS_SLIDER.gap, w: SETTINGS_SLIDER.w, h: SETTINGS_SLIDER.h, value: s.music == null ? 1 : s.music }
      };
    },

    loadAudioSettings: function (st) {
      function read(key) {
        try {
          var v = parseFloat(localStorage.getItem(key));
          return isFinite(v) ? clamp(v / 100, 0, 1) : null;
        } catch (e) { return null; }
      }
      var sfx = read('bombit.sfx.volume');
      var music = read('bombit.music.volume');
      st.settings.sfx = sfx == null
        ? (BI.sfx && BI.sfx.getVolume ? BI.sfx.getVolume() : 1)
        : sfx;
      st.settings.music = music == null
        ? (BI.music && BI.music.getVolume ? BI.music.getVolume() : 1)
        : music;
      if (sfx != null && BI.sfx && BI.sfx.setVolume) BI.sfx.setVolume(sfx);
      if (music != null && BI.music && BI.music.setVolume) BI.music.setVolume(music);
    },

    applyAudioSetting: function (st, kind, value, persist) {
      value = clamp(Number(value) || 0, 0, 1);
      st.settings[kind] = value;
      if (kind === 'sfx' && BI.sfx && BI.sfx.setVolume) BI.sfx.setVolume(value);
      if (kind === 'music' && BI.music && BI.music.setVolume) BI.music.setVolume(value);
      if (persist) {
        try { localStorage.setItem('bombit.' + kind + '.volume', String(Math.round(value * 100))); } catch (e) {}
      }
    },

    openSettings: function (st) {
      st.settings.open = true;
      st.settings.drag = null;
      st.settings.sfx = BI.sfx && BI.sfx.getVolume ? BI.sfx.getVolume() : 1;
      st.settings.music = BI.music && BI.music.getVolume ? BI.music.getVolume() : 1;
      if (BI.sfx && BI.sfx.unlock) BI.sfx.unlock();
      st.hover = null;
    },

    closeSettings: function (st) {
      st.settings.open = false;
      st.settings.drag = null;
      st.hover = null;
    },

    /* ============================================================
     * 更新
     * ============================================================ */
    update: function (st, dt) {
      st.t += dt;
      st.pulse += dt;
      st.stepT = Math.min(1, st.stepT + dt * 5);
      st.switchT = Math.min(1, st.switchT + dt * 4);

      var inp = BI.input, M = BI.mouse;
      if (st.settings.open) return menu.updateSettings(st, dt, inp, M);
      var mode = MODES[st.modeIndex];
      st.hover = null;

      /* ---- hover ---- */
      if (M.inside) {
        if (inp.hitRect(SETTINGS_BTN.x, SETTINGS_BTN.y, SETTINGS_BTN.w, SETTINGS_BTN.h)) {
          st.hover = { kind: 'settings' };
        } else if (inp.hitRect(REPLAY_BTN.x, REPLAY_BTN.y, REPLAY_BTN.w, REPLAY_BTN.h)) {
          st.hover = { kind: 'replay' };
        } else if (st.step === 'chars' && inp.hitRect(BACK_BTN.x, BACK_BTN.y, BACK_BTN.w, BACK_BTN.h)) {
          st.hover = { kind: 'back' };
        } else if (inp.hitRect(BTN_X(), BTN.y, BTN.w, BTN.h)) {
          st.hover = { kind: 'cta' };
        } else if (st.step === 'chars') {
          for (var t = 0; t < st.tabs.length; t++) {
            var tr = st.tabs[t];
            if (inp.hitRect(tr.x, tr.y, tr.w, tr.h)) { st.hover = { kind: 'tab', index: t }; break; }
          }
          if (!st.hover) {
            for (var c = 0; c < st.cards.length; c++) {
              var cr = st.cards[c];
              if (inp.hitRect(cr.x, cr.y, cr.w, cr.h)) { st.hover = { kind: 'card', index: c }; break; }
            }
          }
        } else {
          for (var m = 0; m < st.cards.length; m++) {
            var mr = st.cards[m];
            if (inp.hitRect(mr.x, mr.y, mr.w, mr.h)) { st.hover = { kind: 'mode', index: m }; break; }
          }
        }
      }

      /* ---- click ---- */
      if (M.clicked) {
        if (st.hover && st.hover.kind === 'settings') {
          BI.sfx.play('menuConfirm');
          menu.openSettings(st);
          return null;
        }
        if (st.hover && st.hover.kind === 'replay') {
          BI.sfx.play('menuConfirm');
          return { screen: 'replay' };
        }
        if (st.hover && st.hover.kind === 'back') {
          menu.openMode(st);
          BI.sfx.play('menuMove');
          return null;
        }
        if (st.hover && st.hover.kind === 'cta') {
          if (st.step === 'mode') { menu.openCharacter(st); BI.sfx.play('menuConfirm'); return null; }
          return menu.confirmChar(st);
        }
        if (st.hover && st.hover.kind === 'tab') {
          menu.selectPlayer(st, st.tabs[st.hover.index].player);
          return null;
        }
        if (st.hover && st.hover.kind === 'mode') {
          st.modeIndex = st.hover.index;
          st.focus = st.modeIndex;
          st.switchT = 0;
          menu.layout(st);
          BI.sfx.play('menuMove');
          return null;
        }
        if (st.hover && st.hover.kind === 'card') {
          st.focus = st.hover.index;
          st.charIndex[st.player] = st.hover.index;
          st.switchT = 0;
          BI.sfx.play('menuMove');
          return null;
        }
      }

      /* ---- keyboard ---- */
      if (st.step === 'mode') {
        var moved = false;
        if (inp.wasPressed('ArrowLeft')) { st.modeIndex = (st.modeIndex + MODES.length - 1) % MODES.length; moved = true; }
        if (inp.wasPressed('ArrowRight')) { st.modeIndex = (st.modeIndex + 1) % MODES.length; moved = true; }
        if (inp.wasPressed('Digit1') || inp.wasPressed('Digit2') || inp.wasPressed('Digit3')) {
          st.modeIndex = inp.wasPressed('Digit3') ? 2 : (inp.wasPressed('Digit2') ? 1 : 0);
          moved = true;
        }
        if (moved) {
          st.focus = st.modeIndex;
          st.switchT = 0;
          menu.layout(st);
          BI.sfx.play('menuMove');
        }
        if (inp.wasPressed('Enter') || inp.wasPressed('Space') || inp.wasPressed('NumpadEnter')) {
          menu.openCharacter(st);
          BI.sfx.play('menuConfirm');
        }
        return null;
      }

      if (inp.wasPressed('Escape') || inp.wasPressed('Backspace')) {
        menu.openMode(st);
        BI.sfx.play('menuMove');
        return null;
      }
      if (mode.players === 2 && (inp.wasPressed('Digit1') || inp.wasPressed('Digit2'))) {
        menu.selectPlayer(st, inp.wasPressed('Digit2') ? 1 : 0);
        return null;
      }
      if (inp.wasPressed('Tab') && mode.players === 2) {
        menu.selectPlayer(st, st.player ? 0 : 1);
        return null;
      }

      var f = st.focus || 0;
      var cols = GRID.cols;
      var next = null;
      if (inp.wasPressed('ArrowRight')) next = (f + 1) % st.cards.length;
      if (inp.wasPressed('ArrowLeft')) next = (f + st.cards.length - 1) % st.cards.length;
      if (inp.wasPressed('ArrowDown')) next = (f + cols) % st.cards.length;
      if (inp.wasPressed('ArrowUp')) next = (f - cols + st.cards.length) % st.cards.length;
      if (next != null) {
        st.focus = next;
        st.charIndex[st.player] = next;
        st.switchT = 0;
        BI.sfx.play('menuMove');
      }

      if (inp.wasPressed('Enter') || inp.wasPressed('Space') || inp.wasPressed('NumpadEnter')) {
        return menu.confirmChar(st);
      }
      return null;
    },

    /** 设置弹层打开时，菜单其余部分完全冻结 */
    updateSettings: function (st, dt, inp, M) {
      var s = st.settings;
      var sliders = menu.sliderRects(st);
      var card = SETTINGS_CARD;
      var close = { x: card.x + card.w - 42, y: card.y + 16, w: 26, h: 26 };
      var done = { x: card.x + card.w - 120, y: card.y + card.h - 48, w: 96, h: 30 };
      function setFromMouse(kind) {
        var r = sliders[kind];
        var v = clamp((M.x - r.x) / r.w, 0, 1);
        menu.applyAudioSetting(st, kind, v, true);
      }
      function hitSlider(r) {
        return M.inside && M.x >= r.x - 10 && M.x <= r.x + r.w + 10 &&
               M.y >= r.y - 18 && M.y <= r.y + r.h + 18;
      }

      if (inp.wasPressed('Escape') || inp.wasPressed('Backspace')) {
        menu.closeSettings(st);
        return null;
      }
      if (inp.wasPressed('KeyM')) {
        BI.sfx.toggle();
        return null;
      }
      if (M.clicked) {
        if (inp.hitRect(close.x, close.y, close.w, close.h) ||
            inp.hitRect(done.x, done.y, done.w, done.h)) {
          menu.closeSettings(st);
          return null;
        }
        if (M.x < card.x || M.x > card.x + card.w || M.y < card.y || M.y > card.y + card.h) {
          menu.closeSettings(st);
          return null;
        }
        if (hitSlider(sliders.sfx)) { s.drag = 'sfx'; setFromMouse('sfx'); return null; }
        if (hitSlider(sliders.music)) { s.drag = 'music'; setFromMouse('music'); return null; }
      }
      if (M.down && s.drag) {
        setFromMouse(s.drag);
      } else if (!M.down) {
        s.drag = null;
      }
      return null;
    },

    /* ============================================================
     * 渲染入口
     * ============================================================ */
    draw: function (ctx, st) {
      if (st.step === 'mode') {
        menu.drawBackground(ctx, st);
        menu.drawHeader(ctx, st);
        menu.drawModeSection(ctx, st);
        menu.drawModeCards(ctx, st);
      } else {
        menu.drawBackground(ctx, st);
        menu.drawCharHeader(ctx, st);
        menu.drawPlayerTabs(ctx, st);
        menu.drawPoster(ctx, st);
        menu.drawCharTiles(ctx, st);
        menu.drawBack(ctx, st);
      }
      menu.drawReplay(ctx, st);
      menu.drawSettingsButton(ctx, st);
      menu.drawCta(ctx, st);
      menu.drawFooter(ctx, st);
      if (st.settings.open) menu.drawSettings(ctx, st);
    },

    /* ============================================================
     * 背景
     * ============================================================ */
    drawBackground: function (ctx, st) {
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      ctx.fillStyle = U.C.paper;
      ctx.fillRect(0, 0, W, H);
      var wp = BI.assets && BI.assets.wallpaper;
      if (wp && wp.ok && wp.canvas) {
        ctx.save();
        ctx.globalAlpha = .07;
        ctx.drawImage(wp.canvas, 0, 0, W, H);
        ctx.restore();
      }
      U.dots(ctx, 0, 0, W, H, U.C.ink, .07, 16);

      var bars = [U.C.orange, U.C.cyan, U.C.yellow, U.C.pink, U.C.green, U.C.ink];
      for (var i = 0; i < bars.length; i++) {
        ctx.fillStyle = bars[i];
        ctx.fillRect(0, i * (H / bars.length), 4, H / bars.length);
        ctx.fillRect(W - 4, H - (i + 1) * (H / bars.length), 4, H / bars.length);
      }

      if (st.step === 'mode') {
        U.text(ctx, 'BOMBIT', W / 2, 438, {
          size: 112, weight: 900, family: U.F.impact, fill: 'rgba(20,16,25,0)',
          stroke: 'rgba(20,16,25,.055)', strokeWidth: 2, align: 'center'
        });
        U.sun(ctx, 606, 112, 89, U.C.orange, st.t * .025);
        U.bomb(ctx, 610, 111, 31, { rot: -.12 });
      } else {
        U.text(ctx, 'SPIRIT', 492, 390, {
          size: 128, weight: 900, family: U.F.impact, fill: 'rgba(20,16,25,0)',
          stroke: 'rgba(20,16,25,.04)', strokeWidth: 2, align: 'center'
        });
      }

      var stars = [
        [512, 48, 7, U.C.yellow, 0.2],
        [690, 172, 5, U.C.cream, 0.6],
        [490, 180, 4, U.C.pink, 0.8],
        [268, 164, 3, U.C.cyan, 1.2],
        [684, 620, 5, U.C.cyan, 0.4]
      ];
      for (var s = 0; s < stars.length; s++) {
        var o = stars[s];
        var bob = Math.sin(st.t * 2.2 + o[4] * 4) * 4;
        U.star(ctx, o[0], o[1] + bob, o[2], o[2] * .45, o[3], 5, st.t * .4);
      }

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

    /* ============================================================
     * STEP 01 —— 模式
     * ============================================================ */
    drawHeader: function (ctx, st) {
      var W = CFG.VIEW_W;
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(0, 0, W, 18);
      U.text(ctx, 'BOMBIT®  /  Q-BAN BUBBLE HALL', 13, 9, {
        size: 6.5, family: U.F.mono, weight: 700, fill: U.C.cream, alpha: .82
      });
      U.text(ctx, 'MOTION UI  /  2026', W - 13, 9, {
        size: 6.5, family: U.F.mono, weight: 700, fill: U.C.cream, alpha: .55, align: 'right'
      });

      ctx.fillStyle = U.C.orange;
      ctx.fillRect(26, 35, 7, 7);
      U.text(ctx, 'GAME MOTION ID / 006', 40, 39, {
        size: 7, family: U.F.mono, weight: 700, fill: U.C.ink, alpha: .64
      });

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
      U.text(ctx, 'SELECT MODE  /  选择模式', 268, 141, {
        size: 6.5, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .48
      });

      ctx.save();
      ctx.strokeStyle = 'rgba(20,16,25,.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(26, 175);
      ctx.lineTo(694, 175);
      ctx.stroke();
      ctx.restore();
    },

    drawModeSection: function (ctx, st) {
      U.tag(ctx, 'STEP 01', MODE_CARD.x, 198, {
        size: 6.8, family: U.F.mono, fill: U.C.ink, fg: U.C.cream,
        padX: 7, h: 17, align: 'left', stroke: null
      });
      U.text(ctx, '选择模式', MODE_CARD.x + 72, 203, {
        size: 16, weight: 900, family: U.F.cn, fill: U.C.ink
      });
      U.text(ctx, '选择一种玩法，进入精灵选择', MODE_CARD.x + 146, 202, {
        size: 7.2, weight: 500, family: U.F.cn, fill: U.C.ink, alpha: .52
      });
      U.text(ctx, 'MODE SELECT  /  3', CFG.VIEW_W - MODE_CARD.x, 208, {
        size: 6.5, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .45, align: 'right'
      });
      ctx.save();
      ctx.strokeStyle = 'rgba(20,16,25,.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MODE_CARD.x, 216);
      ctx.lineTo(CFG.VIEW_W - MODE_CARD.x, 216);
      ctx.stroke();
      ctx.restore();
    },

    drawModeCards: function (ctx, st) {
      for (var i = 0; i < st.cards.length; i++) {
        menu.drawModeCard(ctx, st, i, st.cards[i]);
      }
    },

    drawModeCard: function (ctx, st, idx, it) {
      var mode = MODES[idx];
      var selected = idx === st.modeIndex;
      var hovered = st.hover && st.hover.kind === 'mode' && st.hover.index === idx;
      var lift = (selected ? Math.sin(st.pulse * 2.5) * 1.4 : 0) + (hovered ? -4 : 0);
      var x = it.x, y = it.y + lift, w = it.w, h = it.h;

      U.panel(ctx, x, y, w, h, {
        fill: selected ? U.C.ink : mode.soft,
        stroke: U.C.ink, lw: 2.6, r: 4,
        shadow: selected ? mode.color : U.C.ink,
        shadowX: selected ? 7 : 4, shadowY: selected ? 7 : 4
      });
      ctx.fillStyle = mode.color;
      ctx.fillRect(x, y, w, 6);

      U.text(ctx, mode.no, x + 15, y + 56, {
        size: 54, weight: 900, family: U.F.impact,
        fill: selected ? mode.color : hexA(U.C.ink, .22)
      });
      U.text(ctx, mode.abbr, x + 15, y + 72, {
        size: 6.5, weight: 700, family: U.F.mono,
        fill: selected ? 'rgba(245,235,216,.45)' : 'rgba(20,16,25,.4)'
      });

      U.tag(ctx, mode.players === 2 ? '2P' : '1P', x + w - 14, y + 22, {
        size: 6.5, family: U.F.mono,
        fill: selected ? mode.color : U.C.ink,
        fg: selected ? U.C.ink : U.C.cream,
        padX: 6, h: 16, align: 'right', stroke: U.C.ink, lw: 1
      });

      U.text(ctx, mode.label, x + 15, y + 110, {
        size: 20, weight: 900, family: U.F.cn,
        fill: selected ? U.C.cream : U.C.ink
      });
      U.text(ctx, mode.tagline, x + 15, y + 130, {
        size: 7.2, weight: 500, family: U.F.cn,
        fill: selected ? 'rgba(245,235,216,.55)' : 'rgba(20,16,25,.5)'
      });
      wrapText(ctx, mode.desc, x + 15, y + 148, w - 30, 8.2, 11,
        selected ? 'rgba(245,235,216,.72)' : 'rgba(20,16,25,.62)', 2, 500, U.F.cn);

      menu.drawModeMotif(ctx, mode, x + w / 2, y + 224, 60, selected);

      U.text(ctx, mode.players === 2 ? '2P / LOCAL VERSUS' : '1P / SOLO', x + 15, y + h - 22, {
        size: 6, weight: 700, family: U.F.mono,
        fill: selected ? 'rgba(245,235,216,.5)' : 'rgba(20,16,25,.45)'
      });
      U.text(ctx, 'ENTER', x + w - 15, y + h - 22, {
        size: 6, weight: 700, family: U.F.mono,
        fill: selected ? mode.color : 'rgba(20,16,25,.38)', align: 'right'
      });

      if (selected) {
        U.tag(ctx, 'SELECTED', x + w - 14, y + h - 45, {
          size: 5.8, family: U.F.mono, fill: U.C.yellow, fg: U.C.ink,
          padX: 5, h: 13, align: 'right', stroke: U.C.ink, lw: 1, rot: .02
        });
      }
      if (hovered && !selected) {
        U.panel(ctx, x, y, w, h, { fill: 'rgba(255,253,246,.12)', stroke: null, r: 4 });
      }
    },

    drawModeMotif: function (ctx, mode, cx, cy, r, selected) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = selected ? mode.color : U.C.cream;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = U.C.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      U.dots(ctx, -r, -r, r * 2, r * 2, selected ? U.C.ink : mode.color, .08, 10);

      if (mode.motif === 'clock') {
        ctx.fillStyle = U.C.cream;
        ctx.beginPath();
        ctx.arc(0, 0, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = U.C.ink;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = U.C.ink;
        ctx.lineWidth = 2;
        for (var i = 0; i < 12; i++) {
          var a = i * Math.PI / 6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 34, Math.sin(a) * 34);
          ctx.lineTo(Math.cos(a) * 39, Math.sin(a) * 39);
          ctx.stroke();
        }
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -24);
        ctx.moveTo(0, 0);
        ctx.lineTo(18, 10);
        ctx.stroke();
        ctx.fillStyle = U.C.orange;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (mode.motif === 'versus') {
        U.star(ctx, -21, -5, 28, 12, U.C.cyan, 5, .3);
        U.star(ctx, 21, -5, 28, 12, U.C.pink, 5, -.25);
        U.text(ctx, 'VS', 0, 30, {
          size: 26, weight: 900, family: U.F.impact, fill: U.C.ink,
          stroke: U.C.cream, strokeWidth: 2, align: 'center'
        });
      } else {
        var cell = 22, ox = -33, oy = -33;
        ctx.fillStyle = U.C.ink;
        [[0,0],[2,0],[1,1],[0,2],[2,2]].forEach(function (p) {
          ctx.fillRect(ox + p[0] * cell, oy + p[1] * cell, cell - 3, cell - 3);
        });
        ctx.strokeStyle = U.C.cream;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ox + 11, oy + 11);
        ctx.lineTo(ox + 11, oy + 55);
        ctx.lineTo(ox + 55, oy + 55);
        ctx.stroke();
        U.bomb(ctx, 26, 24, 12, { rot: .2 });
      }
      ctx.restore();
    },

    /* ============================================================
     * STEP 02 —— 角色
     * ============================================================ */
    drawCharHeader: function (ctx, st) {
      var W = CFG.VIEW_W, mode = MODES[st.modeIndex], ch = st.chars[st.charIndex[st.player]];
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(0, 0, W, 18);
      U.text(ctx, 'BOMBIT®  /  SPIRIT SELECT', 13, 9, {
        size: 6.5, family: U.F.mono, weight: 700, fill: U.C.cream, alpha: .82
      });
      U.text(ctx, 'MOTION UI  /  2026', W - 13, 9, {
        size: 6.5, family: U.F.mono, weight: 700, fill: U.C.cream, alpha: .55, align: 'right'
      });
      U.text(ctx, 'STEP 02 / SPIRIT SELECT', 24, 33, {
        size: 7, weight: 700, family: U.F.mono, fill: U.C.cyan
      });
      U.text(ctx, '选择精灵', 22, 66, {
        size: 30, weight: 900, family: U.F.cn, fill: U.C.ink,
        shadow: U.C.orange, shadowX: 3, shadowY: 3
      });
      U.text(ctx, 'CHOOSE YOUR SPIRIT  /  6 AVAILABLE', 25, 85, {
        size: 6.8, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .48
      });

      ctx.save();
      ctx.strokeStyle = 'rgba(20,16,25,.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(404, 32);
      ctx.lineTo(404, 90);
      ctx.stroke();
      ctx.restore();
      U.tag(ctx, mode.label, 420, 44, {
        size: 7, family: U.F.cn, fill: mode.color, fg: U.C.ink,
        padX: 7, h: 16, align: 'left', stroke: U.C.ink, lw: 1
      });
      U.text(ctx, 'MODE ' + mode.no + ' / ' + mode.abbr, 420, 66, {
        size: 6, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .48
      });
      U.text(ctx, (st.player ? '2P' : '1P') + ' 正在选择  /  ' + (ch ? ch.name : ''), 420, 84, {
        size: 7.5, weight: 700, family: U.F.cn, fill: playerColor(st.player)
      });

      ctx.save();
      ctx.strokeStyle = 'rgba(20,16,25,.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, 92);
      ctx.lineTo(700, 92);
      ctx.stroke();
      ctx.restore();
    },

    drawPlayerTabs: function (ctx, st) {
      var mode = MODES[st.modeIndex];
      if (mode.players === 1) {
        var tr = st.tabs[0];
        U.panel(ctx, tr.x, tr.y, tr.w, tr.h, {
          fill: U.C.cream, stroke: U.C.ink, lw: 1.8, r: 3,
          shadow: U.C.cyan, shadowX: 3, shadowY: 3
        });
        ctx.fillStyle = U.C.cyan;
        ctx.fillRect(tr.x, tr.y, 5, tr.h);
        U.text(ctx, '1P', tr.x + 16, tr.y + 14, {
          size: 9, weight: 900, family: U.F.impact, fill: U.C.ink
        });
        U.text(ctx, '单人选择', tr.x + 38, tr.y + 14, {
          size: 8.5, weight: 700, family: U.F.cn, fill: U.C.ink
        });
        U.text(ctx, '6 SPIRITS', tr.x + tr.w - 10, tr.y + 14, {
          size: 6.5, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .45, align: 'right'
        });
        return;
      }
      for (var i = 0; i < st.tabs.length; i++) {
        var tab = st.tabs[i];
        var active = st.player === i;
        var pc = playerColor(i);
        var ch = st.chars[st.charIndex[i]];
        U.panel(ctx, tab.x, tab.y, tab.w, tab.h, {
          fill: active ? U.C.ink : U.C.cream,
          stroke: U.C.ink, lw: 1.8, r: 3,
          shadow: active ? pc : 'rgba(20,16,25,.16)',
          shadowX: active ? 4 : 2, shadowY: active ? 4 : 2
        });
        ctx.fillStyle = pc;
        ctx.fillRect(tab.x, tab.y, 5, tab.h);
        U.text(ctx, i ? '2P' : '1P', tab.x + 15, tab.y + 14, {
          size: 9, weight: 900, family: U.F.impact, fill: active ? pc : U.C.ink
        });
        U.text(ctx, ch ? ch.name : '', tab.x + 38, tab.y + 14, {
          size: 8.5, weight: 700, family: U.F.cn, fill: active ? U.C.cream : U.C.ink
        });
        if (active) {
          U.text(ctx, '选择中', tab.x + tab.w - 10, tab.y + 14, {
            size: 6, weight: 700, family: U.F.cn, fill: U.C.yellow, align: 'right'
          });
        }
      }

    },

    drawCharTiles: function (ctx, st) {
      for (var i = 0; i < st.cards.length; i++) {
        menu.drawCharTile(ctx, st, i, st.cards[i]);
      }
    },

    drawCharTile: function (ctx, st, idx, it) {
      var ch = st.chars[idx];
      if (!ch) return;
      var v = charVisual(ch);
      var active = st.charIndex[st.player] === idx;
      var other = MODES[st.modeIndex].players === 2 && st.charIndex[1 - st.player] === idx;
      var otherPlayer = 1 - st.player;
      var pcolor = playerColor(st.player);
      var hovered = st.hover && st.hover.kind === 'card' && st.hover.index === idx;
      var lift = (active ? Math.sin(st.pulse * 3 + idx * .4) * 1.2 : 0) + (hovered ? -3 : 0);
      var x = it.x, y = it.y + lift, w = it.w, h = it.h;
      var asset = ch.id ? BI.assets.get(ch.id) : null;

      if (active) {
        U.panel(ctx, x, y, w, h, {
          fill: v.color, stroke: U.C.ink, lw: 2.6, r: 4,
          shadow: pcolor, shadowX: 4, shadowY: 4
        });
        U.panel(ctx, x + 4, y + 4, w - 8, h - 28, {
          fill: U.C.cream, stroke: U.C.ink, lw: 1, r: 2
        });
        U.tag(ctx, st.player ? '2P' : '1P', x + 4, y + 4, {
          size: 5.8, family: U.F.mono, fill: pcolor, fg: U.C.ink,
          padX: 4, h: 12, align: 'left', stroke: U.C.ink, lw: 1
        });
        U.star(ctx, x + w - 10, y + 11, 4, 1.8, U.C.yellow, 5, .2);
      } else {
        U.panel(ctx, x, y, w, h, {
          fill: U.C.cream, stroke: U.C.ink, lw: 1.6, r: 4,
          shadow: 'rgba(20,16,25,.16)', shadowX: 2, shadowY: 2
        });
        ctx.fillStyle = v.color;
        ctx.fillRect(x, y, w, 4);
      }

      U.head(ctx, asset, x + 4, y + (active ? 4 : 5), w - 8, h - 29, v.color);

      var stripY = y + h - 23;
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(x + 2, stripY, w - 4, 21);
      U.text(ctx, ch.name || '？', x + 7, stripY + 10, {
        size: 9, weight: 900, family: U.F.cn, fill: U.C.cream
      });
      U.text(ctx, pad2(idx + 1), x + w - 7, stripY + 10, {
        size: 5.5, weight: 700, family: U.F.mono,
        fill: active ? pcolor : 'rgba(245,235,216,.55)', align: 'right'
      });

      if (other) {
        U.tag(ctx, otherPlayer ? '2P' : '1P', x + w - 4, y + 12, {
          size: 5.5, family: U.F.mono, fill: playerColor(otherPlayer), fg: U.C.ink,
          padX: 4, h: 12, align: 'right', stroke: U.C.ink, lw: 1
        });
      }
      if (active) {
        ctx.fillStyle = pcolor;
        ctx.fillRect(x + 4, y + h - 4, w - 8, 3);
      }
    },

    /* ============================================================
     * 角色档案 / 技能
     * ============================================================ */
    /* ============================================================
     * 大幅动效海报
     * ============================================================ */
    drawPoster: function (ctx, st) {
      var ch = st.chars[st.charIndex[st.player]];
      if (!ch) return;
      var v = charVisual(ch), data = BI.SKILLS[ch.id] || BI.SKILLS.xiaonuo;
      var lore = BI.CHARACTER_LORE[ch.id];
      var idx = st.charIndex[st.player];
      var x = POSTER.x, y = POSTER.y, w = POSTER.w, h = POSTER.h;
      var pc = playerColor(st.player);
      var asset = ch.id ? BI.assets.get(ch.id) : null;
      var enter = easeOut(Math.min(1, st.stepT * 3));
      var swap = easeOut(Math.min(1, st.switchT * 4.5));
      var diskX = x + 520, diskY = y + 170;
      var bottom = y + 282 + Math.sin(st.t * 2.2) * 3;

      ctx.save();
      ctx.translate((1 - enter) * -22, (1 - enter) * 12);
      U.panel(ctx, x, y, w, h, {
        fill: U.C.ink, stroke: U.C.ink, lw: 3, r: 5,
        shadow: v.color, shadowX: 9, shadowY: 9
      });
      ctx.save();
      D.roundRect(ctx, x, y, w, h, 5);
      ctx.clip();

      // 右侧角色聚光：旋转放射 + 厚色环 + 奶油圆
      ctx.save();
      ctx.translate(diskX, diskY);
      ctx.rotate(st.t * .055);
      ctx.fillStyle = v.color;
      for (var ray = 0; ray < 22; ray++) {
        var ra = ray * Math.PI * 2 / 22;
        ctx.save();
        ctx.rotate(ra);
        ctx.beginPath();
        ctx.moveTo(0, 124);
        ctx.lineTo(-9, 184);
        ctx.lineTo(9, 184);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = U.C.cream;
      ctx.beginPath();
      ctx.arc(diskX, diskY, 118, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.arc(diskX, diskY, 128, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = U.C.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(diskX, diskY, 136, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(diskX, diskY, 118, 0, Math.PI * 2);
      ctx.stroke();
      U.dots(ctx, x, y, w, h, U.C.cream, .045, 12);

      // 速度线与背景巨型编号
      ctx.save();
      ctx.strokeStyle = 'rgba(245,235,216,.16)';
      ctx.lineWidth = 2;
      for (var l = 0; l < 7; l++) {
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 70 + l * 21);
        ctx.lineTo(x + 54 + l * 9, y + 52 + l * 21);
        ctx.stroke();
      }
      ctx.restore();
      U.text(ctx, pad2(idx + 1), x + w - 22, y + 102, {
        size: 112, weight: 900, family: U.F.impact, fill: 'rgba(245,235,216,0)',
        stroke: 'rgba(245,235,216,.12)', strokeWidth: 1.5, align: 'right'
      });

      // 角色全身像
      ctx.save();
      ctx.globalAlpha = .32;
      ctx.fillStyle = U.C.ink;
      ctx.beginPath();
      ctx.ellipse(diskX, bottom + 4, 76, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      var scale = .9 + .1 * swap;
      ctx.save();
      ctx.translate(diskX, bottom);
      ctx.rotate((1 - swap) * -.06 + Math.sin(st.t * 1.4) * .01);
      ctx.scale(scale, scale);
      drawFullSprite(ctx, asset, 0, 0, 260, 266, v.color);
      ctx.restore();

      if (st.switchT < .3) {
        ctx.save();
        ctx.globalAlpha = (1 - st.switchT / .3) * .22;
        ctx.fillStyle = U.C.cream;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }

      // 海报刊头与玩家标签
      U.tag(ctx, 'SPIRIT ' + pad2(idx + 1), x + 18, y + 20, {
        size: 6.5, family: U.F.mono, fill: v.color, fg: U.C.ink,
        padX: 7, h: 16, align: 'left', stroke: U.C.ink, lw: 1
      });
      U.tag(ctx, st.player ? '2P' : '1P', x + w - 18, y + 20, {
        size: 7, family: U.F.mono, fill: pc, fg: U.C.ink,
        padX: 7, h: 16, align: 'right', stroke: U.C.ink, lw: 1
      });

      // 左侧：说明全部放进海报
      U.tag(ctx, (v.role || '精灵') + '系', x + 20, y + 45, {
        size: 6, family: U.F.cn, fill: v.accent, fg: U.C.ink,
        padX: 6, h: 14, align: 'left', stroke: U.C.ink, lw: 1
      });
      U.text(ctx, ch.name || '？', x + 20, y + 90, {
        size: 44, weight: 900, family: U.F.cn, fill: U.C.cream,
        shadow: v.color, shadowX: 3, shadowY: 3
      });
      var skillLabel = (data.passive ? '被动 · ' : '') + data.name;
      U.text(ctx, skillLabel, x + 22, y + 118, {
        size: 14, weight: 900, family: U.F.cn, fill: v.color
      });
      ctx.fillStyle = v.color;
      ctx.fillRect(x + 22, y + 124, Math.min(U.measure(ctx, skillLabel, 14, 900, U.F.cn), 300), 3);

      wrapText(ctx, data.desc, x + 22, y + 143, 340, 8.6, 11,
        'rgba(245,235,216,.72)', 2, 500, U.F.cn);
      if (data.passive) {
        U.text(ctx, '放弹' + data.bombsToEvolve + '次或' + (st.versus ? '击倒' : '击杀') + '通灵',
          x + 22, y + 172, {
            size: 7.2, weight: 700, family: U.F.cn, fill: 'rgba(245,235,216,.55)'
          });
      }
      if (lore) {
        U.text(ctx, 'LORE', x + 22, y + 194, {
          size: 5.5, weight: 700, family: U.F.mono, fill: v.accent
        });
        U.text(ctx, lore.summary, x + 54, y + 194, {
          size: 6.8, weight: 500, family: U.F.cn, fill: 'rgba(245,235,216,.5)'
        });
      }

      // 键位 / 冷却 / 玩家副标
      var keyText = data.passive ? '被动' : (st.player ? 'F' : (st.versus ? '右Shift' : 'Q'));
      U.keycap(ctx, keyText, x + 22, y + 214, data.passive ? 44 : 34, 20, v.color, U.C.ink);
      U.text(ctx, data.passive ? '6 格通灵' : '冷却' + data.cd + '秒', x + 66, y + 224, {
        size: 6.6, weight: 700, family: U.F.mono, fill: 'rgba(245,235,216,.55)'
      });
      U.text(ctx, 'BOMBIT / CHARACTER FILE', x + 22, y + 254, {
        size: 5.3, weight: 700, family: U.F.mono, fill: 'rgba(245,235,216,.35)'
      });

      // 浮动星点
      var deco = [
        [x + 340, y + 46, 6, U.C.yellow, .2],
        [x + 386, y + 128, 4, U.C.cream, 1.1],
        [x + 36, y + 240, 4, v.accent, .7],
        [diskX + 74, y + 272, 5, U.C.yellow, 1.6]
      ];
      for (var di = 0; di < deco.length; di++) {
        var dd = deco[di];
        U.star(ctx, dd[0], dd[1] + Math.sin(st.t * 2 + dd[4] * 5) * 4, dd[2], dd[2] * .45, dd[3], 5, st.t * .35);
      }

      // 底部滚动条：动效短片的“海报跑马灯”
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y + h - 24, w, 24);
      ctx.clip();
      ctx.fillStyle = v.color;
      ctx.fillRect(x, y + h - 24, w, 24);
      var shift = -((st.t * 32) % 190);
      ctx.fillStyle = U.C.ink;
      for (var m = 0; m < 9; m++) {
        U.text(ctx, 'BOMBIT  /  SPIRIT SELECT  /  ' + (st.player ? '2P' : '1P') + '  /  ' + pad2(idx + 1),
          x + shift + m * 190, y + h - 12, {
            size: 6.2, weight: 700, family: U.F.mono, fill: U.C.ink
          });
      }
      ctx.restore();

      ctx.restore();
      ctx.restore();
    },

    /* ============================================================
     * 按钮 / 页脚 / 回放
     * ============================================================ */
    drawCta: function (ctx, st) {
      var mode = MODES[st.modeIndex];
      var active = st.step === 'chars';
      var label, sub;
      if (!active) {
        label = '进入精灵选择';
        sub = 'MODE ' + mode.no + '  →  SPIRIT SELECT';
      } else if (mode.players === 1) {
        label = '开始游戏';
        sub = 'SPIRIT ' + pad2(st.charIndex[0] + 1) + '  /  START';
      } else if (st.player === 0) {
        label = '确认 1P';
        sub = '下一步：选择 2P 精灵';
      } else {
        label = '开始对战';
        sub = '1P + 2P READY  /  START';
      }
      var hover = st.hover && st.hover.kind === 'cta';
      var x = BTN_X();
      var lift = Math.sin(st.pulse * 3) * 1.2 + (hover ? -2 : 0);
      var y = BTN.y + lift;
      var shadow = active ? playerColor(st.player) : mode.color;
      U.panel(ctx, x, y, BTN.w, BTN.h, {
        fill: hover ? U.C.orange : U.C.yellow,
        stroke: U.C.ink, lw: 2.5, r: 4,
        shadow: U.C.ink, shadowX: 5, shadowY: 5
      });
      U.play(ctx, x + 30, y + BTN.h / 2, 13, U.C.ink);
      U.text(ctx, label, x + 48, y + BTN.h / 2 - 2, {
        size: 21, weight: 900, family: U.F.cn, fill: U.C.ink
      });
      U.text(ctx, sub, x + 48, y + BTN.h / 2 + 17, {
        size: 6.2, weight: 700, family: U.F.mono, fill: 'rgba(20,16,25,.5)'
      });
      U.keycap(ctx, 'ENTER', x + BTN.w - 80, y + 18, 56, 20, U.C.ink, U.C.cream);
      ctx.fillStyle = shadow;
      ctx.fillRect(x, y + BTN.h - 4, 44, 4);
    },

    drawBack: function (ctx, st) {
      var hover = st.hover && st.hover.kind === 'back';
      U.panel(ctx, BACK_BTN.x, BACK_BTN.y, BACK_BTN.w, BACK_BTN.h, {
        fill: hover ? U.C.ink : U.C.cream,
        stroke: U.C.ink, lw: 1.8, r: 3,
        shadow: hover ? U.C.orange : 'rgba(20,16,25,.16)',
        shadowX: hover ? 4 : 2, shadowY: hover ? 4 : 2
      });
      U.text(ctx, '← 返回模式', BACK_BTN.x + 14, BACK_BTN.y + 23, {
        size: 11, weight: 900, family: U.F.cn, fill: hover ? U.C.cream : U.C.ink
      });
      U.text(ctx, 'ESC', BACK_BTN.x + 14, BACK_BTN.y + 41, {
        size: 5.8, weight: 700, family: U.F.mono, fill: hover ? U.C.cyan : 'rgba(20,16,25,.4)'
      });
    },

    drawReplay: function (ctx, st) {
      var r = REPLAY_BTN;
      var hover = st.hover && st.hover.kind === 'replay';
      U.panel(ctx, r.x, r.y, r.w, r.h, {
        fill: hover ? U.C.ink : U.C.cream,
        stroke: U.C.ink, lw: 2, r: 3,
        shadow: hover ? U.C.orange : U.C.ink, shadowX: 3, shadowY: 3
      });
      U.text(ctx, '↗', r.x + 11, r.y + r.h / 2, {
        size: 12, weight: 900, family: U.F.mono, fill: hover ? U.C.yellow : U.C.orange
      });
      U.text(ctx, '对局回放', r.x + 27, r.y + r.h / 2 - 1, {
        size: 9, weight: 700, family: U.F.cn, fill: hover ? U.C.cream : U.C.ink
      });
      U.text(ctx, 'REPLAY', r.x + r.w - 9, r.y + r.h / 2 + 1, {
        size: 5, weight: 700, family: U.F.mono, fill: hover ? U.C.cyan : U.C.ink, alpha: .65, align: 'right'
      });
    },

    drawSettingsButton: function (ctx, st) {
      var r = SETTINGS_BTN;
      var hover = !st.settings.open && st.hover && st.hover.kind === 'settings';
      U.panel(ctx, r.x, r.y, r.w, r.h, {
        fill: hover ? U.C.ink : U.C.cream,
        stroke: U.C.ink, lw: 1.8, r: 3,
        shadow: hover ? U.C.orange : U.C.ink, shadowX: 2, shadowY: 2
      });
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2, gear = hover ? U.C.yellow : U.C.ink;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = gear;
      ctx.strokeStyle = gear;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var teeth = 8, outer = 10, inner = 7.4;
      for (var i = 0; i < teeth * 2; i++) {
        var a = -Math.PI / 2 + i * Math.PI / teeth;
        var rr = i % 2 === 0 ? outer : inner;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = hover ? U.C.ink : U.C.cream;
      ctx.fill();
      ctx.restore();
    },

    drawSettings: function (ctx, st) {
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      var c = SETTINGS_CARD, s = st.settings;
      ctx.save();
      ctx.globalAlpha = .82;
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      U.dots(ctx, 0, 0, W, H, U.C.cream, .035, 15);

      ctx.save();
      U.panel(ctx, c.x, c.y, c.w, c.h, {
        fill: U.C.cream, stroke: U.C.ink, lw: 3, r: 5,
        shadow: U.C.orange, shadowX: 7, shadowY: 7
      });

      ctx.save();
      D.roundRect(ctx, c.x, c.y, c.w, c.h, 5);
      ctx.clip();
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(c.x, c.y, c.w, 54);
      U.dots(ctx, c.x, c.y, c.w, 54, U.C.cream, .055, 12);
      ctx.restore();
      U.text(ctx, 'SETTINGS  /  声音设置', c.x + 20, c.y + 20, {
        size: 6.8, weight: 700, family: U.F.mono, fill: U.C.cyan
      });
      U.text(ctx, 'AUDIO MIXER  /  两个滑块，实时生效', c.x + 20, c.y + 39, {
        size: 7.2, weight: 500, family: U.F.cn, fill: 'rgba(245,235,216,.62)'
      });
      var close = { x: c.x + c.w - 42, y: c.y + 16, w: 26, h: 26 };
      U.panel(ctx, close.x, close.y, close.w, close.h, {
        fill: U.C.cream, stroke: U.C.ink, lw: 1.5, r: 2
      });
      U.text(ctx, '×', close.x + 13, close.y + 13, {
        size: 17, weight: 900, family: U.F.mono, fill: U.C.ink, align: 'center'
      });

      U.text(ctx, 'AUDIO MIXER / 音量调节', c.x + 24, c.y + 80, {
        size: 6.5, weight: 700, family: U.F.mono, fill: 'rgba(20,16,25,.45)'
      });

      var sliders = menu.sliderRects(st);
      menu.drawVolumeRow(ctx, c, sliders.sfx, 'sfx', s.sfx, U.C.orange, '音效 SFX', 'UI / 炸弹 / 拾取 / 技能');
      menu.drawVolumeRow(ctx, c, sliders.music, 'music', s.music, U.C.cyan, '音乐 MUSIC', '菜单 / 关卡 / BOSS');

      U.text(ctx, '拖动滑块调整　·　M 全局静音　·　Esc 关闭', c.x + 24, c.y + 292, {
        size: 7, weight: 500, family: U.F.cn, fill: 'rgba(20,16,25,.5)'
      });
      if (BI.sfx && BI.sfx.enabled === false) {
        U.tag(ctx, '已静音 / MUTED', c.x + c.w - 24, c.y + 289, {
          size: 5.8, family: U.F.mono, fill: U.C.pink, fg: U.C.ink,
          padX: 6, h: 14, align: 'right', stroke: U.C.ink, lw: 1
        });
      }

      var done = { x: c.x + c.w - 120, y: c.y + c.h - 48, w: 96, h: 30 };
      U.panel(ctx, done.x, done.y, done.w, done.h, {
        fill: U.C.yellow, stroke: U.C.ink, lw: 1.8, r: 3,
        shadow: U.C.orange, shadowX: 3, shadowY: 3
      });
      U.text(ctx, '完成', done.x + done.w / 2, done.y + 15, {
        size: 12, weight: 900, family: U.F.cn, fill: U.C.ink, align: 'center'
      });
      ctx.fillStyle = U.C.orange;
      ctx.fillRect(c.x, c.y + c.h - 4, 54, 4);
      ctx.restore();
    },

    drawVolumeRow: function (ctx, card, rect, kind, value, color, label, sub) {
      value = clamp(value == null ? 1 : value, 0, 1);
      var y = rect.y;
      U.text(ctx, label, card.x + 24, y - 20, {
        size: 14, weight: 900, family: U.F.cn, fill: U.C.ink
      });
      U.text(ctx, sub, card.x + 24, y - 7, {
        size: 6, weight: 500, family: U.F.mono, fill: 'rgba(20,16,25,.42)'
      });
      U.text(ctx, Math.round(value * 100) + '%', card.x + card.w - 24, y - 20, {
        size: 16, weight: 900, family: U.F.mono, fill: color, align: 'right'
      });

      ctx.fillStyle = 'rgba(20,16,25,.14)';
      ctx.fillRect(rect.x, y, rect.w, rect.h);
      ctx.fillStyle = color;
      ctx.fillRect(rect.x, y, rect.w * value, rect.h);
      ctx.fillStyle = U.C.ink;
      for (var i = 1; i < 10; i++) {
        ctx.fillRect(rect.x + rect.w * i / 10 - .5, y - 3, 1, rect.h + 6);
      }
      var kx = rect.x + rect.w * value;
      ctx.save();
      ctx.fillStyle = U.C.cream;
      ctx.strokeStyle = U.C.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(kx, y + rect.h / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(kx, y + rect.h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    drawFooter: function (ctx, st) {
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      var hint = st.step === 'mode'
        ? '← → 选择模式　·　ENTER 进入精灵选择'
        : '方向键 选择　·　ENTER 确认　·　' + (st.versus ? '1 / 2 切换玩家　·　' : '') + 'ESC 返回';
      U.text(ctx, hint, W / 2, H - 39, {
        size: 8.5, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .58, align: 'center'
      });
      U.text(ctx, (CFG.VERSION ? CFG.VERSION + '　·　作者：初霁' : '作者：初霁'), W / 2, H - 17, {
        size: 7.2, weight: 500, family: U.F.cn, fill: U.C.ink, alpha: .45, align: 'center'
      });
      ctx.save();
      ctx.fillStyle = 'rgba(20,16,25,.55)';
      for (var i = 0; i < 22; i++) {
        var bw = (i % 4 === 0) ? 2 : 1;
        ctx.fillRect(634 + i * 3, H - 23, bw, 11);
      }
      ctx.restore();
    }
  };

  function BTN_X() { return (CFG.VIEW_W - BTN.w) / 2; }

  // 暴露给旧测试/调试的纯布局函数
  menu.modeRects = modeRects;
  menu.charRects = charRects;

})(window.BI = window.BI || {});
