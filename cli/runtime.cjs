'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const MODULES = ['assets/characters.js', 'src/core/config.js', 'src/core/rng.js',
  'src/game/grid.js', 'src/game/levelgen.js', 'src/game/motion.js', 'src/game/rules.js',
  'src/game/danger.js', 'src/game/entities.js', 'src/game/ai.js', 'src/game/match.js',
  'src/game/engine.js', 'src/game/snapshot.js', 'src/game/observation.js'];
function runtime() {
  const context = vm.createContext({});
  context.window = context;
  for (const file of MODULES) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  return context.BI;
}
module.exports = { runtime, ROOT };
