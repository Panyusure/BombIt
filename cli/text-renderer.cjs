'use strict';
function render(result) {
  if (!result.ok) return `ERROR ${result.error.code}: ${result.error.message}`;
  if (result.rules) return JSON.stringify(result.rules, null, 2);
  if (result.replay) return JSON.stringify(result.replay, null, 2);
  const s = result.state, cols = s.map.cols, rows = s.map.rows;
  const board = s.map.terrain.map(line => [...line]);
  const put = (c, r, symbol) => { if (c >= 0 && c < cols && r >= 0 && r < rows) board[r][c] = symbol; };
  for (const [c, r] of s.map.landmark?.path || []) if (board[r]?.[c] === '.') put(c, r, '=');
  for (const item of s.items) put(item.col, item.row, 'i');
  for (const bomb of s.bombs) put(bomb.col, bomb.row, 'o');
  for (const f of s.flames) for (const [c, r] of f.cells) put(c, r, '*');
  for (const p of s.poison) put(p.c, p.r, p.warn > 0 ? '?' : '!');
  for (const e of s.enemies) if (e.alive) put(e.col, e.row, e.type === 'boss' ? 'X' : 'E');
  for (const p of s.players) if (p.alive) put(p.col, p.row, p.id === 'p1' ? '1' : '2');
  const lines = [`BombIt | ${result.session} | revision ${result.revision} | ${s.mode} | ${s.phase}`,
    `Frame ${s.frame} | ${s.time.toFixed(2)}s | level ${s.match.level} | round ${s.match.round} | ${s.map.theme}`,
    `Bricks ${s.bricksLeft} | Enemies ${s.enemiesLeft} | Time left ${s.match.remaining.toFixed(1)}s | Score ${s.match.scores.p1}:${s.match.scores.p2}`,
    '', '    ' + Array.from({ length: cols }, (_, c) => c.toString(16).toUpperCase()).join(' ')];
  board.forEach((line, r) => lines.push(String(r).padStart(2) + '  ' + line.join(' ')));
  lines.push('', '# wall  + brick  . floor  1/2 player  E enemy  X boss  o bomb  * flame  ?/! poison  i item  = track');
  for (const p of s.players) lines.push(`${p.id} ${p.character}: (${p.col},${p.row}) xy=(${p.x.toFixed(1)},${p.y.toFixed(1)}) lives=${p.lives} alive=${p.alive} power=${p.power} bombs=${p.bombsOut}/${p.maxBombs} skill=${p.skillReady ? 'ready' : p.skill.passive ? 'passive' : p.skillCd.toFixed(2)+'s'}`);
  for (const b of s.bombs) lines.push(`Bomb ${b.ownerId} (${b.col},${b.row}) fuse=${b.fuse.toFixed(2)}s power=${b.power}`);
  if (result.advancedFrames !== undefined) lines.push(`Advanced ${result.advancedFrames} frames; ${result.stopReason || 'created'}`);
  if (result.reached !== undefined) lines.push(`Destination ${result.reached ? 'reached' : 'not reached'}; ${result.completedWaypoints}/${result.plannedPath.length} waypoints`);
  if (result.verified) lines.push(result.actions === undefined ? 'Replay verified' : `Replay verified: ${result.actions} actions; ${result.hash}`);
  if (result.replayFile) lines.push(`Recording: ${result.replayFile}`);
  for (const e of result.events || []) lines.push(`  ${e.type} ${JSON.stringify(e)}`);
  if (s.match.over) lines.push(`RESULT: ${s.match.winner} | ${s.match.title} | ${s.match.subtitle}`);
  return lines.join('\n');
}
module.exports = { render };
