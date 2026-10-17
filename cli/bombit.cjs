#!/usr/bin/env node
'use strict';
const readline = require('node:readline');
const { runtime } = require('./runtime.cjs');
const { handle, memoryStore } = require('./session.cjs');
const { GameError } = require('./game.cjs');
const { render } = require('./text-renderer.cjs');
const HELP = `BombIt CLI — agent-ready, deterministic, paused between actions

node cli/bombit.cjs new --agent deepseek --mode adventure --seed demo --json
node cli/bombit.cjs state --session SESSION_ID --json [--assist]
node cli/bombit.cjs act --session SESSION_ID --bomb --frames 1 --json
node cli/bombit.cjs act --session SESSION_ID --move down --frames 12 --json
node cli/bombit.cjs act --session SESSION_ID --wait --frames 60 --json
node cli/bombit.cjs replay --session SESSION_ID --json
node cli/bombit.cjs replay --file data/replays/RECORDING.replay.json --json
node cli/bombit.cjs export --session SESSION_ID --json
node cli/bombit.cjs finish --session SESSION_ID --json # verify, keep one recording, clean working data
node cli/bombit.cjs rules --json
node cli/bombit.cjs serve                 # one JSON request/response per line
node cli/bombit.cjs serve --memory        # agent mode: no per-action disk writes
node cli/bombit.cjs batch --session SESSION_ID --steps '[{"move":"right","frames":13},{"move":"down","frames":13}]' --json
node cli/bombit.cjs goTo --session SESSION_ID --target '[3,1]' --json
node cli/bombit.cjs path --session SESSION_ID --path '[[1,2],[1,3]]' --json
node cli/bombit.cjs checkpoint --session SESSION_ID --json
node cli/bombit.cjs play --session SESSION_ID # interactive, time advances on commands

Modes: dig, adventure (default), versus. Characters: xiaonuo, axiu, arui,
xiaoyan, xiaotian, weilai. Use --character / --character2 when creating.
act: --move up|down|left|right|none, --bomb, --skill, --wait; --frames 1..60.
--player p1|p2 chooses one player. Simultaneous versus actions:
  --actions '{"p1":{"move":"right"},"p2":{"bomb":true}}'
Optional: --request-id ID for safe retries; --expect-revision N for stale-state checks.
--session-dir PATH changes the save directory (also BOMBIT_SESSION_DIR).
Finished games automatically keep one verified recording in data/replays/.
Use finish for an interrupted game. Use --agent NAME to identify its player.
act, batch, path and goTo advance time. Default output is a readable map.
See docs/CLI与Agent.md for the complete protocol and examples.`;
function parse(argv) {
  const op = argv.shift() || 'help', request = { op };
  let json = false, directory;
  const booleans = new Set(['json', 'assist', 'bomb', 'skill', 'wait', 'memory']);
  const names = { 'session': 'session', 'mode': 'mode', 'seed': 'seed', 'character': 'character',
    'character2': 'character2', 'move': 'move', 'frames': 'frames', 'player': 'player', 'actions': 'actions',
    'request-id': 'requestId', 'expect-revision': 'expectRevision', 'session-dir': 'directory', 'file': 'file', 'agent': 'agent',
    'steps':'steps', 'path':'path', 'target':'target', 'max-frames':'maxFrames' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith('--')) throw new GameError('INVALID_ARGUMENT', `Unexpected argument: ${flag}`);
    const key = flag.slice(2);
    if (booleans.has(key)) { if (key === 'json') json = true; else request[key] = true; continue; }
    if (!Object.hasOwn(names, key)) throw new GameError('INVALID_ARGUMENT', `Unknown option: ${flag}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new GameError('INVALID_ARGUMENT', `Missing value for ${flag}`);
    if (key === 'session-dir') directory = value;
    else if (['frames','expect-revision','max-frames'].includes(key)) request[names[key]] = Number(value);
    else if (['actions','steps','path','target'].includes(key)) request[names[key]] = JSON.parse(value);
    else request[names[key]] = value;
  }
  return { request, json, directory };
}
function failure(error) {
  return { ok: false, error: { code: error.code || (error instanceof SyntaxError ? 'INVALID_JSON' : 'INTERNAL_ERROR'), message: error.message } };
}
async function main() {
  const raw = process.argv.slice(2);
  const wantsJson = raw.includes('--json');
  let args;
  try { args = parse(raw); }
  catch (error) { const out = failure(error); process.stdout.write((wantsJson ? JSON.stringify(out) : render(out)) + '\n'); process.exitCode = 1; return; }
  const { request, json, directory } = args;
  if (['help', '--help', '-h'].includes(request.op)) { process.stdout.write(HELP + '\n'); return; }
  const BI = runtime();
  if (request.memory && request.op !== 'serve') throw new GameError('INVALID_ARGUMENT','--memory requires a long-lived serve process');
  const memory = request.memory ? memoryStore(BI,directory) : null;
  const execute = req => { try { return handle(BI, req, directory, memory); } catch (error) { return failure(error); } };
  if (request.op === 'serve') {
    const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      for (const result of memory?.close() || []) {
        const {state,...receipt} = result;
        process.stderr.write(JSON.stringify({event:'memory_session_closed',...receipt})+'\n');
        if (!result.ok) process.exitCode = 1;
      }
    };
    const interrupt = () => { close(); process.exit(process.exitCode || 0); };
    if (memory) { process.on('SIGINT',interrupt); process.on('SIGTERM',interrupt); }
    try { for await (const line of input) {
      if (!line.trim()) continue;
      let result;
      try { result = execute(JSON.parse(line)); } catch (error) { result = failure(error); }
      process.stdout.write(JSON.stringify(result) + '\n');
    } } finally {
      close(); process.off('SIGINT',interrupt); process.off('SIGTERM',interrupt);
    }
    return;
  }
  if (request.op === 'play') {
    let result = request.session ? execute({ ...request, op: 'state' }) : execute({ ...request, op: 'new', agent: 'human' });
    if (!result.ok && result.error.code === 'SESSION_NOT_FOUND') result = execute({ ...request, op: 'new' });
    if (!result.ok) { process.stdout.write(render(result) + '\n'); process.exitCode = 1; return; }
    let session = result.session;
    const currentConfig = { mode: result.state.mode, character: result.state.players[0].character,
      character2: result.state.players[1]?.character };
    process.stdout.write(render(result) + '\nCommands: w/a/s/d [frames], b [frames], q [frames], wait [frames], look, new [dig|adventure|versus], quit\n');
    const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    input.setPrompt('bombit> '); input.prompt();
    for await (const line of input) {
      const [command, count] = line.trim().toLowerCase().split(/\s+/);
      if (command === 'quit' || command === 'exit') break;
      if (command === 'new') {
        const created = execute({ op: 'new', ...currentConfig, mode: count || currentConfig.mode, agent: 'human' });
        if (created.ok) { session = created.session; currentConfig.mode = created.state.mode; }
        process.stdout.write(render(created) + '\n'); input.prompt(); continue;
      }
      const moves = { w: 'up', a: 'left', s: 'down', d: 'right' };
      let req = { op: 'act', session, frames: count === undefined ? (command === 'b' || command === 'q' ? 1 : 12) : Number(count) };
      if (moves[command]) req.move = moves[command];
      else if (command === 'b') req.bomb = true;
      else if (command === 'q') req.skill = true;
      else if (command === 'wait' || command === '.') req.wait = true;
      else if (command === 'look' || command === '') req = { op: 'state', session };
      else { process.stdout.write('Use w/a/s/d, b, q, wait, look, new or quit.\n'); input.prompt(); continue; }
      process.stdout.write(render(execute(req)) + '\n'); input.prompt();
    }
    input.close();
    return;
  }
  const result = execute(request);
  process.stdout.write((json ? JSON.stringify(result) : render(result)) + '\n');
  if (!result.ok) process.exitCode = 1;
}
if (require.main === module) main().catch(error => {
  const out = failure(error); process.stdout.write(JSON.stringify(out) + '\n'); process.exitCode = 1;
});
module.exports = { parse, failure };
