// Minimal Chrome DevTools Protocol client for local Edge automation.
// Usage (import): const {openPage} = await import('./cdp.mjs')
import { setTimeout as sleep } from 'node:timers/promises';

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';

export async function newPage(url = 'about:blank') {
  const res = await fetch(`${CDP_HTTP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`create target failed: ${res.status} ${await res.text()}`);
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    } else if (msg.method) {
      const list = listeners.get(msg.method);
      if (list) list.forEach((fn) => fn(msg.params));
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
    return () => listeners.set(method, (listeners.get(method) || []).filter((f) => f !== fn));
  };
  await send('Page.enable');
  await send('Runtime.enable');
  const evaluate = async (expression, { awaitPromise = true, returnByValue = true } = {}) => {
    const out = await send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue, userGesture: true,
      allowUnsafeEvalBlockedByCSP: true,
    });
    if (out.exceptionDetails) {
      throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text);
    }
    return out.result?.value;
  };
  const goto = async (targetUrl, waitMs = 1200) => {
    const loaded = new Promise((resolve) => {
      const off = on('Page.loadEventFired', () => { off(); resolve(); });
    });
    await send('Page.navigate', { url: targetUrl });
    await Promise.race([loaded, sleep(8000)]);
    await sleep(waitMs);
  };
  const screenshot = async (path, { format = 'png', quality = 92 } = {}) => {
    const { data } = await send('Page.captureScreenshot', { format, quality, fromSurface: true, captureBeyondViewport: false });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, Buffer.from(data, 'base64'));
    return path;
  };
  const close = async () => {
    try { await fetch(`${CDP_HTTP}/json/close/${target.id}`); } catch {}
    try { ws.close(); } catch {}
  };
  return { target, send, on, evaluate, goto, screenshot, close, ws };
}

export async function browserVersion() {
  const r = await fetch(`${CDP_HTTP}/json/version`);
  return r.json();
}

export { sleep };
