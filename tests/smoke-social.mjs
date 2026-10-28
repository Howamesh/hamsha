// «السوشل» phase 1 (2026-10-28): the whole approval loop on the demo store, across the three roles.
// admin creates a post (image + caption) → sends it → client sees it in «السوشل» with ONLY «موافق / يبي تعديل»
// → asks for changes with a note → admin sees the note, uploads v2 (post back to draft) → sends → client approves
// → admin pastes the live link («تم النشر») → client finds it in the archive. A creative with no tasks sees nothing.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
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
await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable'); await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(450); return r; };
const setInput = async (sel, v) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return 'ok'})()`);
const CHECKS = {};
const text = async (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText || ''`);
const status = async () => ev(`document.querySelector('[data-testid=post-sheet] [data-status]')?.dataset.status || 'NONE'`);
const toastHas = async (t) => waitFor(`!!document.querySelector('[role=alert]') && document.querySelector('[role=alert]').innerText.includes(${JSON.stringify(t)})`).then(()=>true).catch(()=>false);
const closeToast = async () => { await ev(`document.querySelector('[role=alert] button')?.click()`); await sleep(200); };

// a tiny valid PNG (4×4, solid colour) written to a temp file — the real upload path is exercised, no network needed
function png(r,g,b){ const w=4,h=4; const raw=Buffer.alloc((w*3+1)*h); for(let y=0;y<h;y++){raw[y*(w*3+1)]=0; for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3; raw[o]=r;raw[o+1]=g;raw[o+2]=b;}}
  const crcT=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0});
  const crc=buf=>{let c=0xFFFFFFFF;for(const x of buf)c=crcT[(c^x)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
  const chunk=(t,d)=>{const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]); }
const f1=`/tmp/hamsha-smoke-${port}-v1.png`, f2=`/tmp/hamsha-smoke-${port}-v2.png`;
fs.writeFileSync(f1, png(220,40,40)); fs.writeFileSync(f2, png(40,120,220));
const setFile = async (file) => { const doc = await send('DOM.getDocument',{depth:1}); const q = await send('DOM.querySelector',{nodeId:doc.result.root.nodeId, selector:'[data-testid=post-image]'}); await send('DOM.setFileInputFiles',{files:[file], nodeId:q.result.nodeId}); await sleep(400); };

