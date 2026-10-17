'use strict';
// Real HTTP + Chromium cold-cache startup / integrated replay smoke test.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const storage = require('../cli/storage.cjs');
const root = path.resolve(__dirname,'..'), scratch = storage.scratch('startup');
const capture = process.argv.includes('--capture');
const failAsset = process.argv.includes('--fail-asset'), failScript = process.argv.includes('--fail-script');
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
let child, socket, server;
const pending = new Map(); let sequence = 0;
async function send(method,params={}) {
  const id = ++sequence;
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => {pending.delete(id);reject(Error('CDP timeout: '+method));},30000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails)); return r.result.value;
}
async function until(expression,timeout=30000) {
  const end = Date.now()+timeout;
  while(Date.now()<end) {const r=await evaluate(expression);if(r)return r;await sleep(50);}
  throw Error('Timed out: '+expression);
}
async function main() {
  let bytes = 0; const requests = [];
  server = http.createServer((req,res) => {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if ((failAsset && pathname === '/assets/characters/axiu-hd.png') || (failScript && pathname === '/src/core/config.js')) {res.writeHead(404).end();return;}
    const file = path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    const data = fs.readFileSync(file); bytes+=data.length; requests.push(pathname);
    const type = {'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.mp3':'audio/mpeg'}[path.extname(file)]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  const browser = [process.env.BOMBIT_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>p&&fs.existsSync(p));
  assert.ok(browser,'Browser unavailable');
  child=spawn(browser,['--headless=new','--no-sandbox','--in-process-gpu','--disable-gpu','--disable-background-networking',
    '--no-first-run','--no-default-browser-check','--disable-extensions','--mute-audio','--remote-debugging-port=0',
    '--user-data-dir='+path.join(scratch,'profile'),'--window-size=1000,900','about:blank'],{stdio:'ignore',windowsHide:true});
  const portFile=path.join(scratch,'profile','DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(50);
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const r=JSON.parse(event.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);}};
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:3*1024*1024,uploadThroughput:1024*1024});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__startup={samples:[]};
    new PerformanceObserver(function(list){for(var e of list.getEntries())if(e.name==='first-contentful-paint')__startup.firstPaintMs=e.startTime;}).observe({type:'paint',buffered:true});
    requestAnimationFrame(function poll(){
      const bar=document.getElementById('boot-progress');
      if(bar){__startup.loadingSeen=true;__startup.samples.push(bar.value);}
      if(window.BI&&BI.debug&&BI.debug.app.menu){
        if(!document.getElementById('boot')&&!__startup.menuReadyMs)__startup.menuReadyMs=performance.now();
        if(!__startup.visualReadyMs&&BI.assets.wallpaper.ok&&BI.assets.selectable().every(function(id){return !!BI.assets.ready(id);}))__startup.visualReadyMs=performance.now();
      }
      requestAnimationFrame(poll);
    });`});
  await send('Page.navigate',{url:base+'/'});
  if (failScript) {
    await until('document.getElementById("boot-retry")?.hidden === false');
    assert.equal(await evaluate('!!document.getElementById("boot")'),true);
    console.log('PASS failed game script leaves a visible retry button'); return;
  }
  if (capture) {
    await until('document.getElementById("boot-progress")?.value > 0');
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(scratch,'loading.png'),Buffer.from(shot.data,'base64'));
  }
  await until('window.__startup?.menuReadyMs');
  const stats=await evaluate('({...__startup,version:BI.config.VERSION,assets:BI.assets.status(),loading:BI.assets.loading})');
  assert.ok(stats.loadingSeen && stats.samples.some(n=>n>0&&n<100));
  assert.ok(stats.samples.every((n,i)=>i===0||n>=stats.samples[i-1]),'Progress must be monotonic');
  assert.ok(stats.samples.includes(100),'Display 100% before entering menu');
  assert.equal(stats.loading.done,stats.loading.total);
  if (failAsset) {
    assert.ok(await evaluate('BI.assets.failures.length > 0 && !BI.assets.ready("axiu")'));
    console.log('PASS missing image finishes progress and uses existing placeholder fallback');return;
  }
  const {samples,...timings}=stats;
  console.log(JSON.stringify({...timings,requestedBytes:bytes,requests:requests.length,progress:'verified'}));
  if(capture){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(scratch,'menu.png'),Buffer.from(shot.data,'base64'));}
  const point=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect(),b=BI.menu.REPLAY_BUTTON;return{x:r.left+(b.x+b.w/2)/720*r.width,y:r.top+(b.y+b.h/2)/696*r.height};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await until('BI.debug.app.replayOpen && document.querySelector("iframe")?.contentWindow.BombItReplayViewer');
  const replayIndex = process.argv.indexOf('--replay-file');
  let recording;
  if (replayIndex >= 0) recording = JSON.parse(fs.readFileSync(process.argv[replayIndex+1],'utf8'));
  else {
    const B=require('../cli/runtime.cjs').runtime(), {create,normalizeConfig,normalizeAction,advance}=require('../cli/game.cjs');
    const {hash}=require('../cli/session.cjs'),config=normalizeConfig({mode:'adventure',seed:'startup-replay'}),w=create(B,config),history=[];
    for(let i=0;i<80;i++) {
      const action=normalizeAction(w,{move:['right','down','left','up'][Math.floor(i/4)%4],bomb:i%10===0,frames:12});
      const result=advance(B,w,action); if(!result.advancedFrames)break;
      history.push({revision:i+1,action,advancedFrames:result.advancedFrames,hash:hash(B.snapshot.save(w))});
    }
    recording={format:'bombit-replay/1',engineVersion:'2',config,history,finalHash:hash(B.snapshot.save(w))};
  }
  await evaluate('document.querySelector("iframe").contentWindow.BombItReplayViewer.load('+JSON.stringify(recording)+',"Agent 对局").then(()=>true)');
  assert.equal(await evaluate('document.querySelector("iframe").contentWindow.BombItReplayViewer.player.verified'),true);
  if(capture){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(scratch,'replay.png'),Buffer.from(shot.data,'base64'));}
  await evaluate('document.querySelector("iframe").contentDocument.getElementById("back-to-game").click()');
  await until('!BI.debug.app.replayOpen && !document.getElementById("replay-dialog")');
  console.log('PASS real menu click, '+recording.history.length+'-action replay import, return to original menu');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{
  if(socket){try{await send('Browser.close');}catch{}socket.close();}
  if(child && child.exitCode===null){child.kill();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,2000);});}
  if(server)await new Promise(resolve=>server.close(resolve));
  if(capture||process.exitCode)console.log('Artifacts: '+scratch);
  else storage.removeInside(storage.locations().tests,scratch);
});
