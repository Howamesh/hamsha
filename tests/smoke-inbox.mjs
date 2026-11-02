// a brand-new browser profile every run (1 Nov: fixed per-port folders were reused across runs → stale UI state,
// e.g. a closed side panel, made the login waits time out «randomly»)
const PROFILE = (await import('node:fs')).mkdtempSync('/tmp/hamsha-chrome-run-');
// «الرسائل» inbox (2 Nov 2026, his pick ⭐٥ + creatives talk to each other + a creative in a client chat by permission).
// Plays the three roles on the mock: private chat, unread from the inbox, toast, grant → client chat → revoke.
import { spawn } from 'node:child_process';
let port = 0;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu',`--remote-debugging-port=0`,`--user-data-dir=${PROFILE}`,'--hide-scrollbars','about:blank'],{stdio:'ignore'});
for (const sig of ['exit', 'SIGINT', 'SIGTERM']) process.on(sig, () => { try { chrome.kill() } catch {} if (sig !== 'exit') process.exit(1) }) // never leave a browser behind
// port 0 = Chrome picks a free port and writes it to DevToolsActivePort (1 Nov: a leftover browser on a fixed/random
// port made a new run talk to the OLD browser and its old data)
for (let i = 0; i < 150 && !port; i++) { try { port = Number((await import('node:fs')).readFileSync(`${PROFILE}/DevToolsActivePort`, 'utf8').split('\n')[0]) || 0 } catch {} if (!port) await new Promise((r) => setTimeout(r, 100)) }
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
const login = async (who) => { await click(who); await waitFor(`!!document.querySelector('[data-testid=side-rail]')`, 30000); await sleep(400); };
const logout = async () => { await click('تسجيل الخروج'); await sleep(800); };
const openMessages = async () => { await ev(`document.querySelector('[data-testid=rail-messages]').click()`); await sleep(400); };
// quiet private chats are folded under «+ محادثة جديدة» (full test 2 Nov) — unfold to reach them
const unfold = async () => { if (await ev(`(document.querySelector('[data-testid=inbox-more]')?.innerText||'').includes('محادثة جديدة')`)) { await ev(`document.querySelector('[data-testid=inbox-more]').click()`); await sleep(300); } };
const row = (needle) => `[...document.querySelectorAll('[data-testid=inbox-row]')].find(r=>r.innerText.includes(${JSON.stringify(needle)}))`;
const sendText = async (txt) => { await setInput(`document.querySelector('[data-testid=chat-open] input')`, txt); await ev(`document.querySelector('[data-testid=chat-open] form').requestSubmit()`); await sleep(500); };

