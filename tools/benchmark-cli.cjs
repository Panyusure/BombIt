#!/usr/bin/env node
'use strict';
// Compare the same recorded actions, including process startup and verified archival.
// All generated data lives in an isolated test directory and is removed on exit.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { runtime, ROOT } = require('../cli/runtime.cjs');
const { create, advance } = require('../cli/game.cjs');
const storage = require('../cli/storage.cjs');
const file = process.argv[2];
if (!file) { console.error('Usage: node tools/benchmark-cli.cjs data/replays/RECORDING.replay.json'); process.exit(1); }
const replay = JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(replay.engineVersion,'2');
const B = runtime(), w = create(B,replay.config), groups = [];
let group = [];
for (const entry of replay.history) {
  group.push(entry.action);
  const result = advance(B,w,entry.action);
  if (result.stopReason !== 'frames_complete' || group.length === 1024) { groups.push(group); group = []; }
}
if (group.length) groups.push(group);
const scratch = storage.scratch('benchmark');
try {
  let baseline;
  for (const [name,memory,batch] of [['disk-act',false,false],['memory-act',true,false],['disk-batch',false,true],['memory-batch',true,true]]) {
    const directory = path.join(scratch,name);
    const requests = [{op:'new',session:'benchmark',mode:replay.config.mode,seed:replay.config.seed,
      character:replay.config.chars[0],character2:replay.config.chars[1]}];
    if (batch) for (const steps of groups) requests.push({op:'batch',session:'benchmark',steps:steps.map(a => ({frames:a.frames,actions:a.actions}))});
    else for (const e of replay.history) requests.push({op:'act',session:'benchmark',frames:e.action.frames,actions:e.action.actions});
    const started = performance.now();
    const child = spawnSync(process.execPath,['cli/bombit.cjs','serve',...(memory ? ['--memory']:[]),'--session-dir',directory],
      {cwd:ROOT,input:requests.map(JSON.stringify).join('\n')+'\n',encoding:'utf8',maxBuffer:64*1024*1024});
    const elapsedMs = performance.now()-started;
    assert.equal(child.status,0,child.stderr || child.error?.message);
    const responses = child.stdout.trim().split('\n').map(JSON.parse);
    assert.ok(responses.every(r => r.ok),JSON.stringify(responses.find(r => !r.ok)));
    const final = responses.at(-1);
    // A nonterminal trace needs an explicit finish in disk mode; performance comparisons use full games.
    assert.equal(final.archived,true,'Provide a complete recorded game');
    const saved = JSON.parse(fs.readFileSync(final.replayFile,'utf8'));
    assert.equal(saved.finalHash,replay.finalHash);
    assert.equal(saved.history.length,replay.history.length);
    if (!baseline) baseline = elapsedMs;
    console.log(JSON.stringify({mode:name,actions:saved.history.length,requests:requests.length-1,
      elapsedMs:Math.round(elapsedMs),actionsPerSecond:Math.round(saved.history.length*1000/elapsedMs),
      speedup:Math.round(baseline/elapsedMs*100)/100,verified:true}));
  }
} finally { storage.removeInside(storage.locations().tests,scratch); }
