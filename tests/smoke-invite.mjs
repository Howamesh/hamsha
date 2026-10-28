// «ادعُ عضواً» (2026-10-28): the admin invites a creative and a client from the panel; on the mock
// backend the invited people appear immediately. Proves: button → dialog → validation → submit → toast.
import { spawn } from 'node:child_process';
const port = 9990 + Math.floor(Math.random()*9);
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
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(450); return r; };
const setInput = async (sel, v) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return 'ok'})()`);
const fs = await import('node:fs');
const CHECKS = {};

await send('Page.navigate',{url: BASE + '/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
const teamBefore = await ev(`document.querySelectorAll('main ~ aside, aside').length`);

// 1) button opens the dialog
CHECKS['invite button visible to admin'] = (await click('ادعُ عضواً')) === 'ok';
await waitFor(`!!document.querySelector('[role=dialog][aria-label="دعوة عضو جديد"]')`);
CHECKS['dialog open'] = await ev(`!!document.querySelector('[role=dialog][aria-label="دعوة عضو جديد"]')`);
// 2) send is disabled until the e-mail is valid
CHECKS['send disabled on empty e-mail'] = await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='إرسال الدعوة').disabled === true`);
await setInput(`document.querySelector('[role=dialog] input[type=email]')`, 'not-an-email');
CHECKS['send disabled on bad e-mail'] = await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='إرسال الدعوة').disabled === true`);
// 3) invite a creative
await setInput(`document.querySelector('[role=dialog] input[type=email]')`, 'new.creative@example.com');
await setInput(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('الاسم'))`, 'مبدع الفحص');
await click('مبدع');
CHECKS['send enabled on valid input'] = await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='إرسال الدعوة').disabled === false`);
await click('إرسال الدعوة');
await waitFor(`!!document.querySelector('[role=alert]') && document.querySelector('[role=alert]').innerText.includes('أُرسلت الدعوة إلى new.creative@example.com')`);
CHECKS['success toast names the e-mail'] = true;
CHECKS['dialog closed after send'] = !(await ev(`!!document.querySelector('[role=dialog][aria-label="دعوة عضو جديد"]')`));
await sleep(300);
// the invited creative is now a team member: create a client and look at its «project owner» avatars
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'عميل الدعوة');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(500);
await click('عميل الدعوة'); await sleep(500);
CHECKS['invited creative appears among team members'] = await ev(`[...document.querySelectorAll('aside button[title]')].some(b=>b.title==='مبدع الفحص')`);
await ev(`document.querySelector('header button[aria-label="رجوع"]')?.click()`); await sleep(600);
// 3b) pending list shows the invitee with a resend button; resend → toast
await waitFor(`!!document.querySelector('[data-testid=pending-invites]')`);
CHECKS['pending list shows the invitee'] = await ev(`document.querySelector('[data-testid=pending-invites]').innerText.includes('new.creative@example.com')`);
await ev(`[...document.querySelectorAll('[data-testid=pending-invites] button')].find(b=>b.textContent.includes('أعد الإرسال')).click()`);
await waitFor(`!!document.querySelector('[role=alert]') && document.querySelector('[role=alert]').innerText.includes('أُعيد إرسال الدعوة إلى new.creative@example.com')`);
CHECKS['resend → toast names the e-mail'] = true;
await ev(`document.querySelector('[role=alert] button')?.click()`); await sleep(300);
// 4) client role needs a client: with no clients the hint shows and send stays disabled
await click('ادعُ عضواً'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="دعوة عضو جديد"]')`);
await setInput(`document.querySelector('[role=dialog] input[type=email]')`, 'client.user@example.com');
await click('عميل'); await sleep(200);
const hasClients = await ev(`!!document.querySelector('[role=dialog] select')`);
if (!hasClients) {
  CHECKS['client role without clients: hint + disabled'] = (await ev(`document.querySelector('[role=dialog]').innerText.includes('أنشئ العميل أولاً')`)) && (await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='إرسال الدعوة').disabled === true`));
} else {
  CHECKS['client role with clients: select shown'] = true;
}
// 5) duplicate e-mail → honest error toast, dialog stays open
await click('مبدع'); await sleep(100);
await setInput(`document.querySelector('[role=dialog] input[type=email]')`, 'new.creative@example.com');
await click('إرسال الدعوة');
await waitFor(`!!document.querySelector('[role=alert]') && document.querySelector('[role=alert]').innerText.includes('بالفعل')`);
CHECKS['duplicate e-mail → already-member toast'] = true;
CHECKS['dialog stays open on failure'] = await ev(`!!document.querySelector('[role=dialog][aria-label="دعوة عضو جديد"]')`);
CHECKS['no console errors'] = errors.length === 0;
void teamBefore;

ws.close(); chrome.kill(); try{fs.rmSync(`/tmp/hamsha-chrome-${port}`,{recursive:true,force:true})}catch{}
console.log(JSON.stringify({...CHECKS, errors}, null, 1));
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS smoke-invite.mjs')
