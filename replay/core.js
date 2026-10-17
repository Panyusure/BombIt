/* Frame-accurate, seekable playback of the same actions used by the CLI. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BombItReplay = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  var DIRS = { none: [0, 0], up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var STOPS = ['onDeath', 'level_started', 'round_started', 'match_over'];
  function check(ok, message) { if (!ok) throw new Error(message); }
  function unpack(value) {
    var data = value && value.replay || value;
    check(data && ['bombit-replay/1', 'bombit-session/1'].includes(data.format), '请选择 BombIt 回放或会话 JSON 文件。');
    check(data.engineVersion === '2', '此回放需要另一版本的游戏规则，当前播放器支持引擎版本 2。');
    check(data.config && ['dig', 'adventure', 'versus'].includes(data.config.mode) &&
      typeof data.config.seed === 'string' && Array.isArray(data.config.chars) &&
      data.config.chars.every(function (id) { return ['xiaonuo','axiu','arui','xiaoyan','xiaotian','weilai'].includes(id); }), '回放的开局配置无效。');
    check(Array.isArray(data.history), '回放缺少动作记录。');
    data.history.forEach(function (entry, i) {
      check(entry && entry.action && Number.isInteger(entry.action.frames) && entry.action.frames >= 1 && entry.action.frames <= 60 &&
        Number.isInteger(entry.advancedFrames) && entry.advancedFrames >= 1 && entry.advancedFrames <= entry.action.frames, '第 ' + (i + 1) + ' 步的帧数无效。');
      var actions = entry.action.actions;
      check(actions && typeof actions === 'object' && !Array.isArray(actions), '动作记录格式无效。');
      Object.keys(actions).forEach(function (id) {
        var a = actions[id];
        check((id === 'p1' || id === 'p2' && data.config.mode === 'versus') && a && Object.hasOwn(DIRS, a.move) &&
          typeof a.bomb === 'boolean' && typeof a.skill === 'boolean', '动作记录包含无效输入。');
      });
      check(typeof entry.hash === 'string' && /^[0-9a-f]{64}$/.test(entry.hash), '动作记录缺少校验信息。');
    });
    return data;
  }
  function Player(BI, value) {
    this.BI = BI; this.data = unpack(value);
    this.totalFrames = this.data.history.reduce(function (n, entry) { return n + entry.advancedFrames; }, 0);
    this.checkpoints = []; this.markers = []; this.verified = false; this.seeking = false;
    this.reset();
  }
  Player.prototype.reset = function () {
    this.world = this.BI.engine.create(this.data.config); this.world.briefing = null;
    this.index = 0; this.offset = 0;
  };
  Player.prototype.tick = function () {
    if (this.index >= this.data.history.length) return [];
    var entry = this.data.history[this.index], inputs = {};
    Object.keys(entry.action.actions).forEach(function (id) {
      var a = entry.action.actions[id], dir = DIRS[a.move];
      inputs[id] = { hx: dir[0], hy: dir[1], bomb: !this.offset && a.bomb, skill: !this.offset && a.skill, quietBlocked: true };
    }, this);
    var before = this.world.frame, events = this.BI.engine.step(this.world, inputs, this.BI.engine.STEP);
    this.world.briefing = null;
    check(this.world.frame === before + 1, '回放提前结束：游戏规则与记录不一致。');
    this.offset++;
    var stopped = events.some(function (event) { return STOPS.includes(event.type); });
    if (stopped || this.offset === entry.action.frames || this.offset === entry.advancedFrames) {
      check(this.offset === entry.advancedFrames && (stopped || this.offset === entry.action.frames), '第 ' + (this.index + 1) + ' 步的实际时长与记录不一致。');
      this.index++; this.offset = 0;
    }
    if (this.onFrame && !this.seeking) this.onFrame(events);
    return events;
  };
  Player.prototype.build = async function (digest, progress) {
    check(typeof digest === 'function', '浏览器无法执行回放校验，请使用新版 Edge 或 Chrome。');
    this.reset(); this.markers = [{ frame: 0, label: this.world.mode === 'adventure' ? '第 1 关' : '开局', type: 'start' }];
    this.checkpoints = [{ frame: 0, index: 0, snapshot: this.BI.snapshot.save(this.world) }];
    this.seeking = true;
    try {
      while (this.index < this.data.history.length) {
        var entryIndex = this.index, special = false;
        while (this.index === entryIndex) {
          var events = this.tick();
          events.forEach(function (event) {
            var label;
            if (event.type === 'level_started') label = '第 ' + event.level + ' 关';
            if (event.type === 'round_started') label = '第 ' + event.round + ' 回合';
            if (event.type === 'onDeath') label = '阵亡 · 剩 ' + event.lives + ' 命';
            if (event.type === 'match_over') label = this.world.match.winner === 'p1' ? '挑战完成' : '对局结束';
            if (label) { this.markers.push({ frame: this.world.frame, label: label, type: event.type }); special = true; }
          }, this);
        }
        var snapshot = this.BI.snapshot.save(this.world), actual = await digest(snapshot);
        check(actual === this.data.history[entryIndex].hash, '第 ' + (entryIndex + 1) + ' 步校验失败，无法保证画面与原对局一致。');
        if (special || this.world.frame - this.checkpoints[this.checkpoints.length - 1].frame >= 300) {
          this.checkpoints.push({ frame: this.world.frame, index: this.index, snapshot: snapshot });
        }
        if (progress && (this.index % 50 === 0 || this.index === this.data.history.length)) await progress(this.index, this.data.history.length);
      }
      this.finalHash = await digest(this.BI.snapshot.save(this.world));
      check(!this.data.finalHash || this.finalHash === this.data.finalHash, '最终局面校验失败。');
      this.finalState = this.BI.observe(this.world, false); this.verified = true;
      this.seek(0);
      return this;
    } finally { this.seeking = false; }
  };
  Player.prototype.seek = function (frame) {
    check(this.checkpoints.length > 0, '回放尚未准备好。');
    frame = Math.max(0, Math.min(this.totalFrames, Math.round(frame)));
    var checkpoint = this.checkpoints[0];
    for (var i = 1; i < this.checkpoints.length && this.checkpoints[i].frame <= frame; i++) checkpoint = this.checkpoints[i];
    this.world = this.BI.snapshot.load(checkpoint.snapshot);
    this.index = checkpoint.index; this.offset = 0; this.seeking = true;
    try { while (this.world.frame < frame) this.tick(); }
    finally { this.seeking = false; }
    return this.world;
  };
  return { Player: Player, unpack: unpack };
});
