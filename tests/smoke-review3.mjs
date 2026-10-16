// Review round 3: Escape cancels, Feb 30 rejected with a visible message, shortening a task keeps parts inside.
import { spawn } from 'node:child_process';
const port = 9950 + Math.floor(Math.random()*40);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/hamsha-chrome-${port}`,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let tabs; for (let i=0;i<50;i++){ try{ tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(tabs.find(t=>t.type==='page')) break;}catch{} await sleep(200);}
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; const errors=[];
ws.onmessage = m => { const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id];} if(d.method==='Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text+' '+(d.params.exceptionDetails.exception?.description||'').slice(0,120)); if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error') errors.push(d.params.args.map(a=>a.value||a.description).join(' ').slice(0,160)); };
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const ev = async js => { const r = await send('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) return 'EXC '+r.result.exceptionDetails.text; return r.result?.result?.value; };
const waitFor = async (js, ms=8000) => { const t0=Date.now(); while(Date.now()-t0<ms){ if(await ev(js)) return true; await sleep(150);} throw new Error('timeout waiting for: '+js); };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://localhost:5173/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(500); return r; };
const setInput = async (sel, v, evt) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(${JSON.stringify(evt||'input')},{bubbles:true}));return 'ok'})()`);
const out = {};
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'عميل ٣');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(400);
await click('عميل ٣'); await sleep(400);
await ev(`(()=>{const c=[...document.querySelectorAll('main .cursor-crosshair')][18];c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));return 'ok'})()`); await sleep(150); await ev(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))`); await waitFor(`!!document.querySelector('[role=dialog]')`);
await setInput(`document.querySelector('[role=dialog] input[placeholder]')`, 'العنوان الأصلي');
await click('إنشاء المهمة'); await waitFor(`!!document.querySelector('[role=dialog] input.text-\\[16px\\]')`);
// --- 1) Escape must cancel: focus title, type, press Escape via real key events
const TITLE = `[...document.querySelectorAll('[role=dialog] input')].find(i=>i.value==='العنوان الأصلي')`;
await ev(`${TITLE}.focus()`);
await setInput(TITLE, 'نص مؤقت');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await sleep(400);
out.titleAfterEscape = await ev(`[...document.querySelectorAll('[role=dialog] input')].find(i=>i.className.includes('text-[16px]')).value`);
out.storedTitle = await ev(`JSON.parse(localStorage.getItem('hamsha.mock.v4')).tasks.at(-1).title`);
// --- 2) Feb 30 must be rejected with a visible message, task untouched
const START = `[...document.querySelectorAll('[role=dialog] input[type=date]')][0]`;
out.startBefore = await ev(`${START}.value`);
await setInput(START, '2026-02-30', 'change'); await sleep(500);
out.toastShown = await ev(`document.querySelector('[role=alert]')?.textContent || null`);
out.startAfter = await ev(`JSON.parse(localStorage.getItem('hamsha.mock.v4')).tasks.at(-1).start`);
out.alive = await ev(`!document.body.innerText.includes('حدث خطأ')`);
// --- 3) Shorten a task with a later part: part must be pulled inside the range
const END = `[...document.querySelectorAll('[role=dialog] input[type=date]')][1]`;
await setInput(END, '2026-10-25', 'change'); await sleep(400);
// move the part to the 24th
const PARTDAY = `[...document.querySelectorAll('[role=dialog] input[type=date]')][2]`;
await setInput(PARTDAY, '2026-10-24', 'change'); await sleep(400);
out.partDayBefore = await ev(`JSON.parse(localStorage.getItem('hamsha.mock.v4')).parts.at(-1).day`);
await setInput(END, '2026-10-20', 'change'); await sleep(400);
const snap = await ev(`(()=>{const s=JSON.parse(localStorage.getItem('hamsha.mock.v4'));const t=s.tasks.at(-1);const p=s.parts.filter(x=>x.taskId===t.id);return {start:t.start,end:t.end,parts:p.map(x=>x.day)}})()`);
out.afterShorten = snap;
out.movedNotice = await ev(`document.querySelector('[role=alert]')?.textContent || null`);
await sleep(6500);
// --- 4) a validation error that the browser cannot pre-filter: part day outside the task → toast, nothing saved
await setInput(PARTDAY, '2026-01-01', 'change'); await sleep(600);
out.toastOnBadPart = await ev(`document.querySelector('[role=alert]')?.textContent || null`);
out.partDayUnchanged = await ev(`JSON.parse(localStorage.getItem('hamsha.mock.v4')).parts.at(-1).day`);
out.errors = errors;
console.log(JSON.stringify(out,null,1));
ws.close(); chrome.kill(); try { (await import('node:fs')).rmSync(`/tmp/hamsha-chrome-${port}`, { recursive: true, force: true }) } catch {}
const CHECKS = {
  "out.titleAfterEscape === 'العنوان الأصلي'": out.titleAfterEscape === 'العنوان الأصلي',
  "out.storedTitle === 'العنوان الأصلي'": out.storedTitle === 'العنوان الأصلي',
  'out.startAfter === out.startBefore': out.startAfter === out.startBefore,
  'out.alive === true': out.alive === true,
  'JSON.stringify(out.afterShorten.parts) === \'["2026-10-20"]\'': JSON.stringify(out.afterShorten.parts) === '["2026-10-20"]',
  "typeof out.movedNotice === 'string' && out.movedNotice.includes('تم نقل')": typeof out.movedNotice === 'string' && out.movedNotice.includes('تم نقل'),
  'out.toastOnBadPart !== null': out.toastOnBadPart !== null,
  "out.partDayUnchanged === '2026-10-20'": out.partDayUnchanged === '2026-10-20',
  'out.errors.length === 0': out.errors.length === 0,
}
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS ' + process.argv[1].split('/').pop())

