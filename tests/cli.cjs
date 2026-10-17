'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runtime, ROOT } = require('../cli/runtime.cjs');
const { normalizeConfig, create, normalizeAction, advance } = require('../cli/game.cjs');
const { handle, hash, sessionPath } = require('../cli/session.cjs');
const storage = require('../cli/storage.cjs');
const scratch = storage.scratch('cli'), directory = path.join(scratch, 'sessions');
test.after(() => storage.removeInside(storage.locations().tests, scratch));
const plain = value => JSON.parse(JSON.stringify(value));
function world(B, mode = 'dig', character = 'xiaonuo', seed = 'test') {
  return create(B, normalizeConfig({ mode, character, seed }));
}
function act(B, w, request) { return advance(B, w, normalizeAction(w, request)); }
function openMap(B, w) {
  w.map.landmark = null;
  for (let r = 1; r < B.grid.rows(w.map) - 1; r++) for (let c = 1; c < B.grid.cols(w.map) - 1; c++) B.grid.set(w.map, c, r, B.T.EMPTY);
  B.grid.set(w.map, 13, 11, B.T.BRICK); // keep dig running during focused simulations
}
test('cross-process new/state/act/replay; read-only observation does not change saved time', () => {
  const run = (...args) => {
    const p = spawnSync(process.execPath, ['cli/bombit.cjs', ...args, '--session-dir', directory, '--json'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(p.status, 0, p.stdout + p.stderr); assert.equal(p.stderr, '');
    return JSON.parse(p.stdout);
  };
  const start = run('new', '--session', 'cross', '--mode', 'adventure', '--seed', 'demo');
  const bytes = fs.readFileSync(sessionPath('cross', directory), 'utf8');
  for (let i = 0; i < 2; i++) assert.deepEqual(run('state', '--session', 'cross').state, start.state);
  run('state', '--session', 'cross', '--assist');
  assert.equal(fs.readFileSync(sessionPath('cross', directory), 'utf8'), bytes);
  const bomb = run('act', '--session', 'cross', '--bomb', '--frames', '12');
  assert.equal(bomb.advancedFrames, 12); assert.equal(bomb.state.bombs.length, 1);
  const move = run('act', '--session', 'cross', '--move', 'down', '--frames', '12');
  assert.ok(move.state.players[0].y > bomb.state.players[0].y);
  assert.equal(run('replay', '--session', 'cross').verified, true);
});
test('snapshot continuation matches uninterrupted AI, skills and bombs for every character', () => {
  for (const character of ['xiaonuo', 'axiu', 'arui', 'xiaoyan', 'xiaotian', 'weilai']) {
    const B = runtime(), w = world(B, 'adventure', character);
    act(B, w, { bomb: true, frames: 1 }); act(B, w, { move: 'down', skill: true, frames: 12 });
    const other = runtime(), restored = other.snapshot.load(plain(B.snapshot.save(w)));
    for (let i = 0; i < 25; i++) {
      const request = { move: ['right', 'down', 'left', 'up'][i % 4], frames: 12, bomb: i % 6 === 0, skill: i % 7 === 0 };
      act(B, w, request); act(other, restored, request);
      assert.equal(hash(B.snapshot.save(w)), hash(other.snapshot.save(restored)), `${character} step ${i}`);
    }
  }
});
test('snapshots preserve array metadata, shared pending death references and random stream', () => {
  const B = runtime(), w = world(B);
  w.pendingDeaths = [w.players[0]]; w.map.cols = 15; w.map.rows = 13;
  w.map.revision = 8; w.map.bossBattle = true;
  const r = B.snapshot.load(plain(B.snapshot.save(w)));
  assert.equal(r.pendingDeaths[0], r.players[0]);
  assert.equal(r.map.cols, 15); assert.equal(r.map.revision, 8); assert.equal(r.map.bossBattle, true);
  assert.deepEqual(plain(r.map.landmark), plain(w.map.landmark));
  assert.deepEqual(Array.from(r.map.variants), Array.from(w.map.variants));
  assert.equal(r.rng(), w.rng());
});
test('safe retries, stale revision, validation and occupied sessions never apply extra actions', () => {
  const B = runtime(), req = { session: 'retry' };
  handle(B, { ...req, op: 'new', mode: 'dig', seed: 'retry' }, directory);
  const action = { ...req, op: 'act', move: 'right', frames: 12, requestId: 'one', expectRevision: 0 };
  const first = handle(B, action, directory), second = handle(B, action, directory);
  assert.equal(second.duplicate, true); assert.equal(second.state.frame, first.state.frame);
  const saved = () => fs.readFileSync(sessionPath('retry', directory), 'utf8');
  const bytes = saved();
  for (const bad of [{ frames: 0 }, { frames: 61 }, { frames: 1.5 }, { move: 'diagonal' }, { player: 'p3' },
    { skill: 'true' }, { wait: true, bomb: true }, { expectRevision: 0 }, { actions: { p1: { teleport: true } } }]) {
    assert.throws(() => handle(B, { ...req, op: 'act', ...bad }, directory)); assert.equal(saved(), bytes);
  }
  assert.throws(() => handle(B, { ...action, move: 'left' }, directory), /different action/);
  assert.throws(() => handle(B, { ...req, op: 'new' }, directory), /already exists/);
  handle(B, { ...req, op: 'act', wait: true, frames: 1 }, directory);
  assert.throws(() => handle(B, action, directory), /applied at revision/);
  assert.throws(() => handle(B, { op: 'state', session: '../outside' }, directory), /session must/);
});
test('JSONL handles errors and keeps reading; multiple games remain isolated', () => {
  const requests = [JSON.stringify({ op: 'new', session: 'pipe1', mode: 'versus', seed: 'pipe' }), '{bad',
    JSON.stringify({ op: 'new', session: 'pipe2', mode: 'versus', seed: 'pipe' }),
    JSON.stringify({ op: 'act', session: 'pipe1', frames: 12, actions: { p1: { bomb: true }, p2: { bomb: true } } }),
    JSON.stringify({ op: 'state', session: 'pipe2' })];
  const p = spawnSync(process.execPath, ['cli/bombit.cjs', 'serve', '--session-dir', directory],
    { cwd: ROOT, input: requests.join('\n') + '\n', encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr);
  const lines = p.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, requests.length); assert.equal(lines[1].error.code, 'INVALID_JSON');
  assert.equal(lines[3].state.bombs.length, 2); assert.equal(lines[4].state.frame, 0);
});
test('session lock rejects simultaneous mutation while allowing a consistent read', () => {
  const B = runtime();
  handle(B, { op: 'new', session: 'locked', mode: 'dig', seed: 'lock' }, directory);
  const file = sessionPath('locked', directory), before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file + '.lock', String(process.pid));
  try {
    assert.throws(() => handle(B, { op: 'act', session: 'locked', wait: true }, directory), { code: 'SESSION_BUSY' });
    assert.equal(handle(B, { op: 'state', session: 'locked' }, directory).state.frame, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally { fs.unlinkSync(file + '.lock'); }
});
test('simultaneous versus death, restart and terminal freeze use the real match rules', () => {
  const B = runtime(), w = world(B, 'versus');
  openMap(B, w);
  for (const p of w.players) { p.invuln = 0; B.rules.hurtPlayer(w, p, 'flame'); }
  act(B, w, { wait: true, frames: 1 });
  assert.equal(w.match.scores.p1, 1); assert.equal(w.match.scores.p2, 1);
  let result;
  for (let i = 0; i < 3; i++) { result = act(B, w, { wait: true, frames: 60 }); if (w.match.round === 2) break; }
  assert.equal(w.match.round, 2); assert.equal(result.stopReason, 'round_started');
  assert.ok(w.players.every(p => p.alive && p.power === 1));
  for (const p of w.players) { p.invuln = 0; B.rules.hurtPlayer(w, p, 'flame'); }
  act(B, w, { wait: true, frames: 60 });
  assert.equal(w.match.over, true); assert.equal(w.match.winner, 'draw');
  const frame = w.frame; assert.equal(act(B, w, { wait: true, frames: 60 }).advancedFrames, 0); assert.equal(w.frame, frame);
});
test('adventure automatically changes levels, reaches boss stages and finishes level 10', () => {
  const B = runtime(), w = world(B, 'adventure');
  w.players[0].power = 3; w.players[0].lives = 3;
  for (let level = 1; level <= 10; level++) {
    assert.equal(w.match.level, level);
    if (level % 5 === 0) {
      assert.equal(w.map.bossBattle, true);
      const boss = w.enemies.find(e => e.type === 'boss'); assert.ok(boss);
      boss.hp = 3; B.entities.syncBossPhase(w, boss);
      assert.equal(boss.phase, 3);
      boss.abilityCd = 0; B.ai.bossAbility(w, boss, 1 / 60); assert.ok(w.poison.length);
      const other = runtime(), restored = other.snapshot.load(plain(B.snapshot.save(w)));
      act(B, w, { skill: true, frames: 12 }); act(other, restored, { skill: true, frames: 12 });
      assert.equal(hash(B.snapshot.save(w)), hash(other.snapshot.save(restored)));
    }
    for (const e of w.enemies) B.rules.killEnemy(w, e, 'p1');
    for (let i = 0; i < 4 && !w.match.over && w.match.level === level; i++) act(B, w, { wait: true, frames: 60 });
    if (level < 10) { assert.equal(w.briefing, null); assert.equal(w.players[0].power, 3); }
  }
  assert.equal(w.match.over, true); assert.equal(w.match.winner, 'p1'); assert.equal(w.players[0].lives, 5);
});
test('terrain collision, single bomb pulse, fuse, chain and death are simulated', () => {
  const B = runtime(), w = world(B); openMap(B, w);
  const x = w.players[0].x;
  act(B, w, { move: 'left', frames: 60 }); assert.ok(w.players[0].x >= B.config.BOX / 2 + 48);
  w.players[0].x = x; w.players[0].invuln = 0;
  w.players[0].maxBombs = 8;
  act(B, w, { bomb: true, frames: 60 }); assert.equal(w.bombs.length, 1);
  let death;
  for (let i = 0; i < 3; i++) { death = act(B, w, { wait: true, frames: 60 }); if (!w.players[0].alive) break; }
  assert.equal(w.players[0].alive, false); assert.equal(w.players[0].lives, 2);
  assert.equal(death.stopReason, 'onDeath'); assert.ok(death.events.some(e => e.type === 'onExplode'));
});
test('public state omits RNG/AI plans; assist is optional and does not mutate simulation', () => {
  const B = runtime(), w = world(B, 'adventure'); act(B, w, { bomb: true, frames: 1 });
  const snapshot = hash(B.snapshot.save(w)), observation = plain(B.observe(w, false));
  assert.equal(observation.assist, undefined); assert.equal(observation.rng, undefined);
  assert.equal(observation.enemies[0].escapePath, undefined);
  assert.ok(B.observe(w, true).assist.dangerWindows.length);
  assert.equal(hash(B.snapshot.save(w)), snapshot);
});
test('all enemies and bosses use the player fuse at every firepower', () => {
  const B = runtime(), w = world(B, 'adventure'); openMap(B, w);
  for (const type of ['gugu', 'claude', 'oupao', 'boss']) for (const power of [1, 2, 8]) {
    w.bombs = []; w.flames = [];
    const e = B.entities.create(type, 5, 5, 5); e.power = power; w.enemies = [e];
    assert.equal(B.ai.fuseFor(e), B.config.FUSE);
    assert.equal(B.ai.placeBomb(w, e, 5, 5), true, `${type}, power ${power}`);
    const bomb = w.bombs[0];
    assert.equal(bomb.fuse, 2.4); assert.equal(bomb.fuseTotal, 2.4);
    B.rules.updateBombs(w, 2.39); assert.equal(w.bombs.length, 1);
    B.rules.updateBombs(w, .02); assert.equal(w.bombs.length, 0); assert.ok(w.flames.length);
  }
});
test('every enemy type rides a complete factory and park loop; stun rides, time stop freezes', () => {
  const B = runtime();
  for (const theme of ['factory', 'park']) for (const type of ['gugu', 'claude', 'oupao', 'boss']) {
    const w = world(B, 'adventure');
    w.map = B.levelgen.generate(B.makeRng(3), { mode: 'adventure', theme }).map;
    const track = w.map.landmark.path, start = track[0];
    const e = B.entities.create(type, ...start, 5); e.stun = 100; e.bombCd = 100;
    w.enemies = [e];
    const origin = [e.x, e.y], speed = theme === 'factory' ? 1.65 : 1.8;
    B.ai.updateEnemy(w, e, .1);
    assert.ok(Math.hypot(e.x - origin[0], e.y - origin[1]) > 5, `${theme} ${type} rides while stunned`);
    const frozen = [e.x, e.y]; w.timeStop = { ownerId: 'p1', remaining: 3 };
    B.ai.updateEnemy(w, e, .1); assert.deepEqual([e.x, e.y], frozen);
    w.timeStop = null;
    const steps = Math.round((track.length / speed - .1) * 60);
    for (let i = 0; i < steps; i++) {
      B.ai.updateEnemy(w, e, 1 / 60);
      assert.equal(B.grid.canStand(w.map, [], e.x, e.y, B.config.ENEMY_BOX, e.id), true, `${theme} ${type} collision`);
    }
    assert.ok(Math.hypot(e.x - origin[0], e.y - origin[1]) < 2, `${theme} ${type} completed all corners`);
    assert.equal(e.shield, 0); assert.equal(e.carouselRewarded, undefined);
    const stopped = [e.x, e.y]; e.alive = false;
    B.ai.updateEnemy(w, e, .2); assert.deepEqual([e.x, e.y], stopped);
  }
});
test('enemy transport respects walls and bombs, and clears stale walking targets', () => {
  const B = runtime(), G = B.grid, w = world(B, 'adventure');
  w.map = B.levelgen.generate(B.makeRng(9), { mode: 'adventure', theme: 'factory' }).map;
  const e = B.entities.create('gugu', 5, 3, 1); e.stun = 100; w.enemies = [e];
  B.grid.set(w.map, 6, 3, B.T.BRICK);
  for (let i = 0; i < 120; i++) B.ai.updateEnemy(w, e, 1 / 60);
  assert.ok(e.x + B.config.ENEMY_BOX / 2 <= 6 * 48 + 1e-6);
  B.grid.set(w.map, 6, 3, B.T.EMPTY); e.x = G.centerX(5); e.y = G.centerY(3);
  w.bombs = [{ cx: 6, cy: 3, ownerId: 'other', freeFor: null }];
  for (let i = 0; i < 120; i++) B.ai.updateEnemy(w, e, 1 / 60);
  assert.ok(Math.hypot(e.x - G.centerX(6), e.y - G.centerY(3)) >= B.config.ENEMY_BOX / 2 + B.config.BOMB_RADIUS - 1e-6);
  w.bombs = []; e.stun = 0; e.bombCd = 100;
  e.x = G.centerX(5); e.y = G.centerY(3); e.moving = true;
  e.dir = { x: 1, y: 0 }; e.fromC = 1; e.fromR = 1; e.tc = 2; e.tr = 1;
  B.ai.updateEnemy(w, e, 1 / 60);
  assert.ok(e.tc !== 2 || e.tr !== 1, 'carried enemy replans its obsolete path');
  for (let i = 0; i < 1800; i++) {
    B.ai.updateEnemy(w, e, 1 / 60);
    assert.ok(G.canStand(w.map, [], e.x, e.y, B.config.ENEMY_BOX, e.id), 'walking after transport never enters a wall');
  }
});
test('CLI failures use nonzero exit status and parseable JSON', () => {
  for (const args of [['act', '--frames', 'nan', '--session', 'cross'], ['act', '--boomb'], ['state', '--session', 'missing']]) {
    const p = spawnSync(process.execPath, ['cli/bombit.cjs', ...args, '--session-dir', directory, '--json'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(p.status, 1); assert.equal(JSON.parse(p.stdout).ok, false);
  }
});
test('interactive terminal accepts movement, new games and quit without losing the old save', () => {
  const p = spawnSync(process.execPath, ['cli/bombit.cjs', 'play', '--session', 'human', '--mode', 'dig', '--seed', 'human', '--session-dir', directory],
    { cwd: ROOT, encoding: 'utf8', input: 'd 12\nlook\nnew adventure\nquit\n' });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.match(p.stdout, /Advanced 12 frames/); assert.match(p.stdout, /adventure/);
  assert.equal(handle(runtime(), { op: 'state', session: 'human' }, directory).state.frame, 12);
});
test('reference agent wins a real game solely through JSONL and exports a portable verified replay', () => {
  const session = 'proof-' + require('node:crypto').randomBytes(4).toString('hex');
  const p = spawnSync(process.execPath, ['examples/agent.cjs', '--session', session], { cwd: ROOT,
    env: { ...process.env, BOMBIT_SESSION_DIR: directory }, encoding: 'utf8', timeout: 30000 });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.match(p.stdout, /winner=p1/); assert.match(p.stdout, /Replay verified=true/);
  const replay = p.stdout.match(/file=(.+)/)[1].trim();
  const verification = handle(runtime(), { op: 'replay', file: replay }, directory);
  assert.equal(verification.verified, true); assert.equal(verification.state.bricksLeft, 0);
  assert.equal(verification.state.match.winner, 'p1'); assert.ok(verification.state.players[0].lives >= 3);
  assert.equal(fs.existsSync(sessionPath(session,directory)), false);
  assert.match(path.basename(replay), /^\d{8}-\d{6}-reference-dig-win-[0-9a-f]{6}\.replay\.json$/);
  const canonical=path.basename(replay,'.replay.json');
  assert.equal(handle(runtime(),{op:'state',session:canonical},directory).archived,true);
  assert.throws(()=>handle(runtime(),{op:'state',session},directory),{code:'SESSION_NOT_FOUND'});
});
test('finish leaves one standard replay, cleans per-game scratch, and cannot resurrect legacy names',()=>{
  const B=runtime(), id='finish-'+require('node:crypto').randomBytes(3).toString('hex');
  const created=handle(B,{op:'new',agent:'codex',mode:'dig',seed:'finish',session:id},directory);
  handle(B,{op:'act',session:id,move:'right',frames:12},directory);
  const gameTemp=path.join(storage.locations().games,id);fs.mkdirSync(gameTemp,{recursive:true});fs.writeFileSync(path.join(gameTemp,'state.json'),'scratch');
  const result=handle(B,{op:'finish',session:id},directory);
  assert.equal(result.verified,true);assert.equal(result.archived,true);
  assert.match(path.basename(result.replayFile),/^\d{8}-\d{6}-codex-dig-stopped-[0-9a-f]{6}\.replay\.json$/);
  assert.equal(result.session,path.basename(result.replayFile,'.replay.json'));
  assert.equal(fs.existsSync(gameTemp),false);assert.equal(fs.existsSync(sessionPath(id,directory)),false);
  assert.equal(handle(B,{op:'finish',session:result.session},directory).replayFile,result.replayFile);
  assert.equal(handle(B,{op:'replay',session:result.session},directory).verified,true);
  assert.throws(()=>handle(B,{op:'state',session:id},directory),{code:'SESSION_NOT_FOUND'});
});
test('archive verification failure retains the unique resumable save',()=>{
  const B=runtime(),id='bad-archive';handle(B,{op:'new',session:id,mode:'dig',seed:'bad'},directory);
  handle(B,{op:'act',session:id,wait:true,frames:12},directory);
  const file=sessionPath(id,directory),s=JSON.parse(fs.readFileSync(file,'utf8'));s.history[0].hash='0'.repeat(64);fs.writeFileSync(file,JSON.stringify(s));
  assert.throws(()=>handle(B,{op:'finish',session:id},directory),{code:'REPLAY_MISMATCH'});
  assert.equal(fs.existsSync(file),true);
});
test('formal sessions are generated consistently and require a valid agent name',()=>{
  const B=runtime(),r=handle(B,{op:'new',agent:'deepseek',mode:'dig',seed:'names'},directory);
  assert.match(r.session,/^\d{8}-\d{6}-deepseek-dig-[0-9a-f]{6}$/);
  assert.throws(()=>handle(B,{op:'new',session:'final2',agent:'codex'}),{code:'AUTOMATIC_SESSION_NAME'});
  assert.throws(()=>handle(B,{op:'new',agent:'Not Valid'},directory),{code:'INVALID_AGENT'});
});
