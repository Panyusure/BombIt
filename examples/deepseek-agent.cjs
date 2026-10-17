// BombIt CLI agent —— 冒险模式 10 关
const { spawn } = require('node:child_process');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

let SESSION = process.argv[2] || null;
const MAX_ACTS = Number(process.argv[3] || 40000);
const say = (s) => console.log(s);

const proc = spawn(process.execPath, ['cli/bombit.cjs', 'serve', '--memory'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
proc.on('exit', (code, sig) => say('[cli-exit] code=' + code + ' sig=' + sig));
proc.stdin.on('error', (e) => say('[stdin-err] ' + e.message));
process.on('uncaughtException', (e) => stopWithError(e));
process.on('unhandledRejection', (e) => stopWithError(e));
proc.stderr.on('data', (d) => say('[cli-stderr] ' + String(d).trim()));
let buf = '';
const waiting = [];
proc.stdout.setEncoding('utf8');
proc.stdout.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch (e) { say('[bad-json] ' + line.slice(0, 200)); continue; }
    const w = waiting.shift();
    if (w) w(msg); else say('[unexpected] ' + line.slice(0, 200));
  }
});
function op(obj) { return new Promise((resolve) => { waiting.push(resolve); proc.stdin.write(JSON.stringify(obj) + '\n'); }); }
let reqN = 0;
let state = null;

async function act(a) {
  const req = { op: 'act', session: SESSION, frames: a.frames == null ? 12 : a.frames, requestId: 'p' + process.pid + '-' + (++reqN), assist: true };
  if (a.move) req.move = a.move;
  if (a.bomb) req.bomb = true;
  if (a.skill) req.skill = true;
  const res = await op(req);
  if (!res.ok) { say('[act-fail] ' + JSON.stringify(res.error)); throw new Error('act failed'); }
  state = res.state; SESSION = res.session;
  for (const ev of res.events || []) noteEvent(ev);
  return res;
}
async function observe() {
  const res = await op({ op: 'state', session: SESSION, assist: true });
  if (!res.ok) throw new Error('state failed: ' + JSON.stringify(res.error));
  state = res.state;
  return state;
}

let COLS = 15, ROWS = 13;
const G = { terrain: [], danger: new Map(), poison: new Set(), bombs: new Set() };
function rebuild() {
  COLS = state.map.cols; ROWS = state.map.rows;
  G.terrain = state.map.terrain.map((l) => l.split(''));
  G.danger = new Map();
  for (const e of (state.assist && state.assist.dangerWindows) || []) G.danger.set(e.col + ',' + e.row, e.windows.slice());
  G.poison = new Set((state.poison || []).filter((p) => p.life > 0 || p.warn == null || p.warn <= 2).map((p) => p.c + ',' + p.r));
  G.bombs = new Set((state.bombs || []).map((b) => b.col + ',' + b.row));
}
const inb = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
const tile = (c, r) => (inb(c, r) ? G.terrain[r][c] : '#');
const wall = (c, r) => tile(c, r) === '#';
const brick = (c, r) => tile(c, r) === '+';
const k = (c, r) => c + ',' + r;
const me = () => state.players.find((p) => p.id === 'p1');
const speedOf = () => Math.max(1, me().speedTilesPerSecond || 4.6);
const cellTime = () => 1 / speedOf() + 0.02;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function hot(c, r, t0, t1) {
  if (G.poison.has(k(c, r))) return true;
  return windowsOf(c, r).some(([s, e]) => e > t0 && s < t1);
}
function windowsOf(c, r) { return G.danger.get(k(c, r)) || []; }
function blastSet(c, r, power) {
  const out = new Set([k(c, r)]);
  for (const [dc, dr] of DIRS) {
    for (let i = 1; i <= power; i++) {
      const cc = c + dc * i, rr = r + dr * i;
      if (!inb(cc, rr)) break;
      if (wall(cc, rr)) break;
      out.add(k(cc, rr));
      if (brick(cc, rr)) break;
    }
  }
  return out;
}
function passable(c, r) {
  return inb(c, r) && G.terrain[r][c] === '.' && !G.bombs.has(k(c, r));
}

