#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { runtime, ROOT } = require('./runtime.cjs');
const { handle, hash } = require('./session.cjs');
async function prepare({ session, file, directory, cacheDirectory } = {}) {
  const BI = runtime();
  let replay, label;
  if (file) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
    replay = raw.replay || raw;
    // Use the same validator as the browser, then verify the recorded hashes.
    const { Player } = require('../replay/core.js'); await new Player(BI, replay).build(hash);
    label = replay.recording?.name || path.basename(file,'.replay.json');
  } else {
    if (!session) {
      const folder = require('./storage.cjs').locations(directory).replays;
      const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter(name => name.endsWith('.replay.json')) : [];
      if (!files.length) return pathToFileURL(path.join(ROOT,'replay.html')).href;
      files.sort((a,b) => {
        const readDate = name => { const r=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8')); return new Date(r.recording?.endedAt || r.recording?.startedAt || fs.statSync(path.join(folder,name)).mtime).getTime(); };
        return readDate(b)-readDate(a);
      });
      session = files[0].replace(/\.replay\.json$/,'');
    }
    handle(BI, { op: 'replay', session }, directory);
    replay = handle(BI, { op: 'export', session }, directory).replay;
    label = session;
  }
  const output = cacheDirectory || require('./storage.cjs').locations().cache; fs.mkdirSync(output, { recursive: true });
  const target = path.join(output, 'current.js');
  fs.writeFileSync(target, 'window.BOMBIT_REPLAY_DATA=' + JSON.stringify(replay) + ';\n');
  const relative = path.relative(ROOT, target).split(path.sep).join('/');
  return pathToFileURL(path.join(ROOT, 'replay.html')).href + '?bundle=' + encodeURIComponent(relative) + '&name=' + encodeURIComponent(label);
}
async function main() {
  const options = {}, argv = process.argv.slice(2); let open = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-open') { open = false; continue; }
    const names = { '--session': 'session', '--file': 'file', '--session-dir': 'directory' }, name = names[argv[i]];
    if (!name || !argv[i + 1]) throw new Error('Usage: node cli/watch.cjs [--session ID | --file REPLAY.json] [--no-open]');
    options[name] = argv[++i];
  }
  if (options.session && options.file) throw new Error('Choose either --session or --file.');
  const url = await prepare(options);
  console.log('Replay ready: ' + url);
  if (open) {
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', error => { console.error('Could not open browser: ' + error.message + '\nOpen the URL above manually.'); process.exitCode = 1; }); child.unref();
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepare };
