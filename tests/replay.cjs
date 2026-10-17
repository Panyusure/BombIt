'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runtime, ROOT } = require('../cli/runtime.cjs');
const { hash } = require('../cli/session.cjs');
const { create, normalizeConfig, normalizeAction, advance } = require('../cli/game.cjs');
const { Player } = require('../replay/core.js');
const storage = require('../cli/storage.cjs');
const scratch = storage.scratch('replay');
test.after(() => storage.removeInside(storage.locations().tests, scratch));
function fixture(mode = 'adventure') {
  const BI = runtime(), config = normalizeConfig({ mode, seed: 'replay-test' }), w = create(BI, config), history = [], snapshots = [];
  for (let i = 0; i < 80 && !w.match.over; i++) {
    const action = normalizeAction(w, { move: ['right','down','left','up'][Math.floor(i/4)%4],
      bomb: i % 10 === 0, skill: i % 15 === 0, frames: 12 });
    const result = advance(BI, w, action), snapshot = BI.snapshot.save(w);
    history.push({ revision: i + 1, action, advancedFrames: result.advancedFrames, hash: hash(snapshot) }); snapshots.push(snapshot);
  }
  return { data: { format: 'bombit-replay/1', engineVersion: '2', config, history,
    finalHash: hash(BI.snapshot.save(w)) }, snapshots, final: BI.observe(w) };
}
test('browser replay core reproduces CLI action boundaries and final hash in all modes', async () => {
  for (const mode of ['dig','adventure','versus']) {
    const f = fixture(mode), B = runtime(), p = new Player(B, f.data); await p.build(hash);
    assert.equal(p.verified, true); assert.equal(p.world.frame, 0);
    p.seek(p.totalFrames); assert.equal(hash(B.snapshot.save(p.world)), f.data.finalHash);
    assert.equal(p.index, f.data.history.length);
    assert.deepEqual(JSON.parse(JSON.stringify(p.finalState)), JSON.parse(JSON.stringify(f.final)));
  }
});
test('backward and partial-action seeking preserves pulses, exact frames and subsequent playback', async () => {
  const f = fixture(), B = runtime(), p = new Player(B, f.data); await p.build(hash);
  const frames = [1, 12, 13, 300, p.totalFrames - 1, 41, 0, 19];
  for (const frame of frames) {
    p.seek(frame); assert.equal(p.world.frame, frame);
    while (p.index < p.data.history.length) p.tick();
    assert.equal(hash(B.snapshot.save(p.world)), f.data.finalHash);
  }
});
test('replay imports export wrappers and sessions, and rejects corrupt or incompatible records', async () => {
  const f = fixture(), B = runtime();
  await new Player(B, { ok: true, replay: f.data }).build(hash);
  await new Player(B, { ...f.data, format: 'bombit-session/1' }).build(hash);
  const corrupt = JSON.parse(JSON.stringify(f.data)); corrupt.history[2].hash = '0'.repeat(64);
  await assert.rejects(() => new Player(B, corrupt).build(hash), /第 3 步校验失败/);
  assert.throws(() => new Player(B, { ...f.data, engineVersion: '1' }), /版本/);
  assert.throws(() => new Player(B, { format: 'unknown' }), /JSON/);
  const invalid = JSON.parse(JSON.stringify(f.data)); invalid.history[0].action.actions.p1.move = 'teleport';
  assert.throws(() => new Player(B, invalid), /无效输入/);
});
test('empty replay can be verified and viewed', async () => {
  const B = runtime(), config = normalizeConfig({ seed: 'empty' }), w = create(B, config);
  const p = new Player(B, { format: 'bombit-replay/1', engineVersion: '2', config, history: [], finalHash: hash(B.snapshot.save(w)) });
  await p.build(hash); p.seek(100);
  assert.equal(p.world.frame, 0); assert.equal(p.verified, true);
});
test('browser preparation exports a fresh verified bundle without modifying its source', async () => {
  const f = fixture('dig'), folder = scratch;
  const file = path.join(folder, 'watch-test.replay.json'), bytes = JSON.stringify(f.data);
  fs.writeFileSync(file, bytes);
  const url = await require('../cli/watch.cjs').prepare({ file, cacheDirectory: path.join(scratch,'cache') });
  assert.match(url, /replay\.html\?bundle=/); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});
module.exports = { fixture };
