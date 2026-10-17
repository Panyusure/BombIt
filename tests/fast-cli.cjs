'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runtime, ROOT } = require('../cli/runtime.cjs');
const { handle, memoryStore, sessionPath, hash } = require('../cli/session.cjs');
const storage = require('../cli/storage.cjs');
const { Player } = require('../replay/core.js');
const scratch = storage.scratch('fast-cli'), directory = path.join(scratch,'sessions');
test.after(() => storage.removeInside(storage.locations().tests,scratch));
function setup(id,memory = false) {
  const B = runtime(), store = memory ? memoryStore(B,directory) : null;
  const call = r => handle(B,{session:id,...r},directory,store);
  call({op:'new',mode:'dig',seed:'agent-demo-3',character:'arui'});
  return {B,store,call};
}
test('batch matches individual actions exactly, validates every step first and retries once', () => {
  const a = setup('single'), b = setup('batch');
  const steps = [{bomb:true,frames:1},{move:'down',frames:12},{move:'down',frames:12},{wait:true,frames:50}];
  let expected; for (const step of steps) expected = a.call({op:'act',...step});
  const req = {op:'batch',steps,requestId:'batch-1',expectRevision:0};
  const actual = b.call(req);
  assert.equal(JSON.stringify(actual.state),JSON.stringify(expected.state)); assert.equal(actual.revision,steps.length);
  assert.equal(b.call(req).duplicate,true);
  assert.throws(() => b.call({...req,steps:[{wait:true,frames:1}]}),{code:'REQUEST_ID_CONFLICT'});
  const before = fs.readFileSync(sessionPath('batch',directory),'utf8');
  assert.throws(() => b.call({op:'batch',steps:[{bomb:true,frames:1},{frames:61}]}),{code:'INVALID_FRAMES'});
  assert.equal(fs.readFileSync(sessionPath('batch',directory),'utf8'),before);
  assert.equal(b.call({op:'replay'}).verified,true);
});
test('batch stops at death and retains only actions actually performed', () => {
  const {call} = setup('boundary');
  const result = call({op:'batch',steps:[{bomb:true,frames:1},...Array.from({length:20},() => ({wait:true,frames:60}))]});
  assert.equal(result.stopReason,'onDeath');
  assert.ok(result.completedActions < 21); assert.equal(result.state.players[0].alive,false);
  assert.equal(call({op:'replay'}).verified,true);
});
test('memory mode holds a single lock, writes only checkpoints and finishes to one verified archive', () => {
  const {B,store,call} = setup('memory',true), file = sessionPath('memory',directory);
  try {
    const initial = fs.readFileSync(file,'utf8');
    call({op:'act',move:'down',frames:12});
    assert.equal(fs.readFileSync(file,'utf8'),initial);
    assert.throws(() => handle(B,{op:'act',session:'memory'},directory),{code:'SESSION_BUSY'});
    assert.equal(call({op:'state'}).state.frame,12);
    call({op:'checkpoint'});
    assert.equal(JSON.parse(fs.readFileSync(file)).revision,1);
    call({op:'act',wait:true,frames:12});
    const result = call({op:'finish'});
    assert.equal(result.verified,true); assert.equal(result.state.frame,24);
    assert.equal(fs.existsSync(file),false); assert.equal(fs.existsSync(file+'.lock'),false);
    assert.equal(store.sessions.size,0);
    assert.equal(handle(B,{op:'replay',file:result.replayFile},directory).verified,true);
    assert.throws(() => call({op:'state'}),{code:'SESSION_NOT_FOUND'});
  } finally { store.close(); }
});
test('memory EOF archives all open sessions, keeps stdout one response per request', () => {
  const dir = path.join(scratch,'eof');
  const requests = [{op:'new',session:'eof',mode:'dig',seed:'eof'},
    {op:'new',session:'eof-other',mode:'dig',seed:'other'}, {op:'act',session:'eof',frames:12}];
  const p = spawnSync(process.execPath,['cli/bombit.cjs','serve','--memory','--session-dir',dir],
    {cwd:ROOT,input:requests.map(JSON.stringify).join('\n')+'\n',encoding:'utf8'});
  assert.equal(p.status,0,p.stderr); assert.equal(p.stdout.trim().split('\n').length,requests.length);
  const closed = p.stderr.trim().split('\n').map(JSON.parse);
  assert.equal(closed.length,2); assert.ok(closed.every(r => r.verified));
  assert.equal(fs.existsSync(path.join(dir,'eof.json')),false);
  assert.equal(fs.existsSync(path.join(dir,'eof-other.json')),false);
  assert.equal(fs.readdirSync(path.join(dir,'replays')).length,2);
});
test('memory archive verification failure preserves current checkpoint and releases ownership on close', () => {
  const {store,call} = setup('bad-memory',true);
  call({op:'act',frames:12});
  store.sessions.get('bad-memory').s.history[0].hash = 'bad';
  const results = store.close(); assert.equal(results[0].error.code,'REPLAY_MISMATCH');
  const file = sessionPath('bad-memory',directory);
  assert.equal(JSON.parse(fs.readFileSync(file)).revision,1); assert.equal(fs.existsSync(file+'.lock'),false);
});
test('path and goTo turn through corridors, stop at centres and play in browser replay core', async () => {
  for (const op of ['path','goTo']) {
    const {B,store,call} = setup('nav-'+op,true);
    try {
      call({op:'act',move:'right',frames:5}); // start off-centre; navigation must align before turning
      const req = op === 'path' ? {op,path:[[1,1],[1,2],[2,2]]} : {op,target:[2,2]};
      const result = call({...req,requestId:'route',expectRevision:1});
      assert.equal(result.reached,true); assert.equal(result.state.players[0].col,2); assert.equal(result.state.players[0].row,2);
      assert.ok(Math.abs(result.state.players[0].y-120)<2.6);
      assert.equal(call({...req,requestId:'route',expectRevision:1}).duplicate,true);
      const before = result.state.frame;
      assert.throws(() => call({op:'path',path:[[2,1],[3,3]]}),{code:'INVALID_PATH'});
      assert.equal(call({op:'state'}).state.frame,before);
      const back = call({op:'goTo',target:[1,1]}); assert.equal(back.reached,true);
      const finished = call({op:'finish'}), raw = JSON.parse(fs.readFileSync(finished.replayFile));
      const player = new Player(B,raw);
      await player.build(hash); player.seek(player.totalFrames);
      assert.equal(hash(B.snapshot.save(player.world)),raw.finalHash);
    } finally { store.close(); }
  }
});
test('navigation stops immediately on death and records a replayable partial route', () => {
  const {call} = setup('nav-death');
  call({op:'batch',steps:[{bomb:true,frames:1},{wait:true,frames:60},{wait:true,frames:60},{wait:true,frames:16}]});
  const result = call({op:'path',path:[[1,2],[1,3]]});
  assert.equal(result.stopReason,'onDeath'); assert.equal(result.reached,false);
  assert.equal(result.state.players[0].alive,false);
  assert.equal(call({op:'replay'}).verified,true);
});
test('navigation bounds, unreachable targets and frame budget do not teleport or consume unexpected time', () => {
  const {call} = setup('nav-budget');
  const before = call({op:'state'});
  for (const req of [{op:'goTo',target:[0,0]},{op:'path',path:[[3,1]]},{op:'goTo',target:[-1,1]}]) assert.throws(() => call(req));
  assert.equal(call({op:'state'}).state.frame,before.state.frame);
  const limited = call({op:'goTo',target:[1,3],maxFrames:1});
  assert.equal(limited.reached,false); assert.equal(limited.stopReason,'frame_limit'); assert.equal(limited.advancedFrames,1);
  assert.equal(call({op:'replay'}).verified,true);
});
