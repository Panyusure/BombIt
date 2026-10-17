'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const candidates = [process.env.BOMBIT_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
const browser = candidates.find(file => fs.existsSync(file));
if (!browser) { console.error('Browser not found. Set BOMBIT_BROWSER to an Edge/Chrome executable.'); process.exit(1); }
const storage = require('../cli/storage.cjs');
const directory = storage.scratch('browser');
const profile = path.join(directory, 'profile');
process.on('exit', code => {
  if (code === 0) {
    try { storage.removeInside(storage.locations().tests, directory); }
    catch (error) { console.error('Temporary browser files need cleanup: ' + directory); process.exitCode = 1; }
  } else console.error('Failure artifacts: ' + directory);
});
const replayTest = process.argv.includes('--replay');
let url = pathToFileURL(path.join(root, 'tests/browser.html')).href;
if (replayTest) {
  const B = require('../cli/runtime.cjs').runtime();
  const { create, normalizeConfig, normalizeAction, advance } = require('../cli/game.cjs');
  const { hash } = require('../cli/session.cjs');
  const config = normalizeConfig({ mode: 'adventure', seed: 'browser-replay' }), w = create(B, config), history = [];
  for (let i = 0; i < 80 && !w.match.over; i++) {
    const action = normalizeAction(w, { move: ['right','down','left','up'][Math.floor(i/4)%4], bomb: i%10===0, frames: 12 });
    const result = advance(B, w, action);
    history.push({ action, advancedFrames: result.advancedFrames, hash: hash(B.snapshot.save(w)) });
  }
  const bundle = { format: 'bombit-replay/1', engineVersion: '2', config, history, finalHash: hash(B.snapshot.save(w)) };
  const bundleFile = path.join(directory, 'replay.js');
  fs.writeFileSync(bundleFile, 'window.BOMBIT_REPLAY_DATA=' + JSON.stringify(bundle) + ';');
  url = pathToFileURL(path.join(root, 'replay.html')).href + '?bundle=' + encodeURIComponent(path.relative(root,bundleFile).split(path.sep).join('/')) + '&test=1';
}
const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--disable-sync',
  '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + profile,
  '--virtual-time-budget=15000', '--dump-dom', url];
// Optional for restricted test environments; normal browser execution keeps its sandbox.
if (process.argv.includes('--in-process')) args.unshift('--in-process-gpu', '--no-sandbox');
const result = spawnSync(browser, args, { encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
fs.writeFileSync(path.join(directory, 'browser-test.log'), result.stderr || '');
const match = result.stdout?.match(replayTest ? /BI_REPLAY_TEST_BEGIN([\s\S]*?)BI_REPLAY_TEST_END/ : /BI_TEST_BEGIN([\s\S]*?)BI_TEST_END/);
if (!match) { console.error('Browser produced no test report. See ' + path.join(directory,'browser-test.log')); process.exit(1); }
console.log(match[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').trim());
process.exit(/SUMMARY pass=\d+ fail=0\b/.test(match[1]) ? 0 : 1);
