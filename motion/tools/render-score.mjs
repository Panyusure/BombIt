import { newPage, sleep } from './cdp.mjs';
import { mkdir, readdir, stat, copyFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.MOTION_BASE || 'http://127.0.0.1:8173';
const dl = join(root, '.bombit', 'tmp', 'motion', 'score');
const outDir = join(root, 'motion', 'out');
await mkdir(dl, { recursive: true });
await mkdir(outDir, { recursive: true });
for (const f of await readdir(dl)) await unlink(join(dl, f));

const page = await newPage('about:blank');
try {
  await page.send('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: dl.replaceAll('/', '\\'), eventsEnabled: true
  });
  await page.goto(`${base}/motion/?noscore=1`, 2000);
  console.log('synthesizing 48s score…');
  const info = await page.evaluate(`(async()=>{
    const buf = await M.Audio.render(()=>{});
    const blob = M.Audio.toWav(buf);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='BombIt_MotionID_Score.wav';
    a.click();
    return {duration:buf.duration,ch:buf.numberOfChannels,sr:buf.sampleRate,bytes:blob.size};
  })()`);
  console.log(info);
  let path = null;
  for (let i=0;i<60;i++) {
    const files = await readdir(dl);
    const wav = files.find(f => f.endsWith('.wav'));
    if (wav) {
      const s = await stat(join(dl, wav));
      if (s.size === info.bytes) { path = join(dl, wav); break; }
    }
    await sleep(300);
  }
  if (!path) throw new Error('score WAV was not downloaded');
  const dest = join(outDir, 'BombIt_MotionID_Score.wav');
  await copyFile(path, dest);
  console.log(`saved ${dest}`);
} finally {
  await page.close();
}
