#!/usr/bin/env node
'use strict';
// A small reference agent. It sees only CLI JSON responses and never imports the engine.
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const key = ([c, r]) => `${c},${r}`;
function option(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function paths(state, start, blocked = new Set()) {
  const queue = [{ cell: start, path: [] }], visited = new Set([key(start)]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const [dc, dr] of DIRS) {
      const cell = [current.cell[0] + dc, current.cell[1] + dr], id = key(cell);
      if (visited.has(id) || blocked.has(id) || state.map.terrain[cell[1]]?.[cell[0]] !== '.') continue;
      visited.add(id); queue.push({ cell, path: [...current.path, cell] });
    }
  }
  return queue;
}
function blast(state, start, power) {
  const cells = new Set([key(start)]); let bricks = 0;
  for (const [dc, dr] of DIRS) for (let i = 1; i <= power; i++) {
    const cell = [start[0] + dc * i, start[1] + dr * i], t = state.map.terrain[cell[1]]?.[cell[0]];
    if (!t || t === '#') break;
    cells.add(key(cell));
    if (t === '+') { bricks++; break; }
  }
  return { cells, bricks };
}
function escape(state, cell, power) {
  const danger = blast(state, cell, power).cells;
  const track = new Set((state.map.landmark?.path || []).map(key));
  const speed = state.players[0].speedTilesPerSecond;
  return paths(state, cell, new Set([key(cell)])).find(p =>
    !danger.has(key(p.cell)) && !track.has(key(p.cell)) && p.path.length / speed < 1.8);
}
async function main() {
  let session = option('session', undefined), didCreate = false;
  const seed = option('seed', 'agent-demo-3');
  const child = spawn(process.execPath, [path.join(ROOT, 'cli/bombit.cjs'), 'serve', '--memory'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
  const output = readline.createInterface({ input: child.stdout });
  const pending = [];
  output.on('line', line => {
    const item = pending.shift();
    if (item) { try { item.resolve(JSON.parse(line)); } catch (error) { item.reject(error); } }
  });
  child.on('error', error => { for (const p of pending.splice(0)) p.reject(error); });
  child.on('exit', code => { for (const p of pending.splice(0)) p.reject(new Error(`CLI exited (${code})`)); });
  async function request(req) {
    const result = await new Promise((resolve, reject) => { pending.push({ resolve, reject }); child.stdin.write(JSON.stringify(req) + '\n'); });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result;
  }
  let state, revision = 0, sequence = 0;
  async function act(action) {
    const result = await request({ op: 'act', session, expectRevision: revision, requestId: `agent-${sequence++}`, ...action });
    state = result.state; revision = result.revision;
    session = result.session;
    return result;
  }
  async function go(cell) {
    for (let attempts = 0; attempts < 16 && !state.match.over; attempts++) {
      const p = state.players[0], dx = (cell[0] + .5) * 48 - p.x, dy = (cell[1] + .5) * 48 - p.y;
      if (Math.abs(dx) <= 2.5 && Math.abs(dy) <= 2.5) return;
      const horizontal = Math.abs(dx) > Math.abs(dy), delta = horizontal ? dx : dy;
      const move = horizontal ? delta > 0 ? 'right' : 'left' : delta > 0 ? 'down' : 'up';
      const frames = Math.max(1, Math.min(60, Math.round(Math.abs(delta) / (p.speedTilesPerSecond * 48 / 60))));
      const result = await act({ move, frames });
      if (result.events.some(e => e.type === 'onDeath')) throw new Error('Agent died while moving');
      if (result.events.some(e => e.type === 'blocked')) throw new Error(`Route blocked approaching ${key(cell)}`);
    }
    if (!state.match.over) throw new Error(`Could not reach ${key(cell)}`);
  }
  try {
    const created = await request({ op: 'new', session, seed, mode: 'dig', character: 'arui', agent: 'reference' });
    session = created.session; didCreate = true;
    state = created.state;
    console.log(`Agent started ${session}, seed=${seed}, theme=${state.map.theme}, bricks=${state.bricksLeft}`);
    for (let cycle = 0; cycle < 160 && !state.match.over; cycle++) {
      const p = state.players[0], origin = [p.col, p.row];
      let best = null;
      for (const target of paths(state, origin)) {
        const hit = blast(state, target.cell, p.power);
        if (!hit.bricks || !escape(state, target.cell, p.power)) continue;
        const value = hit.bricks / (2.9 + target.path.length / p.speedTilesPerSecond);
        if (!best || value > best.value) best = { ...target, value };
      }
      if (!best) throw new Error('No bomb placement with a safe retreat was found');
      for (const cell of best.path) await go(cell);
      if (state.match.over) break;
      // Item pickups on the way may have increased firepower: recalculate retreat.
      const me = state.players[0], current = [me.col, me.row];
      const retreat = escape(state, current, me.power);
      if (!retreat) continue;
      await act({ bomb: true, frames: 1 });
      for (const cell of retreat.path) await go(cell);
      while ((state.bombs.length || state.flames.length) && !state.match.over) await act({ wait: true, frames: 12 });
      console.log(`  ${state.time.toFixed(1)}s: ${state.bricksLeft} bricks, power ${state.players[0].power}, lives ${state.players[0].lives}`);
    }
    const verified = await request({ op: 'replay', session });
    const saved = await request({ op: 'finish', session });
    session = saved.session;
    const replayFile = saved.replayFile;
    console.log(`Result: winner=${state.match.winner}, time=${state.time.toFixed(2)}s, bricks=${state.bricksLeft}, lives=${state.players[0].lives}`);
    console.log(`Replay verified=${verified.verified}, actions=${verified.actions}, file=${replayFile}`);
    if (state.match.winner !== 'p1') process.exitCode = 1;
  } finally {
    if (didCreate) {
      try { await request({ op: 'finish', session }); }
      catch (error) { console.error('Working save retained because archival failed: ' + error.message); }
    }
    child.stdin.end(); output.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
