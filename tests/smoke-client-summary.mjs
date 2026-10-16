import { spawn } from 'node:child_process';
const port = 9970 + Math.floor(Math.random()*20);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/hamsha-chrome-${port}`,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let tabs; for (let i=0;i<50;i++){ try{ tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(tabs.find(t=>t.type==='page')) break;}catch{} await sleep(200);}
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; ws.onmessage = m => { const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id];} };
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const ev = async js => (await send('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true})).result?.result?.value;
const waitFor = async (js, ms=15000) => { const t0=Date.now(); while(Date.now()-t0<ms){ if(await ev(js)) return true; await sleep(150);} throw new Error('timeout: '+js); };
await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://localhost:5173/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);
const click = async (txt) => { await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];el&&el.click()})()`); await sleep(450); };
const setInput = async (sel, v, evt='input') => ev(`(()=>{const el=${sel};const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(${JSON.stringify(evt)},{bubbles:true}));return 'ok'})()`);
const fs = await import('node:fs');
// admin seeds: client + task with 2 parts, link the client account
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'العون المباشر');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(400);
await click('العون المباشر'); await sleep(400);
await ev(`(()=>{const c=[...document.querySelectorAll('main .cursor-crosshair')][18];c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));})()`); await sleep(150); await ev(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))`);
await waitFor(`!!document.querySelector('[role=dialog]')`);
await setInput(`document.querySelector('[role=dialog] input[placeholder]')`, 'بوست عن الصدقة');
await setInput(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('الجزء'))`, 'كتابة المحتوى');
await click('إنشاء المهمة'); await waitFor(`!!document.querySelector('[role=dialog] input.text-\\\\[16px\\\\]')`);
await setInput(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('جزء جديد'))`, 'التصميم');
await ev(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('جزء جديد')).form.requestSubmit()`); await sleep(400);
await ev(`[...document.querySelectorAll('[role=dialog] button[aria-label="تم"]')][0].click()`); await sleep(300);
await ev(`document.querySelector('[role=dialog] button[aria-label]').click()`); await sleep(300);
// link client account
const sel = `[...document.querySelectorAll('aside select')].find(s=>[...s.options].some(o=>o.textContent.includes('عميل تجريبي')))`;
await setInput(sel, await ev(`[...(${sel}).options].find(o=>o.textContent.includes('عميل تجريبي')).value`), 'change'); await sleep(400);
await click('تسجيل الخروج'); await sleep(600);
await click('ادخل كعميل'); await waitFor(`document.body.innerText.includes('بوست عن الصدقة')`);
await click('بوست عن الصدقة'); await sleep(600);
const text = await ev(`document.querySelector('[role=dialog]')?.innerText || 'NO DIALOG'`);
const CHECKS = {
  'summary opens': text !== 'NO DIALOG',
  'shows title': text.includes('بوست عن الصدقة'),
  'shows progress 50%': text.includes('50%'),
  'shows steps': text.includes('كتابة المحتوى') && text.includes('التصميم'),
  'hides people': !text.includes('Ibrahim') && !text.includes('Producer'),
  'hides hours/brief/approval': !/س\b/.test(text) && !text.includes('الوصف') && !text.includes('إرسال للاعتماد'),
};
console.log(text);
ws.close(); chrome.kill(); try{fs.rmSync(`/tmp/hamsha-chrome-${port}`,{recursive:true,force:true})}catch{}
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS smoke-client-summary.mjs')
