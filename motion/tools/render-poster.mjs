import { newPage } from './cdp.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.MOTION_BASE || 'http://127.0.0.1:8173';
const out = join(root, 'motion', 'out');
await mkdir(out, { recursive: true });
const page = await newPage('about:blank');
try {
  await page.goto(`${base}/motion/?noscore=1`, 2500);
  const poster = await page.evaluate(`(()=>{ window.__motion.renderAt(45.35); return document.querySelector('#stage').toDataURL('image/png'); })()`);
  await writeFile(join(out, 'BombIt_MotionID_Poster.png'), Buffer.from(poster.split(',')[1], 'base64'));
  const cover = await page.evaluate(`(()=>{ window.__motion.renderCoverFrame(); return document.querySelector('#stage').toDataURL('image/png'); })()`);
  await writeFile(join(out, 'BombIt_MotionID_CoverArt.png'), Buffer.from(cover.split(',')[1], 'base64'));
  console.log('poster + cover written to', out);
} finally { await page.close(); }
