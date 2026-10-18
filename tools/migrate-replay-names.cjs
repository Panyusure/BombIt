#!/usr/bin/env node
'use strict';
// Metadata-only migration: retain the exact engine, actions and state hashes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const storage = require('../cli/storage.cjs');
const {normalizeConfig, requireThat} = require('../cli/game.cjs');
const {hash} = require('../cli/session.cjs');
const payload = r => ({engineVersion:r.engineVersion,config:r.config,history:r.history,finalHash:r.finalHash,finalSnapshot:r.finalSnapshot});
function migrate(folder = storage.locations().replays, apply = false) {
  folder = path.resolve(folder);
  const plans = fs.readdirSync(folder).filter(n => n.endsWith('.replay.json')).map(name => {
    const source = path.join(folder,name), replay = JSON.parse(fs.readFileSync(source,'utf8'));
    requireThat(replay.format === 'bombit-replay/1' && replay.recording && Array.isArray(replay.history), 'INVALID_REPLAY', 'Unsupported replay: '+name);
    const config = normalizeConfig({mode:replay.config?.mode,seed:replay.config?.seed,
      character:replay.config?.chars?.[0],character2:replay.config?.chars?.[1]});
    const meta = replay.recording;
    // 旧档可能没有开始时间：用文件修改时间兜底，免得把「迁移时刻」写进回放名
    if (!meta.startedAt) meta.startedAt = fs.statSync(source).mtime.toISOString();
    storage.recording(meta.agent,meta.startedAt); // validate agent; preserve the existing ID and date
    requireThat(/^[0-9a-f]{6}$/.test(meta.id) && ['win','loss','draw','stopped'].includes(meta.outcome), 'INVALID_REPLAY', 'Invalid recording identity: '+name);
    const target = path.join(folder,storage.basename(meta,config,meta.outcome));
    requireThat(target === source || !fs.existsSync(target), 'ARCHIVE_CONFLICT', 'Destination already exists: '+target);
    const checksum = hash(payload(replay));
    Object.assign(meta,{name:path.basename(target,'.replay.json'),character:config.chars[0],characters:storage.characters(config)});
    if (replay.receipt) Object.assign(replay.receipt,{session:meta.name,replayFile:target});
    return {source,target,replay,checksum};
  });
  requireThat(new Set(plans.map(p=>p.target)).size === plans.length,'ARCHIVE_CONFLICT','Multiple recordings would use the same destination');
  if (apply) for (const plan of plans) {
    const temp = plan.source+'.'+crypto.randomUUID()+'.tmp';
    try {
      fs.writeFileSync(temp,JSON.stringify(plan.replay));
      requireThat(hash(payload(JSON.parse(fs.readFileSync(temp,'utf8')))) === plan.checksum,'REPLAY_MISMATCH','Migration changed replay data');
      fs.renameSync(temp,plan.source);
      if (plan.source !== plan.target) fs.renameSync(plan.source,plan.target);
    } finally { if(fs.existsSync(temp))fs.unlinkSync(temp); }
  }
  return plans.map(({source,target})=>({source,target,applied:apply}));
}
if (require.main === module) {
  const args=process.argv.slice(2), directoryIndex=args.indexOf('--directory');
  for(const result of migrate(directoryIndex>=0?args[directoryIndex+1]:undefined,args.includes('--apply'))) console.log(JSON.stringify(result));
}
module.exports={migrate};
