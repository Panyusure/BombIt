'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT } = require('./runtime.cjs');
const { GameError, requireThat, create, normalizeConfig, normalizeAction, advance, rules } = require('./game.cjs');
const storage = require('./storage.cjs');
const { normalizeNavigation, navigate } = require('./navigation.cjs');
const FORMAT = 'bombit-session/1';
const ENGINE_VERSION = '2';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sessionPath(id, directory) {
  requireThat(typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(id), 'INVALID_SESSION', 'session must use 1–96 letters, digits, underscores or hyphens');
  return path.join(storage.locations(directory).sessions, id + '.json');
}
function read(file) {
  requireThat(fs.existsSync(file), 'SESSION_NOT_FOUND', 'Session does not exist; create it with new');
  const session = JSON.parse(fs.readFileSync(file, 'utf8'));
  requireThat(session.format === FORMAT && session.engineVersion === ENGINE_VERSION, 'INCOMPATIBLE_SESSION',
    'Rules changed or session format is unsupported; create a new session with a different name. The old save is preserved.');
  return session;
}
function atomicWrite(file, value) {
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, JSON.stringify(value)); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function locked(file, operation) {
  const release = acquire(file);
  try { return operation(); } finally { release(); }
}
function acquire(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = file + '.lock';
  let fd;
  try { fd = fs.openSync(lock, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new GameError('SESSION_BUSY', 'Another command holds this session lock; retry later. If a process crashed, remove its .lock file after checking it has exited.');
  }
  fs.writeFileSync(fd, String(process.pid));
  return () => { fs.closeSync(fd); fs.unlinkSync(lock); };
}
function restoreArchive(BI, id, directory) {
  const replayFile = storage.findReplay(id, directory);
  if (!replayFile) return null;
  const r = JSON.parse(fs.readFileSync(replayFile, 'utf8'));
  requireThat(r.engineVersion === ENGINE_VERSION, 'INCOMPATIBLE_SESSION', 'This recording uses a different engine version');
  let snapshot = r.finalSnapshot;
  if (!snapshot) {
    const w = create(BI, r.config);
    for (const e of r.history) advance(BI, w, e.action);
    snapshot = BI.snapshot.save(w);
  }
  return { format: FORMAT, engineVersion: r.engineVersion, config: r.config, revision: r.history.length,
    snapshot, history: r.history, lastResponse: r.receipt || null, recording: r.recording, archived: true, replayFile };
}
function replayData(s) {
  return { format: 'bombit-replay/1', engineVersion: s.engineVersion, config: s.config, history: s.history,
    finalHash: hash(s.snapshot), recording: s.recording };
}
function archive(BI, s, id, file, directory, receipt, agent) {
  if (s.archived) return s.replayFile;
  // Verify the complete history before discarding any resumable state.
  const w = create(BI, s.config);
  for (const entry of s.history) {
    const result = advance(BI, w, entry.action);
    requireThat(result.advancedFrames === entry.advancedFrames && hash(BI.snapshot.save(w)) === entry.hash,
      'REPLAY_MISMATCH', `Cannot archive: replay diverged at revision ${entry.revision}`);
  }
  requireThat(hash(BI.snapshot.save(w)) === hash(s.snapshot), 'REPLAY_MISMATCH', 'Cannot archive: final state differs');
  const meta = s.recording || storage.recording(agent || 'legacy', fs.statSync(file).mtime.toISOString());
  if (agent) meta.agent = storage.recording(agent).agent;
  const outcome = w.match.over ? w.match.winner === 'draw' ? 'draw' : w.match.winner === 'p1' ? 'win' : 'loss' : 'stopped';
  Object.assign(meta, { sourceSession: id, endedAt: new Date().toISOString(), outcome });
  s.recording = meta;
  const folder = storage.locations(directory).replays;
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, storage.basename(meta, s.config.mode, outcome));
  meta.name = path.basename(target, '.replay.json');
  const oldReceipt = receipt || s.lastResponse;
  const data = Object.assign(replayData(s), { finalSnapshot: s.snapshot,
    receipt: oldReceipt ? Object.assign({},oldReceipt,{session:meta.name,archived:true,replayFile:target}) : null });
  if (fs.existsSync(target)) {
    const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
    requireThat(existing.finalHash === data.finalHash && existing.recording?.sourceSession === id, 'ARCHIVE_CONFLICT', 'A different recording already uses this filename');
  } else atomicWrite(target, data);
  // Confirm the durable copy before deleting the working session.
  requireThat(JSON.parse(fs.readFileSync(target, 'utf8')).finalHash === data.finalHash, 'ARCHIVE_FAILED', 'Recording write verification failed');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  storage.removeInside(storage.locations().games, path.join(storage.locations().games, id));
  s.archived = true; s.replayFile = target;
  return target;
}
function handle(BI, request, directory, memory) {
  requireThat(request && typeof request === 'object' && !Array.isArray(request), 'INVALID_REQUEST', 'Request must be a JSON object');
  const op = request.op;
  if (op === 'rules') return { ok: true, rules: rules(BI) };
  requireThat(['new', 'state', 'act', 'batch', 'path', 'goTo', 'checkpoint', 'replay', 'export', 'finish'].includes(op), 'INVALID_OPERATION', 'Unknown operation');
  requireThat(request.assist === undefined || typeof request.assist === 'boolean', 'INVALID_REQUEST', 'assist must be boolean');
  if (op === 'replay' && request.file !== undefined) {
    requireThat(typeof request.file === 'string' && request.file.length > 0, 'INVALID_REPLAY', 'file must be a replay JSON path');
    const replay = JSON.parse(fs.readFileSync(path.resolve(request.file), 'utf8'));
    requireThat(replay.format === 'bombit-replay/1' && replay.engineVersion === ENGINE_VERSION && Array.isArray(replay.history),
      'INVALID_REPLAY', 'Unsupported replay format');
    const config = normalizeConfig({ mode: replay.config?.mode, seed: replay.config?.seed,
      character: replay.config?.chars?.[0], character2: replay.config?.chars?.[1] });
    const w = create(BI, config);
    for (const entry of replay.history) {
      const result = advance(BI, w, normalizeAction(w, { actions: entry.action.actions, frames: entry.action.frames }));
      requireThat(result.advancedFrames === entry.advancedFrames && hash(BI.snapshot.save(w)) === entry.hash,
        'REPLAY_MISMATCH', `Replay diverged at revision ${entry.revision}`);
    }
    requireThat(hash(BI.snapshot.save(w)) === replay.finalHash, 'REPLAY_MISMATCH', 'Replay final hash differs');
    return { ok: true, session: 'replay', revision: replay.history.length, verified: true,
      actions: replay.history.length, hash: replay.finalHash, state: BI.observe(w, !!request.assist) };
  }
  let id = request.session;
  if (op === 'new') requireThat(request.agent === undefined || typeof request.agent === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(request.agent),
    'INVALID_AGENT', 'agent must use 1–24 lowercase letters, digits or hyphens, starting with a letter');
  const meta = op === 'new' ? storage.recording(request.agent || 'agent') : null;
  if (op === 'new' && request.session && !directory && !process.env.BOMBIT_SESSION_DIR) {
    requireThat(false, 'AUTOMATIC_SESSION_NAME', 'Omit --session when creating a game; --agent selects the name and the CLI generates a standard session ID');
  }
  if (op === 'new' && id === undefined) id = `${storage.stamp(meta.startedAt)}-${meta.agent}-${request.mode || 'adventure'}-${meta.id}`;
  const file = sessionPath(id, directory);
  const loadDisk = () => fs.existsSync(file) ? read(file) : restoreArchive(BI, id, directory) || read(file);
  const load = () => memory?.sessions.get(id)?.s || loadDisk();
  const save = s => { if (!memory) atomicWrite(file,s); };
  const mutate = operation => {
    if (!memory) return locked(file,operation);
    if (!memory.sessions.has(id)) {
      const release = acquire(file);
      try {
        const s = op === 'new' ? null : loadDisk();
        memory.sessions.set(id,{s,w:s ? BI.snapshot.load(s.snapshot) : null,file,release});
      } catch (error) { release(); throw error; }
    }
    try { return operation(); }
    finally {
      const entry = memory.sessions.get(id);
      if (!entry.s || entry.s.archived) { entry.release(); memory.sessions.delete(id); }
    }
  };
  function response(s, w, result = {}) {
    return Object.assign({ ok: true, session: s.archived ? s.recording.name : id, revision: s.revision }, s.archived ? { archived: true, replayFile: s.replayFile } : {}, result,
      { state: BI.observe(w, !!request.assist) });
  }
  if (op === 'new') {
    const config = normalizeConfig(request);
    return mutate(() => {
      requireThat(!memory?.sessions.get(id)?.s, 'SESSION_EXISTS', 'This session already exists');
      requireThat(!fs.existsSync(file) && !storage.findReplay(id, directory), 'SESSION_EXISTS', 'This session already exists; choose a different name');
      const w = create(BI, config);
      const s = { format: FORMAT, engineVersion: ENGINE_VERSION, config, revision: 0,
        snapshot: BI.snapshot.save(w), history: [], lastResponse: null, recording: meta };
      atomicWrite(file, s);
      if (memory) Object.assign(memory.sessions.get(id),{s,w});
      return response(s, w, { advancedFrames: 0, events: [] });
    });
  }
  if (op === 'state') { const s = load(); return response(s, memory?.sessions.get(id)?.w || BI.snapshot.load(s.snapshot)); }
  if (op === 'export') {
    const s = load();
    return { ok: true, session: id, replay: replayData(s) };
  }
  if (op === 'replay') {
    const s = load(), w = create(BI, s.config);
    for (const entry of s.history) {
      const result = advance(BI, w, entry.action);
      requireThat(result.advancedFrames === entry.advancedFrames && hash(BI.snapshot.save(w)) === entry.hash,
        'REPLAY_MISMATCH', `Replay diverged at revision ${entry.revision}`);
    }
    requireThat(hash(BI.snapshot.save(w)) === hash(s.snapshot), 'REPLAY_MISMATCH', 'Replay final state differs from saved session');
    return response(s, w, { verified: true, actions: s.history.length, hash: hash(s.snapshot) });
  }
  return mutate(() => {
    const s = load(), w = memory?.sessions.get(id)?.w || BI.snapshot.load(s.snapshot);
    if (op === 'finish') {
      let replayFile;
      try { replayFile = archive(BI, s, id, file, directory, null, request.agent); }
      catch (error) { if (memory) atomicWrite(file,s); throw error; }
      return response(s, w, { archived: true, replayFile, verified: true });
    }
    if (op === 'checkpoint') {
      if (!s.archived) atomicWrite(file,s);
      return response(s,w,{checkpointed:true});
    }
    let commands, navigation;
    if (op === 'batch') {
      requireThat(['move','bomb','skill','wait','actions','frames','player','path','target'].every(k => request[k] === undefined),
        'INVALID_BATCH', 'Put action fields inside steps');
      requireThat(Array.isArray(request.steps) && request.steps.length >= 1 && request.steps.length <= 1024,
        'INVALID_BATCH', 'steps must contain 1..1024 action objects');
      commands = request.steps.map(step => {
        requireThat(step && typeof step === 'object' && !Array.isArray(step) &&
          Object.keys(step).every(k => ['move','bomb','skill','wait','frames','player','actions'].includes(k)),
          'INVALID_BATCH', 'Each step must contain only action fields');
        return normalizeAction(w,step);
      });
    } else if (op === 'path' || op === 'goTo') navigation = normalizeNavigation(w,request);
    else commands = [normalizeAction(w,request)];
    const fingerprint = hash(op === 'act' ? commands[0] : {op, commands, navigation});
    if (request.requestId !== undefined) {
      requireThat(typeof request.requestId === 'string' && request.requestId.length > 0 && request.requestId.length <= 128,
        'INVALID_REQUEST_ID', 'requestId must contain 1–128 characters');
      const previous = s.history.find(entry => entry.requestId === request.requestId);
      if (previous) {
        requireThat(previous.fingerprint === fingerprint, 'REQUEST_ID_CONFLICT', 'This requestId was already used for a different action');
        if ((previous.requestEndRevision ?? previous.revision) === s.revision) return Object.assign({}, s.lastResponse || response(s,w), { session: s.archived ? s.recording.name : id },
          s.archived ? { archived: true, replayFile: s.replayFile } : {}, { duplicate: true });
        throw new GameError('ALREADY_APPLIED', `This request was applied at revision ${previous.revision}; read state to continue`);
      }
    }
    if (request.expectRevision !== undefined) {
      requireThat(Number.isInteger(request.expectRevision) && request.expectRevision === s.revision, 'REVISION_CONFLICT', `Current revision is ${s.revision}; read state before acting`);
    }
    if (s.archived) return response(s,w,{ advancedFrames: 0, stopReason: 'archived', events: [] });
    const startRevision = s.revision;
    const result = { advancedFrames: 0, stopReason: 'frames_complete', events: [], completedActions: 0 };
    const apply = action => {
      const step = advance(BI,w,action);
      result.advancedFrames += step.advancedFrames;
      result.events.push(...step.events); result.stopReason = step.stopReason;
      if (step.advancedFrames) {
        s.revision++; result.completedActions++;
        s.snapshot = BI.snapshot.save(w);
        s.history.push({revision:s.revision,requestId:null,fingerprint,action,advancedFrames:step.advancedFrames,hash:hash(s.snapshot)});
      }
      return step;
    };
    if (navigation) Object.assign(result,navigate(BI,w,navigation,op === 'goTo',apply));
    else for (const action of commands) { const step = apply(action); if (step.stopReason !== 'frames_complete') break; }
    if (s.revision === startRevision) return response(s,w,result);
    Object.assign(s.history[startRevision],{requestId:request.requestId ?? null,requestEndRevision:s.revision});
    const out = response(s, w, result);
    s.lastResponse = out;
    save(s);
    if (w.match.over) {
      try { out.replayFile = archive(BI, s, id, file, directory, out); }
      catch (error) { if (memory) atomicWrite(file,s); throw error; }
      out.archived = true;
      out.session = s.recording.name;
    }
    return out;
  });
}
function memoryStore(BI,directory) {
  const memory = {sessions:new Map()};
  memory.close = () => {
    const results = [];
    for (const [id,entry] of memory.sessions) {
      try { results.push(handle(BI,{op:'finish',session:id},directory,memory)); }
      catch (error) {
        try { if (entry.s) atomicWrite(entry.file,entry.s); }
        finally { entry.release(); memory.sessions.delete(id); }
        results.push({ok:false,session:id,error:{code:error.code || 'INTERNAL_ERROR',message:error.message}});
      }
    }
    return results;
  };
  return memory;
}
module.exports = { handle, memoryStore, sessionPath, hash, read, FORMAT };
