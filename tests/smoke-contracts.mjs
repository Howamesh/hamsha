// «العقود» phase 1 (2026-10-29): the whole loop on the demo store across the three roles.
// admin: legal profile → full contract from the template (numbers typed, arithmetic + words) → save version →
// Hawamish signs + sends → client opens (→ «فُتح») → asks for changes → admin edits (months 12→6) → re-sends →
// client signs (drawn) → admin completes; creative contract → rejected; block banner; social grid tab.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const port = 9980 + Math.floor(Math.random()*9);
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
await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable'); await send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span,label')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(450); return r; };
const clickSel = async (sel) => { const r = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(400); return r; };
const setInput = async (sel, v) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return 'ok'})()`);
const setT = (testid, v) => setInput(`document.querySelector('[data-testid=${testid}]')`, v);
const text = async (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText || ''`);
const status = async () => ev(`document.querySelector('[data-testid=contract-sheet] [data-status]')?.dataset.status || 'NONE'`);
const toastHas = async (t) => waitFor(`!!document.querySelector('[role=alert]') && document.querySelector('[role=alert]').innerText.includes(${JSON.stringify(t)})`).then(()=>true).catch(()=>false);
const closeToast = async () => { await ev(`document.querySelector('[role=alert] button')?.click()`); await sleep(200); };
const CHECKS = {};
/** draw a squiggle on the signature canvas with real mouse events */
const draw = async () => {
  const r = await ev(`(()=>{const c=document.querySelector('[data-testid=signature-canvas]');if(!c)return null;const b=c.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  if (!r) return false;
  const pts = [[0.2,0.6],[0.3,0.3],[0.45,0.7],[0.6,0.35],[0.75,0.65],[0.85,0.4]].map(([a,b])=>({x:Math.round(r.x+r.w*a),y:Math.round(r.y+r.h*b)}));
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pts[0].x,y:pts[0].y,button:'left',clickCount:1});
  for (const p of pts.slice(1)) { await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'left'}); await sleep(20); }
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pts[5].x,y:pts[5].y,button:'left',clickCount:1});
  await sleep(300);
  return true;
};
const signFlow = async (name) => {
  await waitFor(`!!document.querySelector('[data-testid=sign-dialog]')`);
  if (name) await setT('sign-name', name);
  await draw();
  await ev(`document.querySelector('[data-testid=sign-ack]').click()`); await sleep(200);
  const enabled = await ev(`document.querySelector('[data-testid=sign-confirm]').disabled === false`);
  await clickSel('[data-testid=sign-confirm]');
  return enabled;
};
const openSettings = async () => { await ev(`document.querySelector('button svg.lucide-settings')?.closest('button').click()`); await sleep(400); };

await send('Page.navigate',{url: BASE + '/login'}); await sleep(1500);
await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ادخل كمدير')`, 30000);

// ---------- admin: client + linked client account + legal profile ----------
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`, 30000);
await setInput(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل'))`, 'شركة سانا');
await ev(`[...document.querySelectorAll('input')].find(x=>x.placeholder.includes('عميل')).form.requestSubmit()`); await sleep(500);
await click('شركة سانا'); await sleep(500);
const sel = `[...document.querySelectorAll('aside select')].find(s=>[...s.options].some(o=>o.textContent.includes('عميل تجريبي')))`;
await setInput(sel, await ev(`[...(${sel}).options].find(o=>o.textContent.includes('عميل تجريبي')).value`)); await sleep(400);
await openSettings(); await waitFor(`!!document.querySelector('[data-testid=legal-settings]')`);
CHECKS['legal settings visible to admin'] = true;
await setT('legal-cr', '7054065292'); await setT('legal-rep', 'إبراهيم القفاري'); await setT('legal-signer', 'إبراهيم القفاري');
await clickSel('[data-testid=legal-add-bank]'); await setT('legal-iban-0', 'SA0000000000000000000000');
await clickSel('[data-testid=legal-save]');
CHECKS['legal profile saved'] = await toastHas('انحفظ'); await closeToast();

