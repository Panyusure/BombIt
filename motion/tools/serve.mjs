// Tiny static server for local preview/render. No dependencies.
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 8173);
const types = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.mp3':'audio/mpeg',
  '.wav':'audio/wav', '.webm':'video/webm', '.mp4':'video/mp4', '.woff2':'font/woff2', '.svg':'image/svg+xml',
};
http.createServer((req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let path = normalize(join(root, url));
    if (!path.startsWith(root)) throw new Error('outside root');
    let st;
    try { st = statSync(path); } catch { st = null; }
    if (st?.isDirectory()) { path = join(path, 'index.html'); st = statSync(path); }
    if (!st) { res.writeHead(404); res.end('not found'); return; }
    const range = req.headers.range;
    if (range) {
      const [a,b] = range.replace(/bytes=/,'').split('-');
      const start = Number(a)||0, end = b?Number(b):st.size-1;
      res.writeHead(206, {'Content-Type':types[extname(path)]||'application/octet-stream','Content-Range':`bytes ${start}-${end}/${st.size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});
      createReadStream(path,{start,end}).pipe(res);
    } else {
      res.writeHead(200, {'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':st.size,'Accept-Ranges':'bytes','Cache-Control':'no-store'});
      createReadStream(path).pipe(res);
    }
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