await send('Page.navigate',{url: BASE + '/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمبدع')`, 30000);

// 1) a creative writes privately to the admin
await login('ادخل كمبدع'); await openMessages();
CHECKS['quiet private chats are folded (no wall of empty rows)'] = !(await ev(`!!${row('Youssef Aly')}`)) && await ev(`(document.querySelector('[data-testid=inbox-more]')?.innerText||'').includes('محادثة جديدة')`);
await unfold();
CHECKS['creative inbox: team group + the admin + other creatives'] = await ev(`!!${row('فريق هوامش')} && !!${row('Ibrahim AlQifari')} && !!${row('Youssef Aly')}`);
CHECKS['creative sees no client chat without permission'] = !(await ev(`[...document.querySelectorAll('[data-testid=inbox-row]')].some(r=>r.dataset.channel.startsWith('client:'))`));
await ev(`${row('Ibrahim AlQifari')}.click()`); await waitFor(`!!document.querySelector('[data-testid=chat-open]')`);
await sendText('خلصت تصميم بوست سنا');
CHECKS['the message shows in the private chat'] = (await ev(`document.querySelector('[data-testid=chat-list]').innerText`)).includes('خلصت تصميم بوست سنا');
await setInput(`document.querySelector('[data-testid=chat-open] input')`, 'مسودة لم تُرسل');
await ev(`document.querySelector('[data-testid=chat-back]').click()`); await sleep(300); await unfold();
await ev(`${row('Youssef Aly')}.click()`); await sleep(300);
CHECKS['a draft never jumps into another chat'] = (await ev(`document.querySelector('[data-testid=chat-open] input').value`)) === '';
await ev(`document.querySelector('[data-testid=chat-back]').click()`); await sleep(300);
await logout();

// 2) the admin: the number on «الرسائل», the row, reading clears it
await login('ادخل كمدير');
CHECKS['admin: unread number on «الرسائل» (1)'] = (await ev(`document.querySelector('[data-testid=rail-messages]').innerText`)).includes('1');
await openMessages();
CHECKS['admin: Abdullah has his own row with 1 unread'] = await ev(`${row('Abdullah AboAlhossain')}?.dataset.unread === '1'`);
CHECKS['admin: the team group stays separate (0 unread)'] = await ev(`${row('فريق هوامش')}?.dataset.unread === '0'`);
await ev(`${row('Abdullah AboAlhossain')}.click()`); await waitFor(`!!document.querySelector('[data-testid=chat-open]')`); await sleep(600);
CHECKS['admin reads it'] = (await ev(`document.querySelector('[data-testid=chat-list]').innerText`)).includes('خلصت تصميم بوست سنا');
CHECKS['the creative’s unsent draft never shows for the next person on this browser'] = (await ev(`document.querySelector('[data-testid=chat-open] input').value`)) === '';
await ev(`document.querySelector('[data-testid=chat-back]').click()`); await sleep(400);
CHECKS['opening the chat marks it read (row + rail number)'] = (await ev(`${row('Abdullah AboAlhossain')}?.dataset.unread`)) === '0' && !(await ev(`!!document.querySelector('[data-testid=rail-messages] .bg-accent')`));

// 3) a message arriving while the admin is elsewhere → a toast that opens that chat
await ev(`document.querySelector('[data-testid=rail-calendar]').click()`); await sleep(200);
await ev(`(()=>{const k='hamsha.mock.v4';const s=JSON.parse(localStorage.getItem(k));const ch=s.messages.find(m=>m.body==='خلصت تصميم بوست سنا').channel;s.messages.push({id:'mx1',channel:ch,senderId:'u3',body:'وصلتك؟',at:new Date().toISOString()});const v=JSON.stringify(s);localStorage.setItem(k,v);window.dispatchEvent(new StorageEvent('storage',{key:k,newValue:v}));})()`);
await sleep(700);
CHECKS['toast «Abdullah … أرسل رسالة»'] = (await ev(`document.querySelector('[role=alert]')?.innerText || ''`)).includes('أرسل رسالة');
await ev(`document.querySelector('[data-testid=toast-action]')?.click()`); await sleep(500);
CHECKS['…tapping it opens that chat'] = await ev(`document.querySelector('[data-testid=chat-open]')?.innerText.includes('وصلتك؟')`);

// 4) the admin lets the creative into a client's chat
await ev(`document.querySelector('[data-testid=rail-main]').click()`); await sleep(300);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'عميل الرسائل');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(500);
await click('عميل الرسائل'); await sleep(500);
const sel = `[...document.querySelectorAll('aside select')].find(s=>[...s.options].some(o=>o.textContent.includes('عميل تجريبي')))`;
await setInput(sel, await ev(`[...(${sel}).options].find(o=>o.textContent.includes('عميل تجريبي')).value`)); await sleep(400);
CHECKS['client setup: «مين من الفريق يكلّم هذا العميل»'] = await ev(`!!document.querySelector('[data-testid=chat-access]')`);
await ev(`[...document.querySelectorAll('[data-testid=chat-access-toggle]')].find(b=>b.innerText.includes('Abdullah AboAlhossain')).click()`); await sleep(400);
CHECKS['…Abdullah turned on'] = await ev(`[...document.querySelectorAll('[data-testid=chat-access-toggle]')].find(b=>b.innerText.includes('Abdullah AboAlhossain')).getAttribute('aria-pressed') === 'true'`);
await ev(`document.querySelector('header button[aria-label="رجوع"]')?.click()`); await sleep(400);
await logout();

await login('ادخل كمبدع'); await openMessages();
CHECKS['creative now has the client chat'] = await ev(`!!${row('عميل الرسائل')}`);
await ev(`${row('عميل الرسائل')}.click()`); await waitFor(`!!document.querySelector('[data-testid=chat-open]')`);
await sendText('أهلاً من المبدع');
await logout();

await login('ادخل كعميل'); await ev(`document.querySelector('[data-testid=rail-messages]').click()`); await sleep(500);
CHECKS['the client reads the creative with his name'] = await ev(`(()=>{const t=document.querySelector('aside').innerText;return t.includes('أهلاً من المبدع') && t.includes('Abdullah AboAlhossain')})()`);
await logout();

// 5) the admin takes it back → gone from the creative's inbox
await login('ادخل كمدير'); await click('عميل الرسائل'); await sleep(500);
await ev(`document.querySelector('[data-testid=rail-main]').click()`); await sleep(300);
await ev(`[...document.querySelectorAll('[data-testid=chat-access-toggle]')].find(b=>b.innerText.includes('Abdullah AboAlhossain')).click()`); await sleep(400);
await ev(`document.querySelector('header button[aria-label="رجوع"]')?.click()`); await sleep(300);
await logout();
await login('ادخل كمبدع'); await openMessages();
CHECKS['after the admin takes it back, the client chat is gone'] = !(await ev(`!!${row('عميل الرسائل')}`));

CHECKS['no console errors'] = errors.length === 0;
ws.close(); chrome.kill(); try{fs.rmSync(`${PROFILE}`,{recursive:true,force:true})}catch{}
console.log(JSON.stringify({...CHECKS, errors}, null, 1));
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS smoke-inbox.mjs')
