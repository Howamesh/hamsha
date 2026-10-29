// Drag-create: day view 15:00→16:00 rows → dialog prefilled 15:00, 2h; month view 3 days → start..end prefilled.
import { spawn } from 'node:child_process';
const port = 9960 + Math.floor(Math.random()*30);
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
const waitFor = async (js, ms=8000) => { const t0=Date.now(); while(Date.now()-t0<ms){ if(await ev(js)) return true; await sleep(150);} throw new Error('timeout waiting for: '+js); };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:(process.env.HAMSHA_URL ?? 'http://localhost:5173') + '/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(400); return r; };
const setInput = async (sel, v) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()`);
const rect = async (sel) => ev(`(()=>{const r=(${sel}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
const mouse = async (type, x, y) => send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons: type==='mouseReleased'?0:1, clickCount:1, pointerType:'mouse'});
const out = {};
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`, 30000);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'عميل سحب');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(400);
await click('عميل سحب'); await sleep(400);
// --- Day view drag 15:00 → 16:00
await click('يوم'); await sleep(400);
const rows = `[...document.querySelectorAll('main .cursor-crosshair')]`;
const r15 = await rect(`${rows}[8]`);
const r16 = await rect(`${rows}[9]`);
await mouse('mousePressed', r15.x, r15.y); await sleep(80);
await mouse('mouseMoved', r16.x, r16.y); await sleep(120);
await mouse('mouseReleased', r16.x, r16.y);
await waitFor(`!!document.querySelector('[role=dialog]')`);
out.dayRange = await ev(`document.querySelector('[role=dialog]').innerText.match(/3:00 م – 5:00 م/)?.[0] || null`);
out.dayTime = await ev(`document.querySelector('[role=dialog] input[type=time]').value`);
out.dayHours = await ev(`document.querySelector('[role=dialog] input[type=number]').value`);
await setInput(`document.querySelector('[role=dialog] input[placeholder]')`, 'مهمة بالسحب');
await click('إنشاء المهمة'); await waitFor(`!!document.querySelector('[role=dialog] input.text-\\\\[16px\\\\]')`);
out.partTimeSaved = await ev(`(()=>{const s=JSON.parse(localStorage.getItem('hamsha.mock.v4'));return s.parts.at(-1).time+'/'+s.parts.at(-1).hours})()`);
await ev(`document.querySelector('[role=dialog] button[aria-label]').click()`); await sleep(300);
// --- Month view drag across 3 days (cells 16,17,18 of the grid)
await click('شهر'); await sleep(400);
const cells = `[...document.querySelectorAll('main .cursor-crosshair')]`;
const c1 = await rect(`${cells}[16]`); const c3 = await rect(`${cells}[18]`);
await mouse('mousePressed', c1.x, c1.y+30); await sleep(80);
await mouse('mouseMoved', c3.x, c3.y+30); await sleep(120);
await mouse('mouseReleased', c3.x, c3.y+30);
await waitFor(`!!document.querySelector('[role=dialog]')`);
const dates = await ev(`[...document.querySelectorAll('[role=dialog] input[type=date]')].map(i=>i.value)`);
out.monthRange = dates;
out.monthSpan = dates.length === 2 ? Math.round((new Date(dates[1]) - new Date(dates[0]))/864e5) : null;
out.errors = errors;
console.log(JSON.stringify(out,null,1));
ws.close(); chrome.kill(); try { (await import('node:fs')).rmSync(`/tmp/hamsha-chrome-${port}`, { recursive: true, force: true }) } catch {}
const CHECKS = { "out.dayRange === '3:00 م – 5:00 م'": out.dayRange === '3:00 م – 5:00 م', "out.dayTime === '15:00'": out.dayTime === '15:00', "out.dayHours === '2'": out.dayHours === '2', "out.partTimeSaved === '15:00/2'": out.partTimeSaved === '15:00/2', "out.monthSpan === 2": out.monthSpan === 2, "out.errors.length === 0": out.errors.length === 0 };
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c);
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS smoke-drag.mjs')
