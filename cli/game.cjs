'use strict';
const CHARACTERS = ['xiaonuo', 'axiu', 'arui', 'xiaoyan', 'xiaotian', 'weilai'];
const MODES = ['dig', 'adventure', 'versus'];
const DIRECTIONS = { none: [0, 0], up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
class GameError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireThat(condition, code, message) { if (!condition) throw new GameError(code, message); }
function normalizeConfig(options = {}) {
  const mode = options.mode ?? 'adventure';
  const character = options.character ?? 'xiaonuo', character2 = options.character2 ?? 'axiu';
  requireThat(MODES.includes(mode), 'INVALID_MODE', 'mode must be dig, adventure or versus');
  requireThat(CHARACTERS.includes(character) && CHARACTERS.includes(character2), 'INVALID_CHARACTER', 'Unknown character; run rules for available characters');
  const seed = options.seed ?? require('node:crypto').randomBytes(6).toString('hex');
  requireThat(typeof seed === 'string' && seed.length > 0 && seed.length <= 128, 'INVALID_SEED', 'seed must contain 1–128 characters');
  return { mode, seed, chars: [character, character2], inputMode: mode === 'versus' ? 'versus' : 'solo', label: mode };
}
function create(BI, config) {
  const world = BI.engine.create(config);
  // CLI has no blocking modal; introductions are still available in enemy/rules data.
  world.briefing = null;
  return world;
}
function normalizeAction(world, request) {
  const frames = request.frames ?? 12;
  requireThat(Number.isInteger(frames) && frames >= 1 && frames <= 60, 'INVALID_FRAMES', 'frames must be an integer from 1 to 60');
  const player = request.player ?? 'p1';
  requireThat(world.players.some(p => p.id === player), 'INVALID_PLAYER', 'Unknown player');
  requireThat(!(request.actions && (request.move !== undefined || request.bomb !== undefined || request.skill !== undefined || request.wait !== undefined)),
    'INVALID_ACTION', 'Use either actions or single-player flags');
  const raw = request.actions ?? { [player]: { move: request.move, bomb: request.bomb, skill: request.skill, wait: request.wait } };
  requireThat(raw && typeof raw === 'object' && !Array.isArray(raw), 'INVALID_ACTION', 'actions must be an object keyed by player ID');
  const actions = {};
  for (const [id, action] of Object.entries(raw)) {
    requireThat(world.players.some(p => p.id === id), 'INVALID_PLAYER', `Unknown player: ${id}`);
    requireThat(action && typeof action === 'object' && !Array.isArray(action), 'INVALID_ACTION', 'Each action must be an object');
    requireThat(Object.keys(action).every(k => ['move', 'bomb', 'skill', 'wait'].includes(k)), 'INVALID_ACTION', 'Unknown action field');
    const move = action.move ?? 'none';
    requireThat(Object.hasOwn(DIRECTIONS, move), 'INVALID_MOVE', 'move must be up, down, left, right or none');
    for (const key of ['bomb', 'skill', 'wait']) requireThat(action[key] === undefined || typeof action[key] === 'boolean', 'INVALID_ACTION', `${key} must be boolean`);
    requireThat(!(action.wait && (move !== 'none' || action.bomb || action.skill)), 'INVALID_ACTION', 'wait cannot be combined with another action');
    actions[id] = { move, bomb: !!action.bomb, skill: !!action.skill };
  }
  return { frames, actions };
}
function advance(BI, world, action) {
  const events = [], start = world.frame;
  let stopReason = 'frames_complete';
  if (world.match.over) return { advancedFrames: 0, stopReason: 'finished', events };
  for (let frame = 0; frame < action.frames; frame++) {
    const inputs = {};
    for (const [id, a] of Object.entries(action.actions)) {
      const [hx, hy] = DIRECTIONS[a.move];
      inputs[id] = { hx, hy, bomb: frame === 0 && a.bomb, skill: frame === 0 && a.skill, quietBlocked: true };
      const p = world.playerById(id);
      if (frame === 0 && !p.alive && (a.bomb || a.skill)) events.push({ type: 'action_rejected', player: id, reason: 'dead', frame: world.frame });
    }
    const before = world.players.map(p => [p.x, p.y]);
    const tick = BI.engine.step(world, inputs, BI.engine.STEP);
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i], a = action.actions[p.id];
      if (frame === 0 && a && a.move !== 'none' && p.alive && p.x === before[i][0] && p.y === before[i][1]) {
        events.push({ type: 'blocked', player: p.id, frame: world.frame });
      }
    }
    events.push(...tick);
    // A new level's introduction is represented as an event, not a keyboard modal.
    if (world.briefing) { world.briefing = null; }
    const stop = tick.find(e => ['onDeath', 'level_started', 'round_started', 'match_over'].includes(e.type));
    if (stop) { stopReason = stop.type; break; }
  }
  return { advancedFrames: world.frame - start, stopReason, events };
}
function rules(BI) {
  return { protocol: 'bombit/1', modes: MODES, characters: CHARACTERS.map(id => ({ id,
    name: BI.CHARACTERS.characters[id].name, skill: BI.SKILLS[id] })),
    timing: { fps: 60, defaultFrames: 12, maxFrames: 60, fuseSeconds: BI.config.FUSE,
      fuseAppliesTo: 'players, all enemies and bosses',
      flameSeconds: BI.config.FLAME_TIME, movementTilesPerSecond: BI.config.SPEED_BASE,
      actionOrder: ['move', 'skill', 'bomb'], pulse: 'bomb and skill fire once on the first frame',
      pause: 'Only act, batch, path and goTo advance game time. Every request releases its inputs afterwards.' },
    control: { recommendedTransport: 'node cli/bombit.cjs serve --memory',
      operations: ['new','state','act','batch','path','goTo','checkpoint','finish','replay','export','rules'],
      batch: { steps: '1..1024 normal action objects; one final state; stops on death or scene transition' },
      navigation: { path: '1..256 adjacent [col,row] cells', target: 'goTo uses [col,row] with shortest walking route',
        maxFrames: '1..3600, default 3600', safety: 'Walls and current blocking bombs only; does not avoid predicted hazards' },
      memory: 'No per-action disk writes. checkpoint saves recovery state; finish or stdin EOF verifies and archives. Forced termination loses uncheckpointed actions.' },
    coordinates: { origin: 'top-left', col: 'right, zero-based', row: 'down, zero-based', tileSize: BI.config.TILE },
    legend: { '#': 'hard wall', '+': 'breakable brick', '.': 'floor', '1': 'p1', '2': 'p2',
      E: 'enemy', X: 'boss', o: 'bomb', '*': 'flame', '!': 'poison', '?': 'poison warning', i: 'item', '=': 'moving track' },
    objectives: { dig: 'Destroy every brick within 180 seconds; start with 3 lives.',
      adventure: 'Clear all enemies across 10 levels; bosses at levels 5 and 10.',
      versus: 'Two externally controlled players. First to 2 points; submit both actions in one request.' },
    tips: ['Read state freely: thinking does not consume game time.',
      'Place a bomb while standing still, then move away and turn a corner. Bombs reach along rows and columns.',
      '12 frames moves about 0.92 tiles at base speed. Use fewer frames near a turn; positions are continuous.',
      'Use --assist for conservative danger windows. Poison warnings are separate.',
      'versus does not supply a built-in second player; omitted player actions mean wait.'],
    scenery: { factory: 'Carries players, enemies, bosses and bombs clockwise at 1.65 tiles/second.',
      park: 'Carries idle players/enemies/bosses and bombs clockwise at 1.8 tiles/second; active walking can leave the ride. Only players earn the lap shield.',
      timeStop: 'Freezes enemy movement and enemy-bomb transport; stun does not stop environmental transport.' },
    items: BI.ITEM_INFO };
}
module.exports = { create, normalizeConfig, normalizeAction, advance, rules, GameError, requireThat };
