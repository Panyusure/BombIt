/* ============================================================
 * input.js —— 键位映射 + 按键状态 + 失焦清理
 *
 * 关键设计：键位「按模式查表」，绝不写死。
 * 因为同一个 1P 在单人模式用空格放弹、在双人模式改用 Enter。
 * ============================================================ */
(function (BI) {
  'use strict';

  /* 用 e.code（物理键位）而非 e.key，切换输入法/大小写都不受影响。
   *
   * 一个动作可以绑多个键：写字符串是单键，写数组是多键（任意一个成立即算按下）。
   * 单人模式的移动就是这样 —— 方向键和 WASD 同时可用，
   * 因为单人只有 1P，不存在"WASD 该算谁的"歧义（双人模式下 WASD 归 2P，不能混）。
   */
  var KEYMAPS = {
    // 单人：方向键或 WASD 移动，空格放炸弹
    solo: {
      p1: {
        up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
        left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
        bomb: 'Space', skill: 'KeyQ'
      }
    },
    // 双人：1P 方向键 + Enter；2P WASD + 空格
    versus: {
      p1: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', bomb: 'Enter', skill: 'ShiftRight' },
      p2: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', bomb: 'Space', skill: 'KeyF' }
    },
    // 1P 备用键位：廉价键盘方向键无冲丢键时切换用（WASD 依旧可用）
    soloAlt: {
      p1: {
        up: ['KeyI', 'KeyW'], down: ['KeyK', 'KeyS'],
        left: ['KeyJ', 'KeyA'], right: ['KeyL', 'KeyD'],
        bomb: 'KeyU', skill: 'KeyO'
      }
    },
    versusAlt: {
      p1: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', bomb: 'KeyU', skill: 'KeyO' },
      p2: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', bomb: 'Space', skill: 'KeyF' }
    }
  };

  /** 动作键位统一成数组：映射表里写单键（字符串）或多键（数组）都能用 */
  function codesOf(binding) {
    if (!binding) return [];
    return typeof binding === 'string' ? [binding] : binding;
  }

  // 需要阻止默认行为的键（否则方向键滚页面、空格触发按钮）
  var SWALLOW = {
    ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    Space: 1, Enter: 1, Tab: 1,
    KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1,
    KeyI: 1, KeyJ: 1, KeyK: 1, KeyL: 1, KeyU: 1, KeyO: 1, KeyQ: 1, KeyF: 1, ShiftRight: 1
  };

  var input = BI.input = {
    down: Object.create(null),      // code -> true（持续按住）
    pressed: Object.create(null),   // code -> true（本帧刚按下，帧末清空）
    onBlur: null,                   // 由 main.js 挂上"自动暂停"回调
    anyKeySinceFocus: false,        // 用于"首次交互后才创建 AudioContext"

    /** 当前模式对应的键位表 */
    map: function (mode, alt) {
      if (mode === 'solo') return alt ? KEYMAPS.soloAlt : KEYMAPS.solo;
      return alt ? KEYMAPS.versusAlt : KEYMAPS.versus;
    },

    isDown: function (code) { return !!this.down[code]; },
    wasPressed: function (code) { return !!this.pressed[code]; },

    /** 某个动作绑定的所有键位（HUD 显示键位提示时也要用它） */
    codes: codesOf,

    /** 判断某个玩家动作是否按住（一个动作可能绑多个键，任意一个按住即算） */
    held: function (km, player, action) {
      var codes = codesOf(km[player][action]);
      for (var i = 0; i < codes.length; i++) if (this.down[codes[i]]) return true;
      return false;
    },
    /** 判断某个玩家动作是否本帧刚按下 */
    hit: function (km, player, action) {
      var codes = codesOf(km[player][action]);
      for (var i = 0; i < codes.length; i++) if (this.pressed[codes[i]]) return true;
      return false;
    },

    /** 清空全部按键状态（失焦时必须调用，否则角色会一直跑） */
    clear: function () {
      this.down = Object.create(null);
      this.pressed = Object.create(null);
    },

    /** 帧末清空"刚按下"边沿 */
    endFrame: function () {
      this.pressed = Object.create(null);
    }
  };

  BI.input.init = function () {
    var self = input;

    window.addEventListener('keydown', function (e) {
      if (SWALLOW[e.code]) e.preventDefault();
      if (e.repeat) return;              // 忽略系统连发，避免"按住不放"被当成连续新按下
      self.down[e.code] = true;
      self.pressed[e.code] = true;
      self.anyKeySinceFocus = true;
    }, { passive: false });

    window.addEventListener('keyup', function (e) {
      if (SWALLOW[e.code]) e.preventDefault();
      delete self.down[e.code];
    }, { passive: false });

    // 切出窗口 / 切标签页：清空按键并通知外部暂停
    function lostFocus() {
      self.clear();
      if (typeof self.onBlur === 'function') self.onBlur();
    }
    window.addEventListener('blur', lostFocus);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) lostFocus();
    });
    // 某些浏览器切回来时会残留按键，再兜一次
    window.addEventListener('focus', function () { self.clear(); });
  };

  /* ============================================================
   * 鼠标 —— 菜单要能用鼠标点，否则用起来很别扭。
   * 坐标统一换算到画布的「逻辑坐标系」（720x696），
   * 这样菜单代码不用关心画布被 CSS 缩放了多少、DPR 是多少。
   * ============================================================ */
  var mouse = BI.mouse = {
    x: -1, y: -1,
    inside: false,
    down: false,      // 当前是否按住
    clicked: false,   // 本帧刚点下（边沿，帧末清空）
    moved: false      // 本帧是否移动过（用来决定要不要画鼠标悬停态）
  };

  BI.input.initMouse = function (canvas, viewW, viewH) {
    function toLogical(e) {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      mouse.x = (e.clientX - r.left) / r.width * viewW;
      mouse.y = (e.clientY - r.top) / r.height * viewH;
      mouse.inside = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= viewW && mouse.y <= viewH;
      mouse.moved = true;
    }
    canvas.addEventListener('mousemove', toLogical);
    canvas.addEventListener('mousedown', function (e) {
      toLogical(e);
      mouse.down = true;
      mouse.clicked = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', function () { mouse.down = false; });
    canvas.addEventListener('mouseleave', function () { mouse.inside = false; });
    // 触摸也当成一次点击，方便触屏笔记本
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches[0]) { toLogical(e.touches[0]); mouse.down = true; mouse.clicked = true; }
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', function () { mouse.down = false; });
  };

  /** 帧末清理鼠标边沿 */
  BI.input.endMouseFrame = function () {
    mouse.clicked = false;
    mouse.moved = false;
  };

  /** 命中测试：点是否落在矩形里 */
  BI.input.hitRect = function (x, y, w, h) {
    return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  };

})(window.BI = window.BI || {});
