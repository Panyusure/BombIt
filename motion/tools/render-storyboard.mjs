import { newPage } from './cdp.mjs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.MOTION_BASE || 'http://127.0.0.1:8173';
const tmp = join(root, '.bombit', 'tmp', 'motion', 'story');
const out = join(root, 'motion', 'out');
await mkdir(tmp, { recursive: true });
await mkdir(out, { recursive: true });
const times = [
  [1.4, 'COLD OPEN'], [3.1, 'TITLE SLAM'], [6.6, 'REAL GAMEPLAY'],
  [10.5, '小诺 / 01'], [14.5, '阿瑞 / 03'], [18.5, '小天 / 05'],
  [22.5, 'SQUAD'], [27.4, 'MODE 01'], [30.4, 'MODE 03'],
  [33.4, 'BOOM BUILD'], [35.4, 'EXPLOSION'], [38.2, 'BOSS'],
  [41.4, 'SPIRIT LINK'], [45.6, 'MAIN TITLE'], [47.3, 'END CARD']
];
const page = await newPage('about:blank');
try {
  await page.goto(`${base}/motion/?noscore=1`, 2500);
  for (let i = 0; i < times.length; i++) {
    const data = await page.evaluate(`(()=>{ window.__motion.renderAt(${times[i][0]}); return document.querySelector('#stage').toDataURL('image/jpeg', .92); })()`);
    await writeFile(join(tmp, `${String(i).padStart(2, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
  }
} finally { await page.close(); }

const py = `
from PIL import Image, ImageDraw, ImageFont
import glob
files=sorted(glob.glob(r'${tmp.replaceAll('\\','/')}/*.jpg'))
labels=${JSON.stringify(times.map(t => t[1]))}
cols=3; tw,th=600,338; gap=18; top=140; foot=50
rows=(len(files)+cols-1)//cols
W=gap+cols*(tw+gap); H=top+rows*(th+foot+gap)+gap
sheet=Image.new('RGB',(W,H),(12,10,16)); d=ImageDraw.Draw(sheet)
def font(path, size):
    try: return ImageFont.truetype(path, size)
    except Exception: return ImageFont.load_default()
big=font('C:/Windows/Fonts/msyhbd.ttc', 48)
mono=font('C:/Windows/Fonts/consola.ttf', 18)
cn=font('C:/Windows/Fonts/msyhbd.ttc', 19)
d.text((gap, 28), 'BOMBIT / Q版泡泡堂', font=big, fill=(245,235,216))
d.text((gap, 92), 'MOTION ID  —  STORYBOARD / 48s / 1920x1080', font=mono, fill=(92,225,242))
for i,p in enumerate(files):
    im=Image.open(p).convert('RGB').resize((tw,th), Image.LANCZOS)
    x=gap+(i%cols)*(tw+gap); y=top+(i//cols)*(th+foot+gap)
    sheet.paste(im,(x,y))
    d.rectangle([x,y,x+tw-1,y+th-1], outline=(50,44,62), width=1)
    d.text((x, y+th+12), f'{i+1:02d}', font=mono, fill=(255,85,51))
    if i < len(labels): d.text((x+38, y+th+8), labels[i], font=cn, fill=(245,235,216))
d.line([gap,H-38,W-gap,H-38], fill=(50,44,62), width=1)
d.text((gap,H-26), 'CANVAS 2D / WEB AUDIO / ALL CODE', font=mono, fill=(120,115,130))
d.text((W-gap-440,H-26), 'FAN-MADE NONCOMMERCIAL MOTION STUDY', font=mono, fill=(120,115,130))
sheet.save(r'${join(out, 'BombIt_MotionID_Storyboard.jpg').replaceAll('\\','/')}', quality=91)
print('storyboard saved', sheet.size)
`;
const pyFile = join(tmp, 'build.py');
await writeFile(pyFile, py);
console.log(execFileSync('python', [pyFile], { encoding: 'utf8' }));
await rm(tmp, { recursive: true, force: true });
