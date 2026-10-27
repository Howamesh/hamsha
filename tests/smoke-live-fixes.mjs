// Two defects found in the first live run on a Supabase test project (2026-10-27):
//   1. an invite / recovery link from the Supabase dashboard lands on "/" (not /welcome) → the person never sets a password
//   2. an open task sheet survives switching to «all clients» / another client
import { spawn } from 'node:child_process';
const port = 9970 + Math.floor(Math.random()*20);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/hamsha-chrome-${port}`,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let tabs; for (let i=0;i<50;i++){ try{ tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if(tabs.find(t=>t.type==='page')) break;}catch{} await sleep(200);}
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; const errors=[];
ws.onmessage = m => { const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id];} if(d.method==='Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text+' '+(d.params.exceptionDetails.exception?.description||'')); if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error') errors.push(d.params.args.map(a=>a.value||a.description).join(' ')); };
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const ev = async js => (await send('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true})).result?.result?.value;
const waitFor = async (js, ms=15000) => { const t0=Date.now(); while(Date.now()-t0<ms){ if(await ev(js)) return true; await sleep(150);} throw new Error('timeout: '+js); };
const BASE = process.env.HAMSHA_URL ?? 'http://localhost:5173';
await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
const click = async (txt) => { await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];el&&el.click()})()`); await sleep(450); };
const setInput = async (sel, v, evt='input') => ev(`(()=>{const el=${sel};const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(${JSON.stringify(evt)},{bubbles:true}));return 'ok'})()`);
const fs = await import('node:fs');
const CHECKS = {};

// 1) invite link → /welcome (the hash is what Supabase appends to the Site URL)
const mounted = async () => { try { await waitFor(`document.body.innerText.trim().length > 1`, 30000); } catch { /* checked below */ } };
await send('Page.navigate',{url: BASE + '/#access_token=test&refresh_token=test&type=invite'}); await mounted();
CHECKS['invite link lands on /welcome'] = (await ev(`location.pathname`)) === '/welcome';
CHECKS['welcome form is shown'] = await ev(`document.body.innerText.includes('أهلاً بك في همشة')`);
await send('Page.navigate',{url: BASE + '/#access_token=test&refresh_token=test&type=recovery'}); await mounted();
CHECKS['recovery link lands on /welcome'] = (await ev(`location.pathname`)) === '/welcome';

// 2) task sheet closes when the admin leaves the client calendar
await send('Page.navigate',{url: BASE + '/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'عميل الفحص');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(400);
await click('عميل الفحص'); await sleep(400);
await ev(`(()=>{const c=[...document.querySelectorAll('main .cursor-crosshair')][18];c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));})()`); await sleep(150); await ev(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))`);
await waitFor(`!!document.querySelector('[role=dialog]')`);
await setInput(`document.querySelector('[role=dialog] input[placeholder]')`, 'مهمة الفحص');
await setInput(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('الجزء'))`, 'جزء');
await click('إنشاء المهمة'); await waitFor(`!!document.querySelector('[role=dialog] input.text-\\\\[16px\\\\]')`);
CHECKS['task sheet open'] = await ev(`!!document.querySelector('[role=dialog]')`);
await ev(`document.querySelector('header button[aria-label="رجوع"]').click()`); await sleep(500);   // ← all clients
CHECKS['task sheet closed after leaving the client'] = !(await ev(`!!document.querySelector('[role=dialog]')`));
CHECKS['no console errors'] = errors.length === 0;

ws.close(); chrome.kill(); try{fs.rmSync(`/tmp/hamsha-chrome-${port}`,{recursive:true,force:true})}catch{}
console.log(JSON.stringify({...CHECKS, errors}, null, 1));
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS smoke-live-fixes.mjs')
