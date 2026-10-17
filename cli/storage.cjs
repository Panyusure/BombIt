'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT } = require('./runtime.cjs');
const WORK = path.join(ROOT, '.bombit');
function locations(directory) {
  const custom = directory || process.env.BOMBIT_SESSION_DIR;
  const sessions = path.resolve(custom || path.join(WORK, 'sessions'));
  return { sessions, replays: custom ? path.join(sessions, 'replays') : path.join(ROOT, 'data', 'replays'),
    games: path.join(WORK, 'tmp', 'games'), tests: path.join(WORK, 'tmp', 'tests'),
    cache: path.join(WORK, 'cache', 'browser-replays') };
}
function stamp(iso = new Date().toISOString()) {
  return new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
}
function recording(agent = 'agent', startedAt = new Date().toISOString()) {
  if (typeof agent !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(agent)) throw new Error('agent must use 1–24 lowercase letters, digits or hyphens, starting with a letter');
  return { id: crypto.randomBytes(3).toString('hex'), agent, startedAt };
}
function characters(config) { return config.chars.slice(0, config.mode === 'versus' ? 2 : 1); }
function stem(meta, config) { return `${stamp(meta.startedAt)}-${meta.agent}-${config.mode}-${characters(config).join('-vs-')}`; }
function basename(meta, config, outcome) { return `${stem(meta, config)}-${outcome}-${meta.id}.replay.json`; }
function findReplay(id, directory) {
  const folder = locations(directory).replays;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const file = path.join(folder, id + '.replay.json');
  return fs.existsSync(file) ? file : null;
}
function removeInside(root, target) {
  root = path.resolve(root); target = path.resolve(target);
  if (!target.startsWith(root + path.sep)) throw new Error('Refusing to remove a path outside its managed directory');
  if (!fs.existsSync(target)) return;
  const actualRoot = fs.realpathSync(root), actualTarget = fs.realpathSync(target);
  if (!actualTarget.startsWith(actualRoot + path.sep)) throw new Error('Refusing to remove a link outside its managed directory');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
function scratch(prefix) {
  const root = locations().tests; fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, prefix + '-'));
}
module.exports = { WORK, locations, stamp, recording, characters, stem, basename, findReplay, removeInside, scratch };
