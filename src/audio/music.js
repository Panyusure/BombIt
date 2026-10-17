/* ============================================================
 * music.js —— 背景音乐（三首 ogg，按场景切换）
 *
 *   菜单     → 天空之城（八音盒版）
 *   关卡对局 → カノン（八音盒版）
 *   BOSS 战  → 欢乐斗地主背景音乐
 *
 * 音效依旧是程序化合成（见 sfx.js），这里只管这三首曲子。
 *
 * 为什么用 HTMLAudioElement 而不是 Web Audio：
 *   曲子是几 MB 的文件，Audio 元素能边下边播、缓存和并发都交给浏览器，
 *   不必把整首解码进内存，也不用额外接线。
 *
 * ⚠️ 浏览器自动播放策略：
 *   页面在用户交互之前调 play()，浏览器会拒绝（NotAllowedError）。
 *   所以这里**加载完就直接试一次**：浏览器放行（用启动器带着
 *   --autoplay-policy=no-user-gesture-required 打开、或浏览器设置允许）
 *   就立刻出声；被拦下也不抛异常，只把 blocked 置位，main.js 据此
 *   在每次 keydown / mousedown / touchstart 时调 unlock() 补播，
 *   直到真的响起来 —— 声音问题绝不能影响游戏运行。
 *
 * 设计约束：曲目完全由场景推导（trackFor），主循环每帧调一次 play()，
 *   重复调用同一首必须没有任何副作用（不能重头播、不能重新下载）。
 * ============================================================ */
