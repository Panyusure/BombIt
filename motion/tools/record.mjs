import { newPage, sleep } from './cdp.mjs';
import { mkdir, readdir, stat, copyFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.MOTION_BASE || 'http://127.0.0.1:8173';
const dl = join(root, '.bombit', 'tmp', 'motion', 'record');
const outDir = join(root, 'motion', 'out');
await mkdir(dl, { recursive: true });
await mkdir(outDir, { recursive: true });
for (const f of await readdir(dl)) await unlink(join(dl, f));

const page = await newPage('about:blank');
const errors = [];
page.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
page.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push(p.args.map(a => a.value || a.description).join(' ')); });

async function waitFile(name, maxSec = 60) {
  const path = join(dl, name);
  let last = -1, stable = 0;
  for (let i = 0; i < maxSec * 4; i++) {
    try {
      const s = await stat(path);
      if (s.size === last) stable++; else { stable = 0; last = s.size; }
      if (s.size > 100000 && stable >= 4) return path;
    } catch {}
    await sleep(250);
  }
  throw new Error('download did not settle: ' + name);
}

try {
  await page.send('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: dl.replaceAll('/', '\\'), eventsEnabled: true
  });
  await page.goto(`${base}/motion/`, 2500);
  console.log('page ready — recording starts after the score is ready');
  const info = await page.evaluate(`window.__motion.recordVideo({filename:'BombIt_MotionID_1080p60.mp4', videoBitsPerSecond: 10_000_000})`);
  console.log('recorder', info);
  const downloaded = await waitFile('BombIt_MotionID_1080p60.mp4');
  const size = (await stat(downloaded)).size;
  const dest = join(outDir, 'BombIt_MotionID_1080p60.mp4');
  await copyFile(downloaded, dest);
  console.log(`saved ${dest} — ${(size / 1024 / 1024).toFixed(1)} MB`);

  const check = await page.evaluate(`(async()=>{
    const url='${base}/motion/out/BombIt_MotionID_1080p60.mp4';
    const v=document.createElement('video'); v.src=url; v.preload='auto'; v.muted=true; v.playsInline=true;
    v.style.cssText='position:fixed;left:0;top:0;width:960px;height:540px;opacity:.01;pointer-events:none';
    document.body.appendChild(v);
    await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error('metadata'))});
    const info={duration:v.duration,w:v.videoWidth,h:v.videoHeight};
    v.currentTime=20;
    await new Promise(r=>{v.onseeked=r; setTimeout(r,1500);});
    await Promise.race([v.play().catch(()=>{}), new Promise(r=>setTimeout(r,2000))]);
    await new Promise(r=>setTimeout(r,2200));
    const q=v.getVideoPlaybackQuality? v.getVideoPlaybackQuality() : null;
    const quality=q?{total:q.totalVideoFrames,dropped:q.droppedVideoFrames,corrupted:q.corruptedVideoFrames}:null;
    v.pause();
    let audio=null, audioError=null;
    try{
      const ac=new (window.AudioContext||window.webkitAudioContext)();
      if(ac.state==='suspended') await ac.resume();
      const src=ac.createMediaElementSource(v); const an=ac.createAnalyser(); an.fftSize=2048;
      const g=ac.createGain(); g.gain.value=0; src.connect(an); an.connect(g); g.connect(ac.destination);
      v.muted=false; v.volume=1; v.currentTime=24;
      await new Promise(r=>{v.onseeked=r; setTimeout(r,1500);});
      await Promise.race([v.play().catch(()=>{}), new Promise(r=>setTimeout(r,2000))]);
      const buf=new Float32Array(an.fftSize); let max=0;
      for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,60));an.getFloatTimeDomainData(buf);let ss=0;for(const z of buf)ss+=z*z;const rms=Math.sqrt(ss/buf.length);if(rms>max)max=rms;}
      v.pause();
      audio={maxRms:+max.toFixed(4), decodedBytes:v.webkitAudioDecodedByteCount||0};
      ac.close();
    }catch(e){audioError=String(e)}
    return {info,quality,audio,audioError};
  })()`);
  console.log('verification', check);
  if (errors.length) console.warn('page errors', errors);
} finally {
  await page.close();
}