// ---------- admin: the contracts board + a full contract ----------
CHECKS['switch to contracts'] = (await click('العقود')) === 'ok';
await waitFor(`!!document.querySelector('[data-testid=contracts-board]')`);
CHECKS['empty board message'] = (await text('[data-testid=contracts-board]')).includes('ما فيه عقود بعد');
await clickSel('[data-testid=new-contract]'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="عقد جديد"]')`);
CHECKS['full template selected by default + title suggested'] = await ev(`document.querySelector('[data-testid=contract-kind] [data-kind=full]').getAttribute('aria-pressed')==='true' && document.querySelector('[data-testid=contract-title]').value.includes('عقد')`);
await setT('contract-title', 'عقد إنشاء موقع وتفعيل التواصل');
await click('إنشاء'); await waitFor(`!!document.querySelector('[data-testid=contract-editor]')`, 20000);
CHECKS['editor opens with missing values flagged'] = await ev(`!!document.querySelector('[data-testid=missing-values]')`);
CHECKS['Hawamish party prefilled from the legal profile'] = (await ev(`document.querySelector('[data-testid=hawamish-name]').value`)).includes('هوامش');
CHECKS['sign-send disabled while values are missing'] = await ev(`document.querySelector('[data-testid=sign-send]').disabled === true`);
await setT('contract-project', 'تعزيز الحضور الرقمي وبناء هوية إعلامية');
await setT('counterparty-rep', 'زياد بن محمد الجاسر');
await setT('vars-platforms', 'Instagram · TikTok'); await setT('vars-posts', '8');
await setT('pricing-monthly', '4000'); await setT('pricing-months', '12'); await sleep(300);
CHECKS['arithmetic: 4,000 × 12 = 48,000 in words'] = (await text('[data-testid=pricing-total]')).includes('(48,000) ثمانية وأربعون ألف ريال سعودي');
CHECKS['paper shows the draft number + the amount'] = await ev(`(()=>{const p=document.querySelector('[data-testid=contract-paper]');return !!p && p.innerText.includes('مسودة #2612') && p.innerText.includes('(48,000)') && p.innerText.includes('اثني عشر (12) شهراً') && p.innerText.includes('1448')})()`);
CHECKS['paper has the Hijri date line'] = /يوم .+ \d{2}\/\d{2}\/14\d{2}هـ الموافق \d{2}\/\d{2}\/\d{4}م/.test(await text('[data-testid=contract-paper]'));
CHECKS['posts count flows into section 02'] = (await text('[data-testid=contract-paper]')).includes('بواقع 8 منشوراً');
CHECKS['fixed sections locked'] = await ev(`[...document.querySelectorAll('[data-testid=section-editor] textarea')].filter(t=>t.disabled).length >= 6`);
CHECKS['missing flag gone once typed'] = !(await ev(`!!document.querySelector('[data-testid=missing-values]')`));
await clickSel('[data-testid=save-version]');
CHECKS['version 1 saved'] = await toastHas('انحفظت النسخة 1'); await closeToast();
CHECKS['save disabled when nothing changed'] = await ev(`document.querySelector('[data-testid=save-version]').disabled === true`);
await clickSel('[data-testid=sign-send]');
CHECKS['Hawamish sign dialog prefilled'] = await waitFor(`document.querySelector('[data-testid=sign-name]')?.value === 'إبراهيم القفاري'`).then(()=>true).catch(()=>false);
CHECKS['confirm disabled until drawn + acknowledged'] = await ev(`document.querySelector('[data-testid=sign-confirm]').disabled === true`);
CHECKS['signed + sent'] = await signFlow();
CHECKS['sent toast'] = await toastHas('أُرسل للتوقيع'); await closeToast();
await waitFor(`!!document.querySelector('[data-testid=contract-sheet]')`);
CHECKS['status sent'] = (await status()) === 'sent';
CHECKS['Hawamish signature on the paper'] = (await ev(`document.querySelectorAll('[data-testid=contract-paper] [data-testid=paper-signature]').length`)) === 1;
CHECKS['trail: created, version, first_signed, sent'] = await ev(`(()=>{const t=document.querySelector('[data-testid=contract-trail]')?.innerText||'';return t.includes('أُنشئ')&&t.includes('حُفظت نسخة')&&t.includes('وقّعت هوامش')&&t.includes('أُرسل')})()`);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
await click('تسجيل الخروج'); await sleep(700);

