'use strict';
const { requireThat, normalizeAction } = require('./game.cjs');
const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];
function normalizeNavigation(world, request) {
  requireThat(['move','bomb','skill','wait','actions','steps','frames'].every(k => request[k] === undefined),
    'INVALID_PATH', 'Navigation accepts only target/path, player and maxFrames; submit other actions separately');
  const player = request.player ?? 'p1';
  requireThat(world.players.some(p => p.id === player), 'INVALID_PLAYER', 'Unknown player');
  const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger);
  const cells = request.op === 'goTo' ? [request.target] : request.path;
  requireThat(Array.isArray(cells) && cells.length > 0 && cells.length <= 256 && cells.every(point),
    'INVALID_PATH', 'Use target: [col,row] or path: [[col,row],...], up to 256 cells');
  const maxFrames = request.maxFrames ?? 3600;
  requireThat(Number.isInteger(maxFrames) && maxFrames >= 1 && maxFrames <= 3600, 'INVALID_FRAMES', 'maxFrames must be 1..3600');
  return { player, cells, maxFrames };
}
function navigate(BI, world, spec, automatic, apply) {
  const G = BI.grid, tile = BI.config.TILE, p = world.playerById(spec.player);
  const start = [G.col(p.x), G.row(p.y)], key = c => c.join(',');
  const passable = ([c,r]) => G.inBounds(c,r,world.map) && !G.isWall(world.map,c,r) &&
    G.canStand(world.map, world.bombs, G.centerX(c), G.centerY(r), BI.config.BOX, p.id);
  let cells = spec.cells;
  if (automatic) {
    const target = key(cells[0]), queue = [start], parents = new Map([[key(start), null]]);
    for (let i = 0; i < queue.length && !parents.has(target); i++) {
      for (const [dc,dr] of DIRS) {
        const next = [queue[i][0]+dc,queue[i][1]+dr], id = key(next);
        if (!parents.has(id) && passable(next)) { parents.set(id,queue[i]); queue.push(next); }
      }
    }
    requireThat(parents.has(target), 'UNREACHABLE', 'No walking route to target in the current map');
    cells = [];
    for (let cell = spec.cells[0]; cell; cell = parents.get(key(cell))) cells.unshift(cell);
  }
  let last = start;
  for (const cell of cells) {
    requireThat(Math.abs(cell[0]-last[0])+Math.abs(cell[1]-last[1]) <= 1, 'INVALID_PATH', 'Path cells must be cardinal neighbours, starting at or next to the player');
    requireThat(key(cell) === key(start) || passable(cell), 'UNREACHABLE', 'Path includes a wall or blocking bomb');
    last = cell;
  }
  // Re-centre before leaving the current cell, including starts near a wall.
  if (key(cells[0]) !== key(start)) cells = [start,...cells];
  let frames = 0, completed = 0, stopReason = 'path_complete';
  if (!p.alive) return { reached: false, completedWaypoints: 0, plannedPath: cells, stopReason: 'dead' };
  outer: for (const [c,r] of cells) {
    let stalled = 0;
    while (true) {
      const dx = G.centerX(c)-p.x, dy = G.centerY(r)-p.y;
      // A frame is indivisible; accept the nearest frame to the cell centre.
      const speed = BI.observe(world,false).players.find(a => a.id === p.id).speedTilesPerSecond * tile / 60;
      const tolerance = Math.max(1, speed/2 + 0.05);
      if (Math.abs(dx) <= tolerance && Math.abs(dy) <= tolerance) { completed++; break; }
      if (frames >= spec.maxFrames) { stopReason = 'frame_limit'; break outer; }
      const horizontal = Math.abs(dx) > Math.abs(dy), delta = horizontal ? dx : dy;
      // Small chunks allow speed changes and moving terrain to be observed internally.
      const count = Math.max(1,Math.min(8,spec.maxFrames-frames,Math.round(Math.abs(delta)/speed)));
      const action = normalizeAction(world,{ player: p.id, move: horizontal ? delta > 0 ? 'right':'left' : delta > 0 ? 'down':'up', frames: count });
      const before = Math.hypot(dx,dy), result = apply(action);
      frames += result.advancedFrames;
      if (result.stopReason !== 'frames_complete') { stopReason = result.stopReason; break outer; }
      const after = Math.hypot(G.centerX(c)-p.x,G.centerY(r)-p.y);
      stalled = after >= before-0.01 ? stalled+1 : 0;
      if (stalled >= 3) { stopReason = 'blocked'; break outer; }
    }
  }
  return { reached: completed === cells.length, completedWaypoints: completed, plannedPath: cells, stopReason };
}
module.exports = { normalizeNavigation, navigate };
