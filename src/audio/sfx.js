/* ============================================================
 * sfx.js —— 音效（Web Audio 程序化合成，不用任何音频文件）
 *
 * 为什么全部用合成：
 *   音效一秒能响好几次，用音频文件会引入加载失败、路径错误、
 *   格式兼容、体积膨胀一堆问题。用振荡器 + 噪声直接合成，
 *   音效只有几十行代码，永不缺文件。
 *   （背景音乐走的另一条路：三首 ogg 由 music.js 管理，
 *     它们是长音频，边下边播比全量解码更划算。）
 *
 * ⚠️ 浏览器自动播放策略：
 *   AudioContext 必须在**用户第一次交互之后**才能创建或 resume()，
 *   否则会一直处于 suspended 状态 —— 表现就是「全程没声音」。
 *   所以 main.js 会在首次 keydown / mousedown 时调用 unlock()。
 *
 * 静音开关（M 键）在这里，但它是「音效 + 音乐」共用的：
 *   toggle() 会顺带通知 music.js 同步音量。
 * ============================================================ */
(function (BI) {
  'use strict';

  var sfx = BI.sfx = {
    ctx: null,
    master: null,
    noiseBuf: null,
    ready: false,
    failed: false,          // 环境不支持音频（无头浏览器等）就不再重试
    enabled: true,
    volume: 0.55,
    _last: {},              // 每个音效的上次播放时间，用于限流

    /* ---------------- 初始化 ---------------- */

    unlock: function () {
      if (sfx.failed) return false;
      try {
        if (!sfx.ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) { sfx.failed = true; return false; }
          sfx.ctx = new AC();
          sfx.master = sfx.ctx.createGain();
          sfx.master.gain.value = sfx.enabled ? sfx.volume : 0;
          sfx.master.connect(sfx.ctx.destination);
          sfx.noiseBuf = sfx.makeNoise();
        }
        if (sfx.ctx.state === 'suspended' && sfx.ctx.resume) sfx.ctx.resume();
        sfx.ready = true;
        return true;
      } catch (e) {
        sfx.failed = true;
        return false;
      }
    },

    /** 生成 1 秒白噪声，爆炸之类的"噪声类"音效都复用它 */
    makeNoise: function () {
      var ctx = sfx.ctx;
      var len = Math.floor(ctx.sampleRate * 1.0);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    },

    toggle: function () {
      sfx.enabled = !sfx.enabled;
      if (sfx.enabled) sfx.unlock();
      if (sfx.master) sfx.master.gain.value = sfx.enabled ? sfx.volume : 0;
      // 静音是全局的：背景音乐跟着一起静/响（music.js 可能没加载）
      if (BI.music && BI.music.syncMute) BI.music.syncMute();
      return sfx.enabled;
    },

    status: function () {
      if (sfx.failed) return '音效不可用';
      if (!sfx.ready) return '音效待激活';
      return sfx.enabled ? '音效开' : '音效关';
    },

    /* ---------------- 两种基础发声 ---------------- */

    /** 限流：同一个音效 30ms 内只响一次，避免连爆时声音糊成一团 */
    allow: function (name) {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (sfx._last[name] && now - sfx._last[name] < 30) return false;
      sfx._last[name] = now;
      return true;
    },

    /** 振荡器音：从 from 滑到 to */
    tone: function (opt) {
      var ctx = sfx.ctx;
      var t0 = ctx.currentTime + (opt.delay || 0);
      var dur = opt.dur || 0.1;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = opt.type || 'square';
      osc.frequency.setValueAtTime(Math.max(1, opt.from), t0);
      if (opt.to && opt.to !== opt.from) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.to), t0 + dur);
      }
      // 用指数包络做出"敲一下"的感觉（首尾都不能是 0，指数斜坡不接受 0）
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opt.vol || 0.2), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(sfx.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },

    /** 噪声音：白噪声 + 低通扫频，用来做爆炸、碎裂 */
    noise: function (opt) {
      var ctx = sfx.ctx;
      var t0 = ctx.currentTime + (opt.delay || 0);
      var dur = opt.dur || 0.3;
      var src = ctx.createBufferSource();
      src.buffer = sfx.noiseBuf;
      var filt = ctx.createBiquadFilter();
      filt.type = opt.filter || 'lowpass';
      filt.frequency.setValueAtTime(Math.max(40, opt.from || 900), t0);
      filt.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to || 80), t0 + dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(opt.vol || 0.35, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filt); filt.connect(g); g.connect(sfx.master);
      src.start(t0);
      src.stop(t0 + dur + 0.03);
    },

    /** 一串音符 */
    notes: function (freqs, opt) {
      opt = opt || {};
      var step = opt.step || 0.09;
      var type = opt.type || 'triangle';
      var vol = opt.vol || 0.2;
      var dur = opt.dur || step * 1.6;
      for (var i = 0; i < freqs.length; i++) {
        sfx.tone({ type: type, from: freqs[i], to: freqs[i], dur: dur, vol: vol, delay: i * step });
      }
    },

    /* ---------------- 音效表 ---------------- */

    play: function (name, opt) {
      if (!sfx.ready || !sfx.enabled || sfx.failed) return;
      if (!sfx.allow(name)) return;
      try {
        switch (name) {

          case 'place':                    // 放炸弹：短促"嘟"
            sfx.tone({ type: 'square', from: 300, to: 120, dur: 0.09, vol: 0.20 });
            break;

          case 'explode':                  // 爆炸：噪声下沉 + 低频轰
            sfx.noise({ from: 900, to: 70, dur: 0.38, vol: 0.42 });
            sfx.tone({ type: 'sine', from: 180, to: 48, dur: 0.30, vol: 0.24 });
            break;

          case 'enemyBomb':                // 敌人放弹：音调更低，一听就知道不是自己放的
            sfx.tone({ type: 'sawtooth', from: 200, to: 90, dur: 0.10, vol: 0.16 });
            break;

          case 'pickup':                   // 吃道具：上行三音"叮咚"
            sfx.notes([523, 659, 784], { step: 0.055, dur: 0.10, vol: 0.18 });
            break;

          case 'death':                    // 角色死亡：下行滑音
            sfx.tone({ type: 'sawtooth', from: 600, to: 90, dur: 0.50, vol: 0.26 });
            sfx.noise({ from: 500, to: 100, dur: 0.30, vol: 0.16, delay: 0.05 });
            break;

          case 'shieldBreak':              // 护盾碎裂：高频噪声 + 下行
            sfx.noise({ from: 3200, to: 700, dur: 0.20, vol: 0.28, filter: 'bandpass' });
            sfx.tone({ type: 'triangle', from: 900, to: 320, dur: 0.18, vol: 0.18 });
            break;

          case 'enemyHit':                 // 敌人挨了一下但没死
            sfx.tone({ type: 'square', from: 520, to: 260, dur: 0.08, vol: 0.16 });
            break;

          case 'itemBurn':                 // 道具被火焰烧掉
            sfx.noise({ from: 1400, to: 300, dur: 0.18, vol: 0.20, filter: 'bandpass' });
            sfx.tone({ type: 'triangle', from: 420, to: 160, dur: 0.16, vol: 0.14 });
            break;

          case 'enemyDie':                 // 敌人被打死
            sfx.tone({ type: 'square', from: 420, to: 110, dur: 0.22, vol: 0.20 });
            sfx.tone({ type: 'triangle', from: 700, to: 200, dur: 0.18, vol: 0.14, delay: 0.05 });
            break;

          case 'levelClear':               // 过关：上行五音小旋律
            sfx.notes([523, 659, 784, 1047, 1319], { step: 0.10, dur: 0.20, vol: 0.22 });
            break;

          case 'win':                      // 胜利：小旋律 + 收尾和弦
            sfx.notes([523, 659, 784, 1047], { step: 0.11, dur: 0.22, vol: 0.24 });
            sfx.notes([1047, 1319, 1568], { step: 0.0, dur: 0.55, vol: 0.16, delay: 0.5 });
            break;

          case 'lose':                     // 失败：下行四音
            sfx.notes([440, 392, 330, 262], { step: 0.14, dur: 0.30, vol: 0.22, type: 'sawtooth' });
            break;

          case 'menuMove':                 // 菜单选择：极短"嗒"
            sfx.tone({ type: 'square', from: 700, to: 700, dur: 0.035, vol: 0.10 });
            break;

          case 'menuConfirm':              // 菜单确认：两音上行
            sfx.tone({ type: 'square', from: 660, to: 660, dur: 0.07, vol: 0.16 });
            sfx.tone({ type: 'square', from: 990, to: 990, dur: 0.13, vol: 0.16, delay: 0.07 });
            break;

          case 'pause':                    // 暂停 / 继续
            sfx.tone({ type: 'triangle', from: 500, to: 300, dur: 0.13, vol: 0.15 });
            break;

          case 'sudden':                   // 死亡加速警告
            sfx.tone({ type: 'sawtooth', from: 300, to: 900, dur: 0.35, vol: 0.20 });
            break;

          case 'tick':                     // 倒计时最后几秒
            sfx.tone({ type: 'square', from: 880, to: 880, dur: 0.05, vol: 0.09 });
            break;
        }
      } catch (e) {
        // 音频出问题绝不能影响游戏运行
      }
    }
  };

})(window.BI = window.BI || {});