// ---------- client: opens → asks for changes ----------
await click('ادخل كعميل'); await waitFor(`!!document.querySelector('[data-testid=contracts-badge]')`, 20000);
CHECKS['client badge = 1'] = (await text('[data-testid=contracts-badge]')).trim() === '1';
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
CHECKS['client has no «عقد جديد»'] = !(await ev(`!!document.querySelector('[data-testid=new-contract]')`));
await ev(`document.querySelector('[data-testid=contract-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=counterparty-actions]')`);
await waitFor(`document.querySelector('[data-testid=contract-sheet] [data-status]')?.dataset.status === 'opened'`);
CHECKS['opening marks the contract «فُتح»'] = (await status()) === 'opened';
CHECKS['client sees sign / changes / reject only'] = await ev(`!!document.querySelector('[data-testid=sign-contract]') && !document.querySelector('[data-testid=contract-admin-actions]') && !document.querySelector('[data-testid=contract-trail]')`);
CHECKS['client paper carries Hawamish signature'] = (await ev(`document.querySelectorAll('[data-testid=contract-paper] [data-testid=paper-signature]').length`)) === 1;
await click('اطلب تعديلاً'); await waitFor(`!!document.querySelector('[data-testid=contract-note]')`);
await setT('contract-note', 'قللوا المدة إلى 6 أشهر');
await click('أرسل الملاحظات');
CHECKS['decision toast'] = await toastHas('وصل قرارك'); await closeToast();
CHECKS['status changes (client)'] = (await status()) === 'changes';
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
await click('تسجيل الخروج'); await sleep(700);

