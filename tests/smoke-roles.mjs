// End-to-end smoke test against the dev server using the mock repo (fresh profile each run).
import { spawn } from 'node:child_process';
const port = 9800 + Math.floor(Math.random()*100);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/hamsha-chrome-${port}`,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let tabs; for (let i=0;i<50;i++){ try{ tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(tabs.find(t=>t.type==='page')) break;}catch{} await sleep(200);}
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; const errors=[];
ws.onmessage = m => { const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id];} if(d.method==='Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text+' '+(d.params.exceptionDetails.exception?.description||'')); if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error') errors.push(d.params.args.map(a=>a.value||a.description).join(' ')); };
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const ev = async js => { const r = await send('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) return 'EXC '+r.result.exceptionDetails.text; return r.result?.result?.value; };
const waitFor = async (js, ms=8000) => { const t0=Date.now(); while(Date.now()-t0<ms){ if(await ev(js)) return true; await sleep(150);} throw new Error('timeout waiting for: '+js); };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://localhost:5173/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(500); return r; };
const setInput = async (sel, v) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return 'ok'})()`);
const out = {};
out.adminLogin = await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
out.createClient = await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'العون المباشر');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(500);
out.openClient = await click('العون المباشر'); await sleep(500);
out.clickDay = await ev(`(()=>{const c=[...document.querySelectorAll('main .cursor-crosshair')][18];c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));return 'ok'})()`); await sleep(150); await ev(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))`); await waitFor(`!!document.querySelector('[role=dialog]')`);
out.dialog = await ev(`!!document.querySelector('[role=dialog] form')`);
await setInput(`document.querySelector('[role=dialog] input[placeholder]')`, 'بوست عن الصدقة');
await setInput(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('الجزء'))`, 'المحتوى');
out.createTask = await click('إنشاء المهمة'); await waitFor(`!!document.querySelector('[role=dialog] input.text-\\[16px\\]')`);
out.sheetOpen = await ev(`!!document.querySelector('[role=dialog] input[value="بوست عن الصدقة"]')`);
// add second part, assign to Abdullah
await setInput(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('جزء جديد'))`, 'التصميم');
await ev(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('جزء جديد')).form.requestSubmit()`); await sleep(500);
out.partSelects = await ev(`document.querySelectorAll('[role=dialog] select').length`);
out.assign = await setInput(`[...document.querySelectorAll('[role=dialog] select')].at(-1)`, (await ev(`[...document.querySelectorAll('[role=dialog] select option')].find(o=>o.textContent.includes('Abdullah AboAlhossain')).value`)));
await sleep(400);
out.partsText = await ev(`[...document.querySelectorAll('[role=dialog] input')].filter(i=>['المحتوى','التصميم'].includes(i.value)).length`);
await click('إلغاء'); await ev(`document.querySelector('[role=dialog] button[aria-label]')?.click()`); await sleep(300);
out.logout = await click('تسجيل الخروج'); await sleep(800);
out.creativeLogin = await click('ادخل كمبدع'); await sleep(1000);
out.creativeSeesTask = await ev(`document.body.innerText.includes('بوست عن الصدقة')`);
out.creativeOpen = await click('بوست عن الصدقة'); await sleep(600);
out.creativeDatesReadonly = await ev(`[...document.querySelectorAll('[role=dialog] input[type=date]')].every(i=>i.readOnly)`);
out.creativeNoApprovalBtn = await ev(`![...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.includes('إرسال للاعتماد'))`);
out.creativeCheckboxes = await ev(`[...document.querySelectorAll('[role=dialog] button[aria-label="تم"]')].map(b=>b.disabled)`);
// toggle own part (second, enabled)
out.toggleOwn = await ev(`(()=>{const b=[...document.querySelectorAll('[role=dialog] button[aria-label="تم"]')].find(b=>!b.disabled);if(!b)return 'none';b.click();return 'clicked'})()`); await sleep(400);
out.progressAfter = await ev(`document.querySelector('[role=dialog]').innerText.match(/1 من 2/)?.[0]`);
out.errors = errors;
console.log(JSON.stringify(out,null,1));
ws.close(); chrome.kill(); try { (await import('node:fs')).rmSync(`/tmp/hamsha-chrome-${port}`, { recursive: true, force: true }) } catch {}
const CHECKS = {
  'out.sheetOpen === true': out.sheetOpen === true,
  'out.partSelects === 2': out.partSelects === 2,
  'out.creativeSeesTask === true': out.creativeSeesTask === true,
  'out.creativeDatesReadonly === true': out.creativeDatesReadonly === true,
  "JSON.stringify(out.creativeCheckboxes) === '[true,false]'": JSON.stringify(out.creativeCheckboxes) === '[true,false]',
  "out.progressAfter === '1 من 2'": out.progressAfter === '1 من 2',
  'out.errors.length === 0': out.errors.length === 0,
}
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS ' + process.argv[1].split('/').pop())