await send('Page.navigate',{url: BASE + '/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);

// ---------- admin: client + linked client account ----------
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'عميل السوشل');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(500);
await click('عميل السوشل'); await sleep(500);
const sel = `[...document.querySelectorAll('aside select')].find(s=>[...s.options].some(o=>o.textContent.includes('عميل تجريبي')))`;
await setInput(sel, await ev(`[...(${sel}).options].find(o=>o.textContent.includes('عميل تجريبي')).value`)); await sleep(400);

// ---------- admin: the social board + new post ----------
CHECKS['switch to social'] = (await click('السوشل')) === 'ok';
await waitFor(`!!document.querySelector('[data-testid=social-board]')`);
CHECKS['empty board message'] = (await text('[data-testid=social-board]')).includes('ما فيه منشورات بعد');
CHECKS['calendar navigation hidden on social'] = !(await ev(`!!document.querySelector('header button[aria-label="السابق"]')`));
await click('منشور جديد'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="منشور سوشل جديد"]')`);
CHECKS['create disabled before image'] = await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='إنشاء').disabled === true`);
await setInput(`[...document.querySelectorAll('[role=dialog] input')].find(x=>x.placeholder.includes('تهنئة'))`, 'تهنئة اليوم الوطني');
await setInput(`document.querySelector('[role=dialog] textarea')`, 'كل عام والوطن بخير 🇸🇦');
await setFile(f1);
CHECKS['phone preview shows the picked image'] = await ev(`!!document.querySelector('[role=dialog] img[src^="blob:"]')`);
await waitFor(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='إنشاء').disabled === false`);
await click('إنشاء');
await waitFor(`!!document.querySelector('[data-testid=post-sheet]')`);
CHECKS['sheet opens as draft v1'] = (await status()) === 'draft' && (await text('[data-testid=versions]')).includes('النسخة 1');
CHECKS['version stored as data url (demo)'] = await ev(`!!document.querySelector('[data-testid=post-sheet] img[src^="data:image/png"]')`);
CHECKS['admin cannot publish a draft (no link form)'] = !(await ev(`!!document.querySelector('[data-testid=published-url]')`));
await click('أرسل للعميل');
CHECKS['sent toast'] = await toastHas('أُرسل للعميل'); await closeToast();
CHECKS['status sent'] = (await status()) === 'sent';
CHECKS['withdraw offered while sent'] = await ev(`[...document.querySelectorAll('[data-testid=team-actions] button')].some(b=>b.textContent.includes('اسحب'))`);
await ev(`document.querySelector('[data-testid=post-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
CHECKS['card shows «عند العميل»'] = await ev(`[...document.querySelectorAll('[data-testid=post-card]')].some(c=>c.dataset.status==='sent' && c.innerText.includes('تهنئة اليوم الوطني'))`);
await click('تسجيل الخروج'); await sleep(700);

// ---------- client: only two choices → asks for changes ----------
await click('ادخل كعميل'); await waitFor(`!!document.querySelector('[data-testid=social-badge]')`, 20000);
CHECKS['client badge = 1'] = (await text('[data-testid=social-badge]')).trim() === '1';
await click('السوشل'); await waitFor(`!!document.querySelector('[data-testid=post-card]')`);
CHECKS['client has no «منشور جديد»'] = !(await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().includes('منشور جديد'))`));
await ev(`document.querySelector('[data-testid=post-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=client-decision]')`);
CHECKS['client sees exactly موافق + يبي تعديل'] = await ev(`(()=>{const bs=[...document.querySelectorAll('[data-testid=client-decision] button')].map(b=>b.textContent.trim());return bs.length===2 && bs.includes('موافق') && bs.includes('يبي تعديل')})()`);
CHECKS['client sees no team actions'] = !(await ev(`!!document.querySelector('[data-testid=team-actions]')`));
CHECKS['client sees no creator name'] = !(await text('[data-testid=versions]')).includes('بواسطة');
await click('يبي تعديل'); await waitFor(`!!document.querySelector('[data-testid=changes-note]')`);
CHECKS['notes required'] = await ev(`[...document.querySelectorAll('[data-testid=client-decision] button')].find(b=>b.textContent.trim()==='أرسل الملاحظات').disabled === true`);
await setInput(`document.querySelector('[data-testid=changes-note]')`, 'كبّر الشعار وغيّر لون الخلفية');
await click('أرسل الملاحظات');
CHECKS['decision toast'] = await toastHas('وصل قرارك'); await closeToast();
CHECKS['status changes (client)'] = (await status()) === 'changes';
CHECKS['no second decision possible'] = !(await ev(`[...document.querySelectorAll('[data-testid=client-decision] button')].some(b=>['موافق','يبي تعديل'].includes(b.textContent.trim()))`));
await ev(`document.querySelector('[data-testid=post-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
await click('تسجيل الخروج'); await sleep(700);

// ---------- admin: sees the note, uploads v2, sends again ----------
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
await click('السوشل'); await waitFor(`!!document.querySelector('[data-testid=post-card]')`);
CHECKS['admin card shows «يبي تعديل»'] = await ev(`document.querySelector('[data-testid=post-card]').dataset.status === 'changes'`);
await ev(`document.querySelector('[data-testid=post-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=post-sheet]')`);
CHECKS['admin reads the client note'] = (await text('[data-testid=decision-note]')).includes('كبّر الشعار وغيّر لون الخلفية');
CHECKS['cannot resend the same version'] = !(await ev(`[...document.querySelectorAll('[data-testid=team-actions] button')].some(b=>b.textContent.includes('أرسل للعميل'))`));
await click('ارفع نسخة جديدة'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="نسخة جديدة"]')`);
CHECKS['v2 dialog keeps the caption'] = (await ev(`document.querySelector('[role=dialog][aria-label="نسخة جديدة"] textarea').value`)) === 'كل عام والوطن بخير 🇸🇦';
await setFile(f2);
await setInput(`[...document.querySelectorAll('[role=dialog][aria-label="نسخة جديدة"] input')].find(x=>x.placeholder.includes('وش تغيّر'))`, 'كبّرنا الشعار');
await click('رفع'); await waitFor(`!document.querySelector('[role=dialog][aria-label="نسخة جديدة"]')`);
CHECKS['back to draft at v2'] = (await status()) === 'draft' && (await text('[data-testid=versions]')).includes('النسخة 2');
CHECKS['old decision kept on v1'] = (await text('[data-testid=versions]')).includes('كبّر الشعار');
await click('أرسل للعميل'); await toastHas('أُرسل للعميل'); await closeToast();
CHECKS['status sent again'] = (await status()) === 'sent';
await ev(`document.querySelector('[data-testid=post-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
await click('تسجيل الخروج'); await sleep(700);

// ---------- client approves v2 ----------
await click('ادخل كعميل'); await waitFor(`!!document.querySelector('[data-testid=social-badge]')`, 20000);
await click('السوشل'); await waitFor(`!!document.querySelector('[data-testid=post-card]')`);
await ev(`document.querySelector('[data-testid=post-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=client-decision]')`);
CHECKS['client sees v2 note'] = (await text('[data-testid=post-sheet]')).includes('كبّرنا الشعار');
await click('موافق'); await toastHas('وصل قرارك'); await closeToast();
CHECKS['status approved'] = (await status()) === 'approved';
await ev(`document.querySelector('[data-testid=post-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
CHECKS['client badge gone after deciding'] = !(await ev(`!!document.querySelector('[data-testid=social-badge]')`));
await click('تسجيل الخروج'); await sleep(700);

// ---------- admin publishes with the link ----------
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`);
await click('السوشل'); await waitFor(`!!document.querySelector('[data-testid=post-card]')`);
await ev(`document.querySelector('[data-testid=post-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=published-url]')`);
CHECKS['publish disabled without a valid link'] = await ev(`[...document.querySelectorAll('[data-testid=team-actions] button')].find(b=>b.textContent.includes('تم النشر')).disabled === true`);
await setInput(`document.querySelector('[data-testid=published-url]')`, 'https://www.instagram.com/p/abc123/');
await click('تم النشر'); await toastHas('سُجّل كمنشور'); await closeToast();
CHECKS['status published'] = (await status()) === 'published';
CHECKS['live link shown'] = await ev(`[...document.querySelectorAll('[data-testid=post-sheet] a')].some(a=>a.href==='https://www.instagram.com/p/abc123/')`);
CHECKS['no new version after publish'] = !(await ev(`[...document.querySelectorAll('[data-testid=team-actions] button')].some(b=>b.textContent.includes('ارفع نسخة جديدة'))`));
await ev(`document.querySelector('[data-testid=post-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
// reload: everything persisted
await send('Page.reload'); await sleep(1500); await waitFor(`!!document.querySelector('[data-testid=social-board]') || [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='السوشل')`, 20000);
await click('السوشل'); await waitFor(`!!document.querySelector('[data-testid=post-card]')`);
CHECKS['persisted after reload'] = await ev(`document.querySelector('[data-testid=post-card]').dataset.status === 'published'`);
await click('تسجيل الخروج'); await sleep(700);

// ---------- client archive + creative isolation ----------
await click('ادخل كعميل'); await sleep(1200);
await click('السوشل'); await waitFor(`!!document.querySelector('[data-testid=social-board]')`);
await click('الأرشيف'); await sleep(300);
CHECKS['client archive keeps the published post with its link'] = await ev(`document.querySelector('[data-testid=post-card]')?.dataset.status === 'published'`);
await ev(`document.querySelector('[data-testid=post-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=post-sheet]')`);
CHECKS['client opens the live link'] = await ev(`[...document.querySelectorAll('[data-testid=post-sheet] a')].some(a=>a.href==='https://www.instagram.com/p/abc123/')`);
await ev(`document.querySelector('[data-testid=post-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
await click('تسجيل الخروج'); await sleep(700);
await click('ادخل كمبدع'); await sleep(1200);
await click('السوشل'); await waitFor(`!!document.querySelector('[data-testid=social-board]')`);
CHECKS['creative without tasks sees no posts'] = !(await ev(`!!document.querySelector('[data-testid=post-card]')`));
CHECKS['creative without tasks cannot create'] = !(await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().includes('منشور جديد'))`));

CHECKS['no console errors'] = errors.length === 0;

ws.close(); chrome.kill(); try{fs.rmSync(`/tmp/hamsha-chrome-${port}`,{recursive:true,force:true}); fs.rmSync(f1); fs.rmSync(f2);}catch{}
console.log(JSON.stringify({...CHECKS, errors}, null, 1));
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS smoke-social.mjs')