function bfs(start, goal) {
  const prev = new Map([[k(start[0], start[1]), null]]);
  const at = new Map([[k(start[0], start[1]), 0]]);
  const q = [start]; let head = 0;
  while (head < q.length && prev.size < 900) {
    const [c, r] = q[head++];
    const t = at.get(k(c, r));
    if ((c !== start[0] || r !== start[1]) && goal(c, r, t)) {
      const path = []; let cur = k(c, r);
      while (cur) { const [pc, pr] = cur.split(',').map(Number); path.push([pc, pr]); cur = prev.get(cur); }
      return path.reverse();
    }
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr, nk = k(nc, nr);
      if (prev.has(nk) || !passable(nc, nr)) continue;
      const nt = t + cellTime();
      if (hot(nc, nr, nt, nt + 0.3)) continue;
      prev.set(nk, k(c, r)); at.set(nk, nt); q.push([nc, nr]);
    }
  }
  return null;
}

// 放弹前的活路：终点必须完全离开自己的火焰，且未来 3 秒无危险
function escapePlan(from, blast) {
  const fuseSafe = 2.4 - 0.3;
  const prev = new Map([[k(from[0], from[1]), null]]);
  const at = new Map([[k(from[0], from[1]), 0]]);
  const q = [from]; let head = 0;
  while (head < q.length) {
    const [c, r] = q[head++];
    const t = at.get(k(c, r));
    const key = k(c, r);
    if (key !== k(from[0], from[1]) && !blast.has(key) && t < fuseSafe && !hot(c, r, t, t + 2.9)) {
      const path = []; let cur = key;
      while (cur) { const [pc, pr] = cur.split(',').map(Number); path.push([pc, pr]); cur = prev.get(cur); }
      return path.reverse();
    }
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr, nk = k(nc, nr);
      if (prev.has(nk) || !passable(nc, nr)) continue;
      const nt = t + cellTime();
      if (nt >= fuseSafe) continue;
      if (hot(nc, nr, nt, nt + 0.3)) continue;   // 只考虑别处炸弹的危险窗
      prev.set(nk, k(c, r)); at.set(nk, nt); q.push([nc, nr]);
    }
  }
  return null;
}

async function stepTo(target, force) {
  const p = me();
  const dc = target[0] - p.col, dr = target[1] - p.row;
  if (dc === 0 && dr === 0) { await act({ move: 'none', frames: 4 }); return false; }
  // 硬闸门：目标格在抵达后 3 秒内会变危险就别去（撤离时例外）。被拦下也必须推进时间，否则游戏时钟会冻结。
  if (!force) {
    if (hot(target[0], target[1], 0, 1.2)) { await act({ move: 'none', frames: 6 }); return false; }
  }
  const dir = Math.abs(dc) >= Math.abs(dr) ? (dc > 0 ? 'right' : 'left') : (dr > 0 ? 'down' : 'up');
  const tx = (target[0] + 0.5) * 48, ty = (target[1] + 0.5) * 48;
  const dist = (dir === 'left' || dir === 'right') ? Math.abs(tx - p.x) : Math.abs(ty - p.y);
  const pxPerFrame = (speedOf() * 48) / 60;
  const frames = Math.max(1, Math.min(60, Math.round(dist / pxPerFrame)));
  await act({ move: dir, frames });
  return true;
}

function noteEvent(ev) {
  const t = ev.type || ev.kind || '';
  if (/level_started|match_over|onDeath|onBossPhase|onEnemyDeath|onPickup|onExplode/i.test(t)) {
    say('[evt] ' + JSON.stringify(ev).slice(0, 220));
  }
}