(function (BI) {
  'use strict';

  var TRACKS = {
    menu:  { file: 'assets/audio/纯音乐 - 天空之城 (八音盒版).ogg',      title: '天空之城',   volume: .32 },
    level: { file: 'assets/audio/纯音乐 - カノン (八音盒版).ogg',        title: 'カノン',     volume: .32 },
    boss:  { file: 'assets/audio/纯音乐 - 欢乐斗地主背景音乐 (Inst_).ogg', title: '欢乐斗地主', volume: .28 }
  };

  var FADE_IN = 1.4;    // 秒：新曲淡入
  var FADE_OUT = .7;    // 秒：旧曲淡出（叠一点交叉感）

  /**
   * 用本文件自己的 URL 反推项目根目录。
   * index.html 在根目录、tests/browser.html 与 tools/showcase.html 各深一层，
   * 写死相对路径的话总有一个页面找不到曲子。
   */
  function scriptBase() {
    if (typeof document === 'undefined') return '';
    try {
      var el = document.currentScript ||
        (document.scripts && document.scripts[document.scripts.length - 1]);
      if (el && el.src) return el.src.replace(/src\/audio\/music\.js.*$/, '');
    } catch (e) { /* 取不到就用相对路径兜底 */ }
    return '';
  }

  /** 静音是「音效 + 音乐」一起的，开关放在 sfx 上，这里只读它 */
  function audible() { return !(BI.sfx && BI.sfx.enabled === false); }

  var music = BI.music = {
    tracks: TRACKS,
    base: scriptBase(),

    id: null,             // 期望播放的曲目 id
    el: null,             // 当前 <audio>
    gain: 0,              // 淡入进度 0..1
    ready: false,         // 真的响起来了
    blocked: false,       // 被自动播放策略拦下（NotAllowedError），等用户交互
    failed: false,        // 环境不支持（无头 / 没有 Audio）
    suspended: false,     // 暂停菜单 / 失焦
    lastError: null,

    _els: {},             // 曲目 id -> 复用的 Audio（切回来不重新下载）
    _dying: [],           // 正在淡出的旧曲

    srcFor: function (id) {
      return TRACKS[id] ? music.base + TRACKS[id].file : null;
    },

    /**
     * 场景 → 曲目。做成纯函数是为了能无头测试：
     * 只有菜单放天空之城，BOSS 关放欢乐斗地主，其余对局放カノン。
     * BOSS 曲要**鲁鲁旦还活着**才放：击败它之后哪怕小怪没清完也换回关卡曲。
     * 结算界面仍带着 world，所以继续放刚才那首，不会突然跳回菜单曲。
     */
    trackFor: function (state) {
      if (!state || state.scene === 'menu' || !state.world) return 'menu';
      return (state.bossBattle && state.bossAlive) ? 'boss' : 'level';
    },

    /** 曲目 id -> Audio 元素（惰性创建，同一首只建一次） */
    element: function (id) {
      if (music._els[id]) return music._els[id];
      var src = music.srcFor(id);
      if (!src || typeof window.Audio !== 'function') { music.failed = true; return null; }
      try {
        var el = new window.Audio(src);
        el.loop = true;
        el.preload = 'auto';
        el.volume = 0;
        el.addEventListener('error', function () {
          music.lastError = TRACKS[id].title + ' 加载失败';
        });
        music._els[id] = el;
        return el;
      } catch (e) {
        music.failed = true;
        return null;
      }
    },

    /** 点歌：想听哪首调哪首；重复调同一首是空操作（主循环每帧都会调） */
    play: function (id) {
      if (music.failed || !TRACKS[id]) return false;
      if (music.id === id && music.el) return true;
      var el = music.element(id);
      if (!el) return false;
      music.id = id;
      if (music.el && music.el !== el) music._retire(music.el);
      music.el = el;
      music.gain = 0;                       // 新曲从 0 淡入，不硬切
      music._start(el);
      return true;
    },

    /** 旧曲交给淡出队列，音量归零后暂停并回到开头 */
    _retire: function (el) {
      if (!el) return;
      for (var i = 0; i < music._dying.length; i++) if (music._dying[i].el === el) return;
      // 淡出速度按这首曲子自己的基准音量算，交叉时两边的下降感才一致
      var base = .32;
      for (var id in music._els) if (music._els[id] === el && TRACKS[id]) base = TRACKS[id].volume;
      music._dying.push({ el: el, level: el.volume || 0, base: base });
    },

    /**
     * 起播。调用点有两个：① 加载完 / 换曲时直接试（浏览器放行就立刻响）；
     * ② 用户交互后由 unlock() 补一次（被策略拦下的情况）。
     * 拒绝原因是 NotAllowedError 才叫「等交互」，别的（暂停打断的 AbortError、
     * 格式不支持）都不该在界面上喊「点一下就开始」。
     */
    _start: function (el) {
      if (!el || music.suspended) return;
      var p;
      try { p = el.play(); } catch (e) { music.blocked = true; return; }
      if (p && p.then) {
        p.then(function () { music.ready = true; music.blocked = false; },
               function (err) {
                 var name = (err && err.name) || '';
                 music.ready = false;
                 if (name === 'NotAllowedError') { music.blocked = true; music.lastError = null; return; }
                 music.blocked = false;
                 if (name === 'AbortError') return;      // pause() 打断了还没兑现的 play()，正常
                 music.lastError = (TRACKS[music.id] ? TRACKS[music.id].title : '音乐') +
                                   ' 播放失败（' + (name || err) + '）';
               });
      } else {
        music.ready = true;
        music.blocked = false;
      }
    },

    /** 用户交互后补播被自动播放策略拦下的那首（会一直重试到真的响） */
    unlock: function () {
      if (music.failed || !music.id || music.suspended) return false;
      var el = music.el || music.element(music.id);
      if (!el) return false;
      music.el = el;
      music._start(el);
      return true;
    },

    /** 是不是在等玩家交互（被自动播放策略拦下）。main.js 据此决定还要不要留着监听继续补播 */
    waiting: function () {
      return !music.failed && !music.lastError && !!music.id && !music.ready && music.blocked;
    },

    /** 暂停菜单 / 失焦：直接停住，回来再接着放（不做淡入淡出，要的就是立刻安静） */
    setSuspended: function (on) {
      on = !!on;
      if (on === music.suspended) return;
      music.suspended = on;
      if (!music.el) return;
      if (on) { try { music.el.pause(); } catch (e) {} }
      else music._start(music.el);
    },

    /** 静音开关（M 键）切完后同步过来：立刻生效，不等淡入淡出的下一帧 */
    syncMute: function () {
      var on = audible();
      if (music.el && music.id) music.el.volume = on ? music.gain * TRACKS[music.id].volume : 0;
      for (var i = 0; i < music._dying.length; i++) {
        music._dying[i].el.volume = on ? music._dying[i].level : 0;
      }
    },

    /** 每逻辑帧推进淡入淡出（音量按秒线性走，简单且不会出现爆音） */
    update: function (dt) {
      if (music.failed) return;
      dt = Math.min(dt > 0 ? dt : 0, .25);
      for (var i = music._dying.length - 1; i >= 0; i--) {
        var d = music._dying[i];
        d.level = Math.max(0, d.level - dt / FADE_OUT * d.base);
        d.el.volume = audible() ? d.level : 0;
        if (d.level <= 0) {
          try { d.el.pause(); d.el.currentTime = 0; } catch (e) {}
          music._dying.splice(i, 1);
        }
      }
      if (!music.el || !music.id || music.suspended) return;
      if (music.gain < 1) music.gain = Math.min(1, music.gain + dt / FADE_IN);
      music.el.volume = audible() ? music.gain * TRACKS[music.id].volume : 0;
    },

    /** 彻底停掉（当前没有调用点，留给调试与将来的「返回标题」） */
    stop: function () {
      music.id = null;
      if (music.el) { music._retire(music.el); music.el = null; }
      for (var i = 0; i < music._dying.length; i++) {
        try { music._dying[i].el.pause(); } catch (e) {}
      }
      music._dying.length = 0;
      music.gain = 0;
    },

    status: function () {
      if (music.failed) return '音乐不可用';
      if (music.lastError) return music.lastError;
      if (!music.id) return '音乐待机';
      if (!audible()) return '音乐已静音';
      if (music.waiting()) return '音乐待交互';
      if (!music.ready) return '音乐缓冲中';
      return '音乐：' + TRACKS[music.id].title;
    }
  };

  // 这里不主动播任何东西：曲目由 main.js 按场景推出来（syncMusic），
  // 它在 boot() 和每个逻辑帧都会调一次 play()，所以加载完就会试播。
})(window.BI = window.BI || {});