// ---------- admin: edits (12 → 6 months), re-sends ----------
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`, 30000);
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
CHECKS['admin card «يبي تعديل»'] = await ev(`document.querySelector('[data-testid=contract-card]').dataset.status === 'changes'`);
await ev(`document.querySelector('[data-testid=contract-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=contract-sheet]')`);
CHECKS['admin reads the client note in the banner'] = (await text('[data-testid=contract-decision-note]')).includes('قللوا المدة إلى 6 أشهر');
await clickSel('[data-testid=edit-contract]'); await waitFor(`!!document.querySelector('[data-testid=contract-editor]')`);
CHECKS['editor starts from version 1 values'] = (await ev(`document.querySelector('[data-testid=pricing-months]').value`)) === '12';
await setT('pricing-months', '6'); await sleep(200);
CHECKS['arithmetic updates: 24,000'] = (await text('[data-testid=pricing-total]')).includes('(24,000) أربعة وعشرون ألف');
await clickSel('[data-testid=sign-send]');
CHECKS['re-sign + re-send (v2)'] = await signFlow();
await toastHas('أُرسل للتوقيع'); await closeToast();
await waitFor(`!!document.querySelector('[data-testid=contract-sheet]')`);
CHECKS['v2 current, v1 keeps its note'] = await ev(`(()=>{const rows=[...document.querySelectorAll('[data-testid=contract-version-row]')];return rows.length===2 && rows[0].innerText.includes('النسخة 2') && rows[1].innerText.includes('قللوا المدة')})()`);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
await click('تسجيل الخروج'); await sleep(700);

// ---------- client signs v2 ----------
await click('ادخل كعميل'); await waitFor(`!!document.querySelector('[data-testid=contracts-badge]')`, 20000);
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
await ev(`document.querySelector('[data-testid=contract-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=sign-contract]')`);
CHECKS['client sees only the two SENT versions'] = (await ev(`document.querySelectorAll('[data-testid=contract-version-row]').length`)) === 2;
await clickSel('[data-testid=sign-contract]');
CHECKS['client signs (drawn)'] = await signFlow('زياد بن محمد الجاسر');
CHECKS['signed toast'] = await toastHas('تم التوقيع'); await closeToast();
CHECKS['status signed'] = (await status()) === 'signed';
CHECKS['both signatures on the paper'] = (await ev(`document.querySelectorAll('[data-testid=contract-paper] [data-testid=paper-signature]').length`)) === 2;
CHECKS['signatures summary + fingerprint'] = await ev(`(()=>{const t=document.querySelector('[data-testid=signatures-summary]')?.innerText||'';return t.includes('زياد بن محمد الجاسر') && t.includes('البصمة')})()`);
CHECKS['no second decision possible'] = !(await ev(`!!document.querySelector('[data-testid=sign-contract]')`));
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
CHECKS['client badge gone after signing'] = !(await ev(`!!document.querySelector('[data-testid=contracts-badge]')`));
await click('تسجيل الخروج'); await sleep(700);

// ---------- admin completes; creative contract; block; grid ----------
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`, 30000);
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
await ev(`document.querySelector('[data-testid=contract-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=complete-contract]')`);
CHECKS['signed contract has no edit / delete'] = !(await ev(`!!document.querySelector('[data-testid=edit-contract]')`)) && !(await ev(`[...document.querySelectorAll('[data-testid=contract-admin-actions] button')].some(b=>b.textContent.includes('احذف'))`));
await clickSel('[data-testid=complete-contract]'); await sleep(400);
CHECKS['status completed'] = (await status()) === 'completed';
CHECKS['trail has opened / changes / signed / completed'] = await ev(`(()=>{const t=document.querySelector('[data-testid=contract-trail]')?.innerText||'';return t.includes('فُتح')&&t.includes('طُلب تعديل')&&t.includes('وُقّع')&&t.includes('اكتمل')})()`);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
// creative contract (short template, one track)
await clickSel('[data-testid=new-contract]'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="عقد جديد"]')`);
await ev(`document.querySelector('[data-testid=contract-kind] [data-kind=short]').click()`); await sleep(100);
await setT('contract-party', 'creative'); await sleep(200);
CHECKS['creative select appears'] = await ev(`!!document.querySelector('[data-testid=contract-creative]')`);
await click('إنشاء'); await waitFor(`!!document.querySelector('[data-testid=contract-editor]')`, 20000);
await setT('track-0-monthly', '3000'); await setT('counterparty-rep', 'المبدع'); await sleep(200);
CHECKS['short paper: track price + total'] = (await text('[data-testid=contract-paper]')).includes('3,000 ريال شهرياً') && (await text('[data-testid=contract-paper]')).includes('36,000');
await clickSel('[data-testid=sign-send]'); CHECKS['creative contract signed + sent'] = await signFlow(); await toastHas('أُرسل'); await closeToast();
await waitFor(`!!document.querySelector('[data-testid=contract-sheet]')`);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
// a second (draft) client contract + the block flag
await clickSel('[data-testid=new-contract]'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="عقد جديد"]')`);
await click('إنشاء'); await waitFor(`!!document.querySelector('[data-testid=contract-editor]')`, 20000);
await ev(`document.querySelector('[data-testid=contract-editor] button[aria-label="إلغاء"]').click()`); await sleep(300);
await waitFor(`!!document.querySelector('[data-testid=contract-block]')`);
await ev(`document.querySelector('[data-testid=contract-block]').click()`); await sleep(300);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
CHECKS['admin sees 3 cards'] = (await ev(`document.querySelectorAll('[data-testid=contract-card]').length`)) === 3;
await click('السوشل'); await waitFor(`!!document.querySelector('[data-testid=social-board]')`);
await click('الشبكة'); await sleep(300);
CHECKS['social grid tab'] = (await text('[data-testid=social-board]')).includes('ما فيه شيء معتمد أو منشور بعد');
await click('تسجيل الخروج'); await sleep(700);
// creative rejects
await click('ادخل كمبدع'); await waitFor(`!!document.querySelector('[data-testid=contracts-badge]')`, 20000);
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
CHECKS['creative sees only own contract'] = (await ev(`document.querySelectorAll('[data-testid=contract-card]').length`)) === 1;
await ev(`document.querySelector('[data-testid=contract-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=sign-contract]')`);
await click('ارفض'); await waitFor(`!!document.querySelector('[data-testid=contract-note]')`);
await setT('contract-note', 'المبلغ غير مناسب'); await click('أرسل الملاحظات'); await toastHas('وصل قرارك'); await closeToast();
CHECKS['creative rejected'] = (await status()) === 'rejected';
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
await click('تسجيل الخروج'); await sleep(700);
// client: blocked banner (latest client contract is a draft) + the unsent draft is invisible
await click('ادخل كعميل'); await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='العقود')`, 20000); await sleep(400);
CHECKS['client blocked banner'] = await ev(`!!document.querySelector('[data-testid=contract-blocked]')`);
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contracts-board]')`);
CHECKS['client never sees the unsent draft'] = (await ev(`document.querySelectorAll('[data-testid=contract-card]').length`)) === 1;
// reload: persisted
await send('Page.reload'); await sleep(1500); await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='العقود')`, 20000);
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
CHECKS['persisted after reload'] = await ev(`document.querySelector('[data-testid=contract-card]').dataset.status === 'completed'`);

CHECKS['no console errors'] = errors.length === 0;

ws.close(); chrome.kill(); try{fs.rmSync(`/tmp/hamsha-chrome-${port}`,{recursive:true,force:true});}catch{}
console.log(JSON.stringify({...CHECKS, errors}, null, 1));
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS smoke-contracts.mjs')
