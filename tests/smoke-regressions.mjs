// Regression checks for the review findings: empty date, stale draft, last part, logout reset.
import { spawn } from 'node:child_process';
const port = 9900 + Math.floor(Math.random()*90);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/hamsha-chrome-${port}`,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let tabs; for (let i=0;i<50;i++){ try{ tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(tabs.find(t=>t.type==='page')) break;}catch{} await sleep(200);}
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; const errors=[];
ws.onmessage = m => { const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id];} if(d.method==='Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text); if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error') errors.push(d.params.args.map(a=>a.value||a.description).join(' ').slice(0,200)); };
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const ev = async js => { const r = await send('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) return 'EXC '+r.result.exceptionDetails.text; return r.result?.result?.value; };
const waitFor = async (js, ms=8000) => { const t0=Date.now(); while(Date.now()-t0<ms){ if(await ev(js)) return true; await sleep(150);} throw new Error('timeout waiting for: '+js); };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:(process.env.HAMSHA_URL ?? 'http://localhost:5173') + '/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(500); return r; };
const setInput = async (sel, v, evt) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(${JSON.stringify(evt||'input')},{bubbles:true}));return 'ok'})()`);
const out = {};
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'جوان');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(400);
await click('جوان'); await sleep(400);
// two tasks
for (const title of ['مهمة أ','مهمة ب']) {
  await ev(`(()=>{const c=[...document.querySelectorAll('main .cursor-crosshair')][18];c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));return 'ok'})()`); await sleep(150); await ev(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))`); await waitFor(`!!document.querySelector('[role=dialog]')`);
  await setInput(`document.querySelector('[role=dialog] input[placeholder]')`, title);
  await click('إنشاء المهمة'); await waitFor(`!!document.querySelector('[role=dialog] input.text-\\[16px\\]')`);
  // type a description then close
  await setInput(`document.querySelector('[role=dialog] textarea')`, 'وصف '+title);
  await ev(`document.querySelector('[role=dialog] textarea').dispatchEvent(new FocusEvent('focusout',{bubbles:true}))`); await sleep(200);
  await ev(`document.querySelector('[role=dialog] button[aria-label]').click()`); await sleep(300);
}
// 1) stale draft: open A then B — B's description must be its own
await click('مهمة أ'); await sleep(400);
await click('مهمة ب'); await sleep(400);
out.descOfB = await ev(`document.querySelector('[role=dialog] textarea').value`);
// 2) empty date must be ignored (no crash)
out.emptyDate = await setInput(`[...document.querySelectorAll('[role=dialog] input[type=date]')][0]`, '', 'change'); await sleep(300);
out.stillAlive = await ev(`!!document.querySelector('[role=dialog]') && !document.body.innerText.includes('حدث خطأ')`);
out.startStillSet = await ev(`[...document.querySelectorAll('[role=dialog] input[type=date]')][0].value`);
// 3) last part cannot be deleted
out.lastPartDisabled = await ev(`[...document.querySelectorAll('[role=dialog] button[aria-label="حذف"]')].map(b=>b.disabled)`);
// 4) logout then login as client → no task sheet remains
out.logout = await click('تسجيل الخروج'); await sleep(600);
await click('ادخل كعميل'); await sleep(800);
out.noSheetForClient = await ev(`!document.querySelector('[role=dialog]')`);
out.clientUnlinkedMsg = await ev(`document.body.innerText.includes('غير مربوط')`);
out.errors = errors;
console.log(JSON.stringify(out,null,1));
ws.close(); chrome.kill(); try { (await import('node:fs')).rmSync(`/tmp/hamsha-chrome-${port}`, { recursive: true, force: true }) } catch {}
const CHECKS = {
  "out.descOfB === 'وصف مهمة ب'": out.descOfB === 'وصف مهمة ب',
  'out.stillAlive === true': out.stillAlive === true,
  "out.startStillSet !== ''": out.startStillSet !== '',
  "JSON.stringify(out.lastPartDisabled) === '[true]'": JSON.stringify(out.lastPartDisabled) === '[true]',
  'out.noSheetForClient === true': out.noSheetForClient === true,
  'out.clientUnlinkedMsg === true': out.clientUnlinkedMsg === true,
  'out.errors.length === 0': out.errors.length === 0,
}
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS ' + process.argv[1].split('/').pop())

