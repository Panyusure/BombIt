/* ============================================================
 * rng.js —— 可复现随机数
 * 带种子的随机数：同一个种子永远生成同一张地图，
 * 方便复现 bug（把种子显示在 HUD 上，出问题报种子即可）。
 * ============================================================ */
(function (BI) {
  'use strict';

  /** mulberry32：小巧快速、质量够用的 32 位 PRNG */
  BI.makeRng = function (seed) {
    var a = (seed >>> 0) || 1;
    var fn = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // A saved match resumes the random stream instead of starting it again.
    fn.getState = function () { return a >>> 0; };
    fn.setState = function (state) { a = state >>> 0; return fn; };
    /** [0, n) 整数 */
    fn.int = function (n) { return Math.floor(fn() * n); };
    /** [min, max] 整数 */
    fn.range = function (min, max) { return min + Math.floor(fn() * (max - min + 1)); };
    /** 概率 p 为真 */
    fn.chance = function (p) { return fn() < p; };
    /** 从数组里随机取一个 */
    fn.pick = function (arr) { return arr[Math.floor(fn() * arr.length)]; };
    /** 原地洗牌 */
    fn.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(fn() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    return fn;
  };

  /** 把任意字符串转成 32 位种子（用于按"关卡+模式"生成稳定地图） */
  BI.hashSeed = function (str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  /** 生成一个人类可读的随机种子（如 "8F3K2Q"），方便口头报给开发者 */
  BI.randomSeed = function () {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

})(window.BI = window.BI || {});
