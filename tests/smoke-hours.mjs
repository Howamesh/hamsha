// 8h/day warning: two parts (4h + 5h) on the same day for the same member → amber badge; saving is not blocked.
import { spawn } from 'node:child_process';
const port = 9990 + Math.floor(Math.random()*9);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/hamsha-chrome-${port}`,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let tabs; for (let i=0;i<50;i++){ try{ tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(tabs.find(t=>t.type==='page')) break;}catch{} await sleep(200);}
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; const errors=[];
ws.onmessage = m => { const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id];} if(d.method==='Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text); if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error') errors.push(d.params.args.map(a=>a.value||a.description).join(' ').slice(0,160)); };
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const ev = async js => { const r = await send('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) return 'EXC '+r.result.exceptionDetails.text; return r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://localhost:5173/login'}); await sleep(3000);
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(500); return r; };
const setInput = async (sel, v, evt) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(${JSON.stringify(evt||'input')},{bubbles:true}));return 'ok'})()`);
const out = {};
await click('ادخل كمدير'); await sleep(800);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'عميل ٤');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(400);
await click('عميل ٤'); await sleep(400);
await ev(`(()=>{const c=[...document.querySelectorAll('main .cursor-crosshair')][18];c.click();return 'ok'})()`); await sleep(400);
await setInput(`document.querySelector('[role=dialog] input[placeholder]')`, 'مهمة ثقيلة');
await click('إنشاء المهمة'); await sleep(600);
out.warnBefore = await ev(`document.querySelector('[role=dialog]').innerText.includes('في اليوم ⚠')`);
await setInput(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('جزء جديد'))`, 'جزء ثاني');
await ev(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('جزء جديد')).form.requestSubmit()`); await sleep(500);
// second part is auto-placed on day+1 (clamped to task end = same day) → same day, same owner, 4h+4h = 8 (not over)
out.warnAt8 = await ev(`document.querySelector('[role=dialog]').innerText.includes('في اليوم ⚠')`);
await setInput(`[...document.querySelectorAll('[role=dialog] input[type=number]')][1]`, '5', 'input'); await sleep(400);
out.warnAt9 = await ev(`document.querySelector('[role=dialog]').innerText.includes('في اليوم ⚠')`);
out.savedHours = await ev(`JSON.parse(localStorage.getItem('hamsha.mock.v4')).parts.slice(-2).map(p=>p.hours)`);
out.errors = errors;
console.log(JSON.stringify(out));
ws.close(); chrome.kill();