const aliveEnemies = () => (state.enemies || []).filter((e) => e.alive);
const dist = (c, r, e) => Math.abs(c - e.col) + Math.abs(r - e.row);

function softPath(start, goal) {
  const weights = new Map([[k(start[0], start[1]), 0]]);
  const prev = new Map([[k(start[0], start[1]), null]]);
  const open = [[0, start[0], start[1]]];
  let guard = 0;
  while (open.length && guard++ < 5000) {
    open.sort((a, b) => a[0] - b[0]);
    const [w, c, r] = open.shift();
    const cur = k(c, r);
    if (weights.get(cur) < w) continue;
    if (c === goal[0] && r === goal[1]) {
      const path = []; let walk = cur;
      while (walk) { const [pc, pr] = walk.split(',').map(Number); path.push([pc, pr]); walk = prev.get(walk); }
      return path.reverse();
    }
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (!inb(nc, nr) || wall(nc, nr)) continue;
      const nk = k(nc, nr);
      const nw = w + (brick(nc, nr) ? 8 : 1);
      if (weights.has(nk) && weights.get(nk) <= nw) continue;
      weights.set(nk, nw); prev.set(nk, cur);
      open.push([nw, nc, nr]);
    }
  }
  return null;
}

async function main() {
  const initial = await op(SESSION ? {op:'state',session:SESSION,assist:true} : {op:'new',agent:'deepseek',mode:'adventure',seed:'demo',assist:true});
  if(!initial.ok) throw new Error(JSON.stringify(initial.error));
  SESSION=initial.session; state=initial.state;
  say('[start] level=' + state.match.level + ' theme=' + state.map.theme + ' enemies=' + aliveEnemies().length +
      ' bricks=' + state.bricksLeft + ' lives=' + me().lives);

  let levelSeen = 0, acts = 0;
  let escape = null;   // { path, expireFrame }：放弹前算好的撤离路线，放完照着跑
  while (acts++ < MAX_ACTS) {
    rebuild();
    const p = me();
    if (state.phase === 'finished') { say('[end] finished winner=' + state.match.winner + ' level=' + state.match.level); break; }
    if (state.phase !== 'playing') { await act({ move: 'none', frames: 12 }); continue; }
    if (state.match.level !== levelSeen) {
      levelSeen = state.match.level;
      say('[level] ' + levelSeen + ' theme=' + state.map.theme + ' enemies=' + aliveEnemies().length +
          ' bricks=' + state.bricksLeft + ' lives=' + p.lives + ' power=' + p.power);
    }
    if (!p.alive) { escape = null; await act({ move: 'none', frames: 12 }); continue; }

    // 0) 正在撤离：严格按放弹前算好的路线走，不重新规划
    if (escape) {
      if (state.frame >= escape.expireFrame || !hot(p.col, p.row, 0, 3.0)) { escape = null; }
      else {
        const i = escape.path.findIndex(([c, r]) => c === p.col && r === p.row);
        say('[esc] f=' + state.frame + ' me=' + p.col + ',' + p.row + ' i=' + i + ' len=' + escape.path.length + ' path=' + JSON.stringify(escape.path));
        if (i >= 0 && i < escape.path.length - 1) {
          await stepTo(escape.path[i + 1], true);
          continue;
        }
        escape = null;
      }
    }

    const enemies = aliveEnemies();
    const myKey = k(p.col, p.row);

    // 1) 脚下在 3 秒内会危险 -> 逃到"未来 3 秒都安全"的格
    if (hot(p.col, p.row, 0, 3.0)) {
      const esc = bfs([p.col, p.row], (c, r, t) => !hot(c, r, t, t + 3.2));
      if (esc && esc.length > 1) { await stepTo(esc[1], true); continue; }
      // 没安全格：选"最晚变危险"的邻格；自己脚下已经在烧才允许进 0 秒格
      const myStart = windowsOf(p.col, p.row).length ? Math.min(...windowsOf(p.col, p.row).map((w) => w[0])) : 99;
      let best = null;
      for (const [dc, dr] of DIRS) {
        const c = p.col + dc, r = p.row + dr;
        if (!passable(c, r)) continue;
        const ws = windowsOf(c, r);
        const start = ws.length ? Math.min(...ws.map((w) => w[0])) : 99;
        if (!best || start > best.start) best = { c, r, start };
      }
      say('[flee-fallback] f=' + state.frame + ' me=' + p.col + ',' + p.row + ' bestStart=' + (best && best.start) + ' myStart=' + myStart);
      if (best && (best.start > 0.35 || myStart <= 0.05)) { await stepTo([best.c, best.r], true); continue; }
      await act({ move: 'none', frames: 5 });
      continue;
    }

    // 2) 能一发命中 -> 冻结 + 放弹 + 按撤离路线跑
    if (enemies.length && p.bombsOut < p.maxBombs) {
      const blast = blastSet(p.col, p.row, p.power);
      const hit = enemies.filter((e) => blast.has(k(e.col, e.row)));
      if (hit.length) {
        // 连锁风险：我的火焰里有别人的炸弹，会提前引爆
        const chain = (state.bombs || []).filter((b) => b.ownerId !== 'p1' && blast.has(k(b.col, b.row)));
        const chainFuse = chain.length ? Math.min(...chain.map((b) => b.fuse)) : 99;
        const esc = chainFuse > 1.2 ? escapePlan([p.col, p.row], blast) : null;
        if (esc && esc.length > 1) {
          const near = Math.min(...hit.map((e) => dist(p.col, p.row, e)));
          const useSkill = p.skillReady && near <= 3;
          const fuse = Math.min(2.4, chainFuse);
          await act({ move: 'none', frames: 1, bomb: true, skill: useSkill });
          say('[bomb] lvl=' + state.match.level + ' at ' + p.col + ',' + p.row + ' hits=' + hit.length +
              ' skill=' + useSkill + ' chainFuse=' + (chainFuse === 99 ? '-' : chainFuse.toFixed(2)));
          escape = { path: esc, expireFrame: state.frame + Math.round(fuse * 60) + 20 };
          await stepTo(esc[1]);
          continue;
        }
      }
    }

    // 3) 吃道具
    const want = { fire: 6, bomb: 5, fruit: 5, star: 5, speed: 4, shield: 3, kick: 1, glove: 1 };
    const items = (state.items || []).filter((it) => want[it.type])
      .map((it) => ({ ...it, d: Math.abs(it.col - p.col) + Math.abs(it.row - p.row) }))
      .sort((a, b) => (want[b.type] - want[a.type]) || (a.d - b.d))
      .filter((it) => it.d <= 7);
    if (items.length) {
      const it = items[0];
      const path = bfs([p.col, p.row], (c, r, t) => c === it.col && r === it.row && !hot(c, r, t, t + 2.5));
      if (path && path.length > 1) { await stepTo(path[1]); continue; }
    }

    // 4) 逼近敌人，走到能命中它的位置
    if (enemies.length) {
      const order = enemies.slice().sort((a, b) => dist(p.col, p.row, a) - dist(p.col, p.row, b));
      let moved = false;
      for (const e of order) {
        const cands = [];
        for (const [dc, dr] of DIRS) {
          for (let d = 1; d <= p.power; d++) {
            const c = e.col + dc * d, r = e.row + dr * d;
            if (!passable(c, r)) break;
            if (blastSet(c, r, p.power).has(k(e.col, e.row))) cands.push([c, r]);
            if (brick(c, r)) break;
          }
        }
        for (const [dc, dr] of DIRS) {
          const c = e.col + dc, r = e.row + dr;
          if (passable(c, r) && !cands.some((q) => q[0] === c && q[1] === r)) cands.push([c, r]);
        }
        if (!cands.length) continue;
        let best = null;
        for (const cd of cands) {
          const path = bfs([p.col, p.row], (c, r, t) => c === cd[0] && r === cd[1] && !hot(c, r, t, t + 2.5));
          if (path && (!best || path.length < best.length)) best = path;
        }
        if (best && best.length > 1) { await stepTo(best[1]); moved = true; break; }
      }
      if (moved) continue;
    }

    // 5) 拆砖推进
    if (enemies.length) {
      const e = enemies.slice().sort((a, b) => dist(p.col, p.row, a) - dist(p.col, p.row, b))[0];
      const soft = softPath([p.col, p.row], [e.col, e.row]);
      const firstBrick = soft && soft.find(([c, r]) => brick(c, r));
      if (firstBrick) {
        const spots = DIRS.map(([dc, dr]) => [firstBrick[0] + dc, firstBrick[1] + dr])
          .filter(([c, r]) => passable(c, r) && blastSet(c, r, p.power).has(k(firstBrick[0], firstBrick[1])));
        let done = false;
        if (spots.some(([c, r]) => c === p.col && r === p.row) && p.bombsOut < p.maxBombs) {
          const blast = blastSet(p.col, p.row, p.power);
          const chain = (state.bombs || []).filter((b) => b.ownerId !== 'p1' && blast.has(k(b.col, b.row)));
          const chainFuse = chain.length ? Math.min(...chain.map((b) => b.fuse)) : 99;
          const esc = chainFuse > 1.2 ? escapePlan([p.col, p.row], blast) : null;
          if (esc && esc.length > 1) {
            await act({ move: 'none', frames: 1, bomb: true });
            say('[dig] lvl=' + state.match.level + ' bomb brick ' + firstBrick.join(',') + ' from ' + p.col + ',' + p.row);
            escape = { path: esc, expireFrame: state.frame + Math.round(Math.min(2.4, chainFuse) * 60) + 20 };
            await stepTo(esc[1]);
            continue;
          }
        }
        for (const sp of spots) {
          const path = bfs([p.col, p.row], (c, r) => c === sp[0] && r === sp[1]);
          if (path && path.length > 1) { await stepTo(path[1]); done = true; break; }
        }
        if (done) continue;
      }
    }

    // 6) 无事可做：等一小会
    say('[stall] f=' + state.frame + ' me=' + p.col + ',' + p.row + ' enemies=' + enemies.length +
        ' bricks=' + state.bricksLeft + ' bombsOut=' + p.bombsOut);
    await act({ move: 'none', frames: 10 });
  }

  say('[done] acts=' + acts + ' phase=' + state.phase + ' level=' + state.match.level +
      ' stats=' + JSON.stringify(state.stats) + ' lives=' + me().lives);
  try {
    const rep = await op({ op: 'replay', session: SESSION });
    say('[replay] ok=' + rep.ok);
  } catch (e) { say('[replay-err] ' + e.message); }
  const saved=await op({op:'finish',session:SESSION});
  if(!saved.ok)throw new Error(JSON.stringify(saved.error));
  SESSION=saved.session; say('[recording] '+saved.replayFile);
  proc.stdin.end();
  setTimeout(() => { proc.kill(); }, 200);
}

let stopping = false;
async function stopWithError(error) {
  if (stopping) return;
  stopping = true; say('[fatal] ' + (error && error.stack || error));
  if (SESSION && state) {
    let timer;
    try {
      const saved = await Promise.race([op({op:'finish',session:SESSION}), new Promise((_,reject) => {timer=setTimeout(()=>reject(new Error('archive timeout')),3000);})]);
      if (!saved.ok) throw new Error(JSON.stringify(saved.error));
      SESSION = saved.session; say('[recording] ' + saved.replayFile);
    } catch (e) { say('[working-save-retained] ' + e.message); }
    finally { clearTimeout(timer); }
  }
  try { proc.stdin.end(); } catch {}
  process.exitCode = 1; setTimeout(()=>{try{proc.kill();}catch{}},200);
}
main().catch(stopWithError);
