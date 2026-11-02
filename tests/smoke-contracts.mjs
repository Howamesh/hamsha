// a brand-new browser profile every run (1 Nov: fixed per-port folders were reused across runs → stale UI state,
// e.g. a closed side panel, made the login waits time out «randomly»)
const PROFILE = (await import('node:fs')).mkdtempSync('/tmp/hamsha-chrome-run-');
// «العقود» phase 1 (2026-10-29): the whole loop on the demo store across the three roles.
// admin: legal profile → full contract from the template (numbers typed, arithmetic + words) → save version →
// Hawamish signs + sends → client opens (→ «فُتح») → asks for changes → admin edits (months 12→6) → re-sends →
// client signs (drawn) → admin completes; creative contract → rejected; block banner; social grid tab.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable'); await send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
const click = async (txt) => { const r = await ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span,label')].filter(e=>e.offsetParent!==null&&e.textContent.trim()===${JSON.stringify(txt)});const el=els[els.length-1];if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(450); return r; };
const clickSel = async (sel) => { const r = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'NOTFOUND';el.click();return 'ok'})()`); await sleep(400); return r; };
const setInput = async (sel, v) => ev(`(()=>{const el=${sel};if(!el)return 'NOINPUT';const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return 'ok'})()`);
const setT = (testid, v) => setInput(`document.querySelector('[data-testid=${testid}]')`, v);
// follows the «ناقص: … — ودّني لها» bar like a person: tap it, fill the field it focuses, repeat (1 Nov rules)
const fillMissing = async () => {
  for (let i = 0; i < 30; i++) {
    if (!(await ev(`!!document.querySelector('[data-testid=missing-values]')`))) return true;
    await ev(`document.querySelector('[data-testid=missing-values]').click()`); await sleep(250);
    const id = await ev(`document.activeElement?.dataset?.testid || ''`);
    if (/platform/.test(id)) { await ev(`document.querySelector('[data-testid=platform-Instagram]').click()`); await sleep(150); continue; }
    const v = /email/.test(id) ? 'contact@example.sa' : /phone/.test(id) ? '0500000000' : /-cr$|nid/.test(id) ? '1010101010' : /city/.test(id) ? 'الرياض'
      : /job/.test(id) ? 'مصمم جرافيك' : /bank-owner/.test(id) ? 'صاحب الحساب' : /bank-account/.test(id) ? '1234567890'
      : /-rep$/.test(id) ? 'ممثل الطرف' : /-name$/.test(id) ? 'اسم الطرف' : /project/.test(id) ? 'مشروع الاختبار' : /posts|designs|videos|months/.test(id) ? '4'
      : /monthly|price|total|installment/.test(id) ? '3000' : /iban/.test(id) ? 'SA0000000000000000000000' : '';
    if (!id || !v) return false;
    await setT(id, v); await sleep(150);
  }
  return false;
};
const tab = async (name) => { const r = await ev(`(()=>{const b=[...document.querySelectorAll('[data-testid=contracts-board] button')].find(b=>b.offsetParent!==null&&b.textContent.trim().startsWith(${JSON.stringify(name)}));if(!b)return 'NOTFOUND';b.click();return 'ok'})()`); await sleep(300); return r; };
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
CHECKS['sign-send stays open with empty fields (only the core blocks — Yousef 2 Nov)'] = await ev(`document.querySelector('[data-testid=sign-send]').disabled === false`);
// 1 Nov: the bar names the missing field and takes him there (focus + flash)
CHECKS['missing bar names the field (first: the project the text uses)'] = (await text('[data-testid=missing-values]')).includes('ناقص: المشروع');
await clickSel('[data-testid=missing-values]'); await sleep(300);
CHECKS['missing bar → focuses that field'] = await ev(`document.activeElement?.dataset?.testid === 'contract-project' && !!document.activeElement.closest('label.form-flash')`);
await setT('contract-project', 'تعزيز الحضور الرقمي وبناء هوية إعلامية');
await setT('counterparty-rep', 'زياد بن محمد الجاسر');
await clickSel('[data-testid=platform-Instagram]'); await clickSel('[data-testid=platform-TikTok]'); await setT('vars-posts', '8'); await setT('vars-designs', '4');
// 1 Nov: counts the contract text uses are required too — after posts + designs the bar moves on to the money
CHECKS['bar no longer asks for posts/designs once filled'] = !/(المنشورات|التصاميم)/.test(await text('[data-testid=missing-values]'));
await setT('pricing-monthly', '4000'); await setT('pricing-months', '12'); await sleep(300);
// real typing, one key at a time (1 Nov: inner components remounted every keystroke → the field lost focus after one character; Arabic digits counted as 0)
const typeKeys = async (testid, chars) => { await setT(testid, ''); await ev(`document.querySelector('[data-testid=${testid}]').focus()`); for (const ch of chars) { await send('Input.insertText', { text: ch }); await sleep(60); } await sleep(150); return ev(`[document.querySelector('[data-testid=${testid}]').value, document.activeElement?.dataset?.testid || '']`); };
{ const [v, f] = await typeKeys('vars-posts', ['1', '٢']); CHECKS['number field keeps focus while typing + Arabic digits (1٢ → 12)'] = v === '12' && f === 'vars-posts'; }
{ const prev = await ev(`document.querySelector('[data-testid=counterparty-rep]').value`); const [v, f] = await typeKeys('counterparty-rep', ['س', 'ع', 'د']); CHECKS['party field keeps focus while typing'] = v === 'سعد' && f === 'counterparty-rep'; await setT('counterparty-rep', prev); }
await setT('vars-posts', '8'); await sleep(300);
// «كل الأرقام إنجليزي» (1 Nov): Arabic digits typed into ANY text field become Latin, caret stays in place
{ const prev = await ev(`document.querySelector('[data-testid=counterparty-rep]').value`); const [v] = await typeKeys('counterparty-rep', ['ع', '١', '٢']);
  await setT('counterparty-rep', 'ab'); await ev(`(()=>{const e=document.querySelector('[data-testid=counterparty-rep]');e.focus();e.setSelectionRange(1,1)})()`); await send('Input.insertText', { text: '٣' }); await sleep(150);
  const [v2, caret] = await ev(`(()=>{const e=document.querySelector('[data-testid=counterparty-rep]');return [e.value, e.selectionStart]})()`);
  CHECKS['Arabic digits become English in text fields (ع١٢ → ع12, caret kept)'] = v === 'ع12' && v2 === 'a3b' && caret === 2; await setT('counterparty-rep', prev); }
// the unit («شهر») sits beside the number, not on top of it (1 Nov: it covered «12»)
CHECKS['unit label does not overlap the number field'] = await ev(`(()=>{const i=document.querySelector('[data-testid=pricing-months]').getBoundingClientRect();const u=document.querySelector('[data-testid=pricing-months-unit]')?.getBoundingClientRect();return !!u && (u.right<=i.left || u.left>=i.right)})()`);
CHECKS['arithmetic: 4,000 × 12 = 48,000 in words'] = (await text('[data-testid=pricing-total]')).includes('(48,000) ثمانية وأربعون ألف ريال سعودي');
CHECKS['paper shows the draft number + the amount'] = await ev(`(()=>{const p=document.querySelector('[data-testid=contract-paper]');return !!p && p.innerText.includes('مسودة #2612') && p.innerText.includes('(48,000)') && p.innerText.includes('اثني عشر (12) شهراً') && p.innerText.includes('1448')})()`);
CHECKS['paper has the Hijri date line'] = /يوم .+ \d{2}\/\d{2}\/14\d{2}هـ الموافق \d{2}\/\d{2}\/\d{4}م/.test(await text('[data-testid=contract-paper]'));
CHECKS['posts count flows into section 02'] = (await text('[data-testid=contract-paper]')).includes('بواقع 8 منشوراً');
CHECKS['fixed sections locked'] = await ev(`[...document.querySelectorAll('[data-testid=section-editor] textarea')].filter(t=>t.disabled).length >= 6`);
CHECKS['parties block: the bar asks for what the paper prints (CR or ID, phone, e-mail…)'] = /(الطرف الآخر|هوامش)/.test(await text('[data-testid=missing-values]'));
CHECKS['bar-guided filling completes the contract'] = await fillMissing();
// «ذاكرة العقد» (1 Nov): empty a field → its value from THIS contract is one tap away
const phone0 = await ev(`document.querySelector('[data-testid=counterparty-phone]').value`);
await setT('counterparty-phone', '05'); await sleep(120); await setT('counterparty-phone', '0'); await sleep(120); await setT('counterparty-phone', ''); await sleep(250);
CHECKS['emptied field offers back its full value (not the half-deleted one)'] = await ev(`(()=>{const b=document.querySelector('[data-testid=counterparty-phone]').closest('label').querySelector('[data-testid=recall]');return !!b && b.textContent.includes(${JSON.stringify(phone0)})})()`);
await ev(`document.activeElement?.blur()`); await sleep(250);
const op = async () => Number(await ev(`getComputedStyle(document.querySelector('[data-testid=counterparty-phone]').closest('label').querySelector('[data-testid=recall]')).opacity`));
const faint = await op();
await ev(`document.querySelector('[data-testid=counterparty-phone]').focus()`); await sleep(300);
CHECKS['memory pill is faint, and clear while its field is focused'] = faint < 0.6 && (await op()) > 0.95;
await ev(`document.querySelector('[data-testid=counterparty-phone]').closest('label').querySelector('[data-testid=recall]').click()`); await sleep(200);
CHECKS['…one tap puts it back'] = (await ev(`document.querySelector('[data-testid=counterparty-phone]').value`)) === phone0;
CHECKS['missing flag gone once typed'] = !(await ev(`!!document.querySelector('[data-testid=missing-values]')`));
// 1 Nov notes: platforms are chips · hints on the two unclear fields · a clause opens full screen · edits survive a refresh
CHECKS['platform chips → paper text «Instagram · TikTok»'] = (await text('[data-testid=contract-paper]')).includes('Instagram · TikTok') && (await ev(`document.querySelector('[data-testid=platform-Instagram]').getAttribute('aria-pressed')`)) === 'true';
CHECKS['platform list = his 8 (تويتر, no فيسبوك/تيليجرام/بنترست)'] = await ev(`(()=>{const t=[...document.querySelectorAll('[data-testid=vars-platforms] button')].map(b=>b.textContent.trim());return t.includes('تويتر')&&!t.some(x=>/إكس|فيسبوك|تيليجرام|بنترست/.test(x))&&t.length===8})()`);
CHECKS['late-days + support fields explained'] = (await text('[data-testid=contract-editor]')).includes('يتوقف الشغل لين يدفع') && (await text('[data-testid=contract-editor]')).includes('أشهر دعم مجاني');
await clickSel('[data-testid=section-expand-02]'); await waitFor(`!!document.querySelector('[data-testid=section-focus]')`);
CHECKS['clause opens full screen in big type'] = await ev(`(()=>{const b=document.querySelector('[data-testid=section-focus-body]');return parseFloat(getComputedStyle(b).fontSize)>=20 && b.value.includes('يلتزم')})()`);
CHECKS['full screen has a «صغّر» shrink button'] = (await text('[data-testid=section-focus-done]')).includes('صغّر') && (await ev(`!!document.querySelector('[data-testid=section-focus-done] svg')`));
const sec02 = await ev(`document.querySelector('[data-testid=section-focus-body]').value`);
await setT('section-focus-body', sec02 + '\nسطر تجربة من الشاشة الكاملة'); await sleep(200);
await clickSel('[data-testid=section-focus-done]');
CHECKS['full-screen edit lands in the clause + paper'] = !(await ev(`!!document.querySelector('[data-testid=section-focus]')`)) && (await text('[data-testid=contract-paper]')).includes('سطر تجربة من الشاشة الكاملة');
// 1 Nov: an edited clause gets «معدّل» in the form only — never on the paper the client receives
CHECKS['edited clause shows «معدّل» in the form'] = await ev(`!!document.querySelector('[data-testid=changed-02]')`) && !(await ev(`!!document.querySelector('[data-testid=changed-03]')`));
CHECKS['…and nothing of it on the contract paper'] = !(await text('[data-testid=contract-paper]')).includes('معدّل');
await send('Page.reload'); await sleep(1500);
CHECKS['refresh: editor reopens with the unsaved edits'] = await waitFor(`!!document.querySelector('[data-testid=contract-editor]') && !!document.querySelector('[data-testid=draft-restored]') && document.querySelector('[data-testid=pricing-months]')?.value === '12'`, 20000).then(()=>true).catch(()=>false)
  && (await text('[data-testid=contract-paper]')).includes('سطر تجربة من الشاشة الكاملة') && (await ev(`document.querySelector('[data-testid=platform-TikTok]').getAttribute('aria-pressed')`)) === 'true';
// 1 Nov (his lost edits): the banner's dismiss button must NOT erase anything; erasing asks first and can be undone
await clickSel('[data-testid=discard-ask]'); await sleep(200);
CHECKS['«back to saved» asks before erasing'] = await ev(`!!document.querySelector('[data-testid=discard-draft]') && document.querySelector('[data-testid=pricing-months]').value === '12'`);
await clickSel('[data-testid=discard-draft]'); await sleep(300);
CHECKS['…erased, with an undo bar'] = !(await text('[data-testid=contract-paper]')).includes('سطر تجربة من الشاشة الكاملة') && await ev(`!!document.querySelector('[data-testid=undo-discard]')`);
await clickSel('[data-testid=undo-discard]'); await sleep(300);
CHECKS['…«تراجع» brings every edit back'] = await ev(`document.querySelector('[data-testid=pricing-months]').value === '12'`) && (await text('[data-testid=contract-paper]')).includes('سطر تجربة من الشاشة الكاملة');
await send('Page.reload'); await sleep(1500);
await waitFor(`!!document.querySelector('[data-testid=draft-restored]')`, 20000);
await clickSel('[data-testid=draft-restored-ok]'); await sleep(300);
CHECKS['«تمام» only hides the banner — edits stay'] = await ev(`!document.querySelector('[data-testid=draft-restored]') && document.querySelector('[data-testid=pricing-months]').value === '12'`);
// ⭐٥ (1 Nov): the paper full size; tap a part → its editor beside the paper; text that runs past a page is flagged
await clickSel('[data-testid=open-paper-big]'); await waitFor(`!!document.querySelector('[data-testid=paper-big]')`);
await clickSel('[data-testid=paper-zoom-in]');
CHECKS['big paper opens + zoom 110%'] = (await text('[data-testid=paper-zoom]')).trim() === '110%';
// 2 Nov (Yousef: «وين أرجع للصفحة الكاملة اللي أكتب فيها؟»): ALL the fields beside the big paper by default
CHECKS['big paper: the full form is beside it by default (one copy only)'] = await ev(`document.querySelector('[data-testid=paper-panel]')?.dataset.mode === 'all' && !!document.querySelector('[data-testid=paper-panel] [data-testid=contract-title-input]') && !!document.querySelector('[data-testid=paper-panel] [data-testid=counterparty-name]') && document.querySelectorAll('[data-testid=contract-title-input]').length === 1`);
await clickSel('[data-testid=paper-big] [data-pick="sec:05"]'); await sleep(400);
CHECKS['big paper: tapping a clause scrolls the full form to it and lights it up'] = await ev(`(()=>{const a=document.querySelector('[data-testid=paper-panel] [data-anchor="sec:05"]');const b=document.querySelector('[data-testid=paper-panel-body]').getBoundingClientRect();if(!a)return false;const r=a.getBoundingClientRect();return a.classList.contains('form-flash') && r.top>=b.top-2 && r.top<b.bottom})()`);
if (process.env.SHOT_DIR) { const img = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(`${process.env.SHOT_DIR}/big-paper-full.png`, Buffer.from(img.result.data, 'base64')); }
await setT('pricing-months', '12'); await sleep(200);
CHECKS['big paper: typing in the full form updates the big paper'] = (await text('[data-testid=paper-big] [data-testid=contract-paper]')).includes('12');
await clickSel('[data-testid=panel-hide]'); await sleep(200);
CHECKS['big paper: the form can be hidden and brought back'] = await ev(`!document.querySelector('[data-testid=paper-panel]') && !!document.querySelector('[data-testid=panel-show]')`) && await (async () => { await clickSel('[data-testid=panel-show]'); await sleep(200); return ev(`!!document.querySelector('[data-testid=paper-panel]')`) })();
// «هذا الجزء بس»: only the tapped part (the earlier behaviour, still there)
await clickSel('[data-testid=panel-mode-part]'); await waitFor(`!!document.querySelector('[data-testid=paper-panel] [data-testid=panel-body]')`);
CHECKS['tap a clause → its text beside the paper (locked until unlocked)'] = await ev(`document.querySelector('[data-testid=panel-body]').readOnly === true && !!document.querySelector('[data-testid=paper-big] .paper-pick-active')`);
await clickSel('[data-testid=panel-unlock]');
// 1 Nov: an unlocked clause in the panel can be locked again and opened full screen
CHECKS['panel: «اقفله مرة ثانية» + «كبّر» appear once unlocked'] = await ev(`!!document.querySelector('[data-testid=panel-relock]') && !!document.querySelector('[data-testid=panel-expand]')`);
await clickSel('[data-testid=panel-expand]'); await sleep(300);
CHECKS['panel «كبّر» opens the clause full screen over the big paper'] = await ev(`!!document.querySelector('[data-testid=section-focus]') && document.querySelector('[data-testid=section-focus-body]').readOnly === false`);
await clickSel('[data-testid=section-focus-done]'); await sleep(200);
const sec05 = await ev(`document.querySelector('[data-testid=panel-body]').value`);
await setT('panel-body', sec05 + '\nإضافة من الورقة الكبيرة'); await sleep(250);
CHECKS['panel edit shows on the big paper + the form'] = (await text('[data-testid=paper-big] [data-testid=contract-paper]')).includes('إضافة من الورقة الكبيرة') && await ev(`[...document.querySelectorAll('[data-testid=section-editor] textarea')].some(t=>t.value.includes('إضافة من الورقة الكبيرة'))`);
await setT('panel-body', sec05 + '\n' + 'سطر طويل جداً لاختبار تجاوز الصفحة. '.repeat(400)); await sleep(400);
CHECKS['text past the page is flagged (paper + header)'] = await ev(`!!document.querySelector('[data-testid=paper-big] .paper-page[data-overflow]') && !!document.querySelector('[data-testid=overflow-warning]')`);
await setT('panel-body', sec05); await sleep(400);
CHECKS['flag clears once it fits again'] = await ev(`!document.querySelector('[data-testid=paper-big] .paper-page[data-overflow]') && !document.querySelector('[data-testid=overflow-warning]')`);
await clickSel('[data-testid=panel-relock]'); await sleep(200);
CHECKS['panel «اقفله مرة ثانية» locks it back'] = await ev(`document.querySelector('[data-testid=panel-body]').readOnly === true && !!document.querySelector('[data-testid=panel-unlock]')`);
await clickSel('[data-testid=paper-big] [data-pick=pricing]'); await sleep(250);
CHECKS['tap the amount → pricing fields in the panel'] = await ev(`!!document.querySelector('[data-testid=paper-panel] [data-testid=pricing-months]')`);
await clickSel('[data-testid=paper-big-close]');
CHECKS['«صغّر» closes the big paper'] = !(await ev(`!!document.querySelector('[data-testid=paper-big]')`));
// his 2 notes (1 Nov): closing says the edit is in + brings the form to the edited part; opening lands where he tapped
CHECKS['closing: «انطبق» toast + form jumps to the edited part (flash)'] = await toastHas('انطبق') && await ev(`(()=>{const a=document.querySelector('[data-anchor=pricing]');return !!a && a.classList.contains('form-flash')})()`);
await closeToast();
await click('افتح العقد'); await sleep(300); // narrow window: the small paper is the second tab
await ev(`document.querySelector('.paper-preview [data-pick="sec:10"]').click()`); await waitFor(`!!document.querySelector('[data-testid=paper-big]')`); await sleep(300);
CHECKS['tap a clause on the small paper → big paper opens ON it, panel open'] = await ev(`(()=>{const sc=document.querySelector('[data-testid=paper-big-scroll]').getBoundingClientRect();const el=document.querySelector('[data-testid=paper-big] [data-pick="sec:10"]').getBoundingClientRect();return el.top>=sc.top-2 && el.top<sc.bottom && !!document.querySelector('[data-testid=paper-panel] [data-testid=panel-body]') && document.querySelector('[data-testid=paper-big] .paper-pick-active')?.dataset.pick==='sec:10'})()`);
await clickSel('[data-testid=paper-big-close]'); await sleep(400);
CHECKS['closing without edits: no toast, form still lands on the clause'] = !(await ev(`!!document.querySelector('[role=alert]')`)) && await ev(`(()=>{const f=document.querySelector('[data-anchor="sec:10"]');const r=f.getBoundingClientRect();return f.classList.contains('form-flash') && r.top>=0 && r.top<window.innerHeight})()`);
await clickSel('[data-testid=changed-02]'); await sleep(200);
CHECKS['«معدّل» opens the original text'] = (await text('[data-testid=changed-02-original]')).includes('النص الأصلي');
await clickSel('[data-testid=changed-02-restore]'); await sleep(300);
CHECKS['«رجّع النص الأصلي» puts the template back (mark gone)'] = !(await ev(`!!document.querySelector('[data-testid=changed-02]')`)) && !(await text('[data-testid=contract-paper]')).includes('سطر تجربة من الشاشة الكاملة');
await clickSel('[data-testid=save-version]');
CHECKS['version 1 saved'] = await toastHas('انحفظت النسخة 1'); await closeToast();
CHECKS['saved → draft cleared'] = await ev(`!document.querySelector('[data-testid=draft-restored]') && !Object.keys(localStorage).some(k=>k.startsWith('hamsha.contractDraft.'))`);
CHECKS['save disabled when nothing changed'] = await ev(`document.querySelector('[data-testid=save-version]').disabled === true`);
// Codex review (council 20261101-130516-b33f): a tab never clears another tab's newer draft; a note alone is not a draft
{ await setT('vars-posts', '9'); await sleep(250);
  const key = await ev(`Object.keys(localStorage).find(k=>k.startsWith('hamsha.contractDraft.'))||''`);
  const K = JSON.stringify(key);
  await ev(`(()=>{const d=JSON.parse(localStorage.getItem(${K}));d.at='2099-01-01T00:00:00.000Z';localStorage.setItem(${K},JSON.stringify(d))})()`); // «another tab» writes later
  await setT('vars-posts', '8'); await sleep(250);
  CHECKS['other tab\'s newer draft is not wiped'] = !!key && (await ev(`JSON.parse(localStorage.getItem(${K})||'{}').at`)) === '2099-01-01T00:00:00.000Z';
  await ev(`localStorage.removeItem(${K})`);
  await setT('editor-note', 'ملاحظة فقط'); await sleep(250);
  CHECKS['a note alone is not stored as a draft'] = !(await ev(`Object.keys(localStorage).some(k=>k.startsWith('hamsha.contractDraft.'))`));
  await setT('editor-note', ''); await sleep(150); }
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
// 1 Nov: everyone (here: the client) can open the contract full size to read it
await clickSel('[data-testid=sheet-open-big]'); await sleep(300);
CHECKS['client opens the contract full size (read-only, zoom)'] = await ev(`!!document.querySelector('[data-testid=sheet-paper-big] [data-testid=contract-paper]') && !document.querySelector('[data-testid=sheet-paper-big] .paper-pick')`);
await clickSel('[data-testid=sheet-zoom-in]'); await sleep(100);
CHECKS['…zoom works'] = (await text('[data-testid=sheet-zoom]')).trim() === '110%';
await clickSel('[data-testid=sheet-paper-close]'); await sleep(200);
CHECKS['…«صغّر» returns to the sheet'] = !(await ev(`!!document.querySelector('[data-testid=sheet-paper-big]')`)) && await ev(`!!document.querySelector('[data-testid=sign-contract]')`);
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
// 1 Nov: «آخر النشاط» in التنبيهات — the client's request is there, new, and tapping it opens the contract
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('التنبيهات'))?.click()`); await sleep(400);
CHECKS['activity: the client\'s «طلب تعديل» shows in التنبيهات'] = await ev(`[...document.querySelectorAll('[data-testid=activity-item]')].some(x=>x.dataset.kind==='c_changes' && x.innerText.includes('طلب تعديل'))`);
CHECKS['activity: none of my own moves (created/saved/signed/sent)'] = await ev(`![...document.querySelectorAll('[data-testid=activity-item]')].some(x=>['c_created','c_version','c_first_signed','c_sent','c_withdrawn','p_sent','p_published'].includes(x.dataset.kind))`);
CHECKS['activity: one row per contract (no pile)'] = await ev(`[...document.querySelectorAll('[data-testid=activity-item]')].filter(x=>x.innerText.includes('عقد إنشاء موقع وتفعيل التواصل')).length <= 1`);
await ev(`[...document.querySelectorAll('[data-testid=activity-item]')].find(x=>x.dataset.kind==='c_changes').click()`); await sleep(500);
CHECKS['…tapping it opens that contract'] = await ev(`!!document.querySelector('[data-testid=contract-sheet]')`);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]')?.click()`); await sleep(300);
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
CHECKS['admin card «يبي تعديل»'] = await ev(`document.querySelector('[data-testid=contract-card]').dataset.status === 'changes'`);
// 2 Nov (his pick ٥): the red number = waiting on YOU, said in words on the board and on the card
CHECKS['admin red number = the change request only (1)'] = (await text('[data-testid=contracts-badge]')).trim() === '1';
CHECKS['…the board says it in words'] = (await text('[data-testid=contracts-waiting]')).includes('عقد واحد ينتظر ردّك');
CHECKS['…the card says the step (client asked for changes)'] = await ev(`(()=>{const x=document.querySelector('[data-testid=contract-card] [data-testid=contract-step]');return !!x && x.dataset.step==='changes' && x.innerText.includes('طلب تعديلاً')})()`);
// the Hamsha logo = home: back to the calendar from anywhere; the rail's number opens «قيد الإعداد»
await clickSel('[data-testid=home-logo]'); await sleep(300);
CHECKS['logo → home (calendar, contracts closed)'] = await ev(`!!document.querySelector('[data-testid=cal-toolbar]') && !document.querySelector('[data-testid=contracts-board]')`);
await clickSel('[data-testid=rail-contracts]'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
CHECKS['rail number opens «قيد الإعداد»'] = await ev(`[...document.querySelectorAll('[data-testid=contracts-board] button')].some(b=>b.textContent.trim().startsWith('قيد الإعداد') && b.className.includes('bg-card'))`);
// 2 Nov (his rule «خلي المربع فقط على اللي اضغط عليه»): exactly ONE pressed square — the last thing tapped
const pressed = () => ev(`[...document.querySelectorAll('[data-testid=side-rail] button')].filter(b=>b.className.includes('bg-muted-bg text-fg')).map(b=>b.dataset.testid).join(',')`);
await clickSel('[data-testid=rail-messages]'); await sleep(300);
CHECKS['rail: a panel section tapped → only it is pressed'] = (await pressed()) === 'rail-messages';
await clickSel('[data-testid=rail-contracts]'); await sleep(300);
CHECKS['rail: the page tapped again → only the page is pressed'] = (await pressed()) === 'rail-contracts';
await clickSel('[data-testid=rail-messages]'); await sleep(200); await clickSel('[data-testid=rail-messages]'); await sleep(300);
CHECKS['rail: closing the panel hands the square back to the page'] = (await pressed()) === 'rail-contracts';
await clickSel('[data-testid=rail-main]'); await sleep(300);   // leave the panel open on «العملاء» for the next steps
await ev(`document.querySelector('[data-testid=contract-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=contract-sheet]')`);
CHECKS['admin reads the client note in the banner'] = (await text('[data-testid=contract-decision-note]')).includes('قللوا المدة إلى 6 أشهر');
await clickSel('[data-testid=edit-contract]'); await waitFor(`!!document.querySelector('[data-testid=contract-editor]')`);
CHECKS['editor starts from version 1 values'] = (await ev(`document.querySelector('[data-testid=pricing-months]').value`)) === '12';
await setT('pricing-months', '6'); await sleep(200);
await sleep(600);   // the local draft is written
await clickSel('[data-testid=home-logo]'); await sleep(300);
CHECKS['logo while editing: asks first (edits kept as a draft)'] = await ev(`!!document.querySelector('[data-testid=leave-dialog]')`);
await clickSel('[data-testid=leave-stay]'); await sleep(200);
CHECKS['…«كمّل الكتابة» keeps the editor and the edit'] = await ev(`!!document.querySelector('[data-testid=contract-editor]') && document.querySelector('[data-testid=pricing-months]').value==='6'`);
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
CHECKS['signed paper says «عقد #2612», never «مسودة #»'] = await ev(`(()=>{const p=document.querySelector('[data-testid=contract-paper]').innerText;return p.includes('عقد #2612') && !p.includes('مسودة #')})()`);
CHECKS['signatures summary + fingerprint'] = await ev(`(()=>{const t=document.querySelector('[data-testid=signatures-summary]')?.innerText||'';return t.includes('زياد بن محمد الجاسر') && t.includes('البصمة')})()`);
CHECKS['no second decision possible'] = !(await ev(`!!document.querySelector('[data-testid=sign-contract]')`));
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
CHECKS['client badge gone after signing'] = !(await ev(`!!document.querySelector('[data-testid=contracts-badge]')`));
await click('تسجيل الخروج'); await sleep(700);

// ---------- admin completes; creative contract; block; grid ----------
await click('ادخل كمدير'); await waitFor(`[...document.querySelectorAll('input')].some(x=>x.placeholder.includes('عميل'))`, 30000);
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contracts-board]')`);
// 2 Nov (his pick ٥): a contract both sides signed is «ساري» in «السارية» — not a task, no red number
CHECKS['signed contract lives in «السارية» as «ساري»'] = (await tab('السارية')) === 'ok' && await ev(`(()=>{const c=[...document.querySelectorAll('[data-testid=contract-card]')];return c.length===1 && !!c[0].querySelector('[data-status=active]') && !!c[0].querySelector('[data-testid=contract-term-line]')})()`);
CHECKS['…and is not in «قيد الإعداد»'] = await (async () => { await tab('قيد الإعداد'); return !(await ev(`[...document.querySelectorAll('[data-testid=contract-card]')].some(c=>c.dataset.status==='signed')`)) })();
await tab('السارية');
await ev(`document.querySelector('[data-testid=contract-card]').click()`); await waitFor(`!!document.querySelector('[data-testid=complete-contract]')`);
CHECKS['signed contract has no edit / delete'] = !(await ev(`!!document.querySelector('[data-testid=edit-contract]')`)) && !(await ev(`[...document.querySelectorAll('[data-testid=contract-admin-actions] button')].some(b=>b.textContent.includes('احذف'))`));
await clickSel('[data-testid=complete-contract]'); await sleep(400);
CHECKS['status completed'] = (await status()) === 'completed';
CHECKS['trail has opened / changes / signed / completed'] = await ev(`(()=>{const t=document.querySelector('[data-testid=contract-trail]')?.innerText||'';return t.includes('فُتح')&&t.includes('طُلب تعديل')&&t.includes('وُقّع')&&t.includes('اكتمل')})()`);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
// creative contract = «عقد عمل» (1 Nov: «هنا كيف المشروع وهو المبدع؟ … الانجازات حق الربع الاول؟»)
await clickSel('[data-testid=new-contract]'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="عقد جديد"]')`);
await setT('contract-party', 'creative'); await sleep(200);
CHECKS['creative select appears'] = await ev(`!!document.querySelector('[data-testid=contract-creative]')`);
CHECKS['creative → «عقد عمل» picked by itself'] = await ev(`document.querySelector('[data-testid=contract-kind]')?.dataset.kind === 'employment' && document.querySelector('[data-testid=contract-title]').value === 'عقد عمل'`);
await click('إنشاء'); await waitFor(`!!document.querySelector('[data-testid=contract-editor]')`, 20000);
CHECKS['employment: no project / counts / quarters / platforms in the form'] = await ev(`!document.querySelector('[data-testid=contract-project]') && !document.querySelector('[data-testid=vars-posts]') && !document.querySelector('[data-testid=track-0-monthly]') && !document.querySelector('[data-testid=platform-Instagram]')`);
CHECKS['employment: the job is asked, with suggestions'] = await ev(`!!document.querySelector('[data-testid=contract-job]') && document.querySelectorAll('[data-testid=job-chip]').length >= 4`);
CHECKS['employment: the missing bar asks for the job first'] = (await text('[data-testid=missing-values]')).includes('الوظيفة');
await ev(`document.querySelector('[data-testid=job-chip]').click()`); await sleep(200);
CHECKS['employment: a suggestion fills the job'] = await ev(`document.querySelector('[data-testid=contract-job]').value === 'مصمم جرافيك'`);
// 2 Nov (Yousef: «أبي أقدر أضيف بنود»): add at the end, insert after a clause (renumbers the paper), move, delete
const paperT = () => text('[data-testid=contract-paper]');
await clickSel('[data-testid=section-add]'); await sleep(400);
const K1 = await ev(`[...document.querySelectorAll('[data-testid=section-editor][data-custom]')].pop()?.dataset.anchor?.slice(4)`);
CHECKS['clauses: a new clause is added and its title is focused'] = !!K1 && (await ev(`document.activeElement?.dataset?.testid`)) === `section-title-${K1}`;
await setT(`section-title-${K1}`, 'بند إضافي للاختبار'); await setT(`section-body-${K1}`, 'نص البند الإضافي.'); await sleep(300);
if (process.env.SHOT_DIR) { const r = await ev(`(()=>{const e=[...document.querySelectorAll('[data-testid=section-editor][data-custom]')].pop();e.scrollIntoView({block:'center'});const b=e.parentElement.getBoundingClientRect();return {x:b.x,y:b.y-60,w:b.width,h:b.height+120}})()`); await sleep(300); const img = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 2 } }); (await import('node:fs')).writeFileSync(`${process.env.SHOT_DIR}/clause-editor.png`, Buffer.from(img.result.data, 'base64')); }
CHECKS['clauses: it prints as clause 9 after the 8 template clauses'] = (await paperT()).includes('9. بند إضافي للاختبار');
// Codex check 2 Nov: a {word} with no field in this template ({التصاميم} in a «عقد عمل») is listed as a gap
await setT(`section-body-${K1}`, 'عدد التصاميم {التصاميم} شهرياً.'); await sleep(300);
await clickSel('[data-testid=sign-send]'); await sleep(400);
CHECKS['clauses: an unfilled {word} inside a clause is listed in the sign window'] = (await text('[data-testid=sign-gaps]')).includes('{التصاميم} في البند 9');
await ev(`document.querySelector('[data-testid=sign-dialog] button[aria-label="إلغاء"]')?.click()`); await sleep(300);
await setT(`section-body-${K1}`, 'نص البند الإضافي.'); await sleep(300);
await clickSel('[data-testid=section-add-after-2]'); await sleep(400);
const K2 = await ev(`[...document.querySelectorAll('[data-testid=section-editor][data-custom]')].map(x=>x.dataset.anchor.slice(4)).find(k=>k!==${JSON.stringify(K1)})`);
CHECKS['clauses: inserting after clause 2 renumbers the paper (old 3 → 4)'] = !!K2 && (await paperT()).includes('4. آلية احتساب المستحقات') && (await paperT()).includes('3. بند جديد');
await clickSel(`[data-testid=section-delete-${K2}]`); await sleep(150); await clickSel(`[data-testid=section-delete-confirm-${K2}]`); await sleep(300);
CHECKS['clauses: deleting asks once, then numbers come back'] = (await paperT()).includes('3. آلية احتساب المستحقات') && !(await paperT()).includes('بند جديد');
await clickSel(`[data-testid=section-up-${K1}]`); await sleep(300);
CHECKS['clauses: moving up swaps the numbers'] = (await paperT()).includes('8. بند إضافي للاختبار') && (await paperT()).includes('9. الموافقة');
await clickSel(`[data-testid=section-down-${K1}]`); await sleep(300);
CHECKS['clauses: template clauses cannot be deleted or moved'] = await ev(`!document.querySelector('[data-testid=section-delete-1]') && !document.querySelector('[data-testid=section-up-1]')`);
// 2 Nov: «وقّع وأرسل» opens even with empty fields — the sign window lists them and each one takes you to its field
CHECKS['editor: sign window opens with empty fields and lists them'] = await (async () => {
  await clickSel('[data-testid=sign-send]'); await sleep(400);
  return ev(`!!document.querySelector('[data-testid=sign-gaps]') && document.querySelector('[data-testid=sign-gaps]').innerText.includes('الهوية') && !document.querySelector('[data-testid=sign-confirm]')?.closest('form')?.querySelector('[data-testid=sign-gaps]')?.hidden`);
})();
CHECKS['…tapping an empty field closes the window and jumps to it'] = await (async () => {
  await ev(`[...document.querySelectorAll('[data-testid=sign-gap]')].find(b=>b.innerText.includes('الهوية')).click()`); await sleep(700);
  return ev(`!document.querySelector('[data-testid=sign-dialog]') && document.activeElement?.dataset?.testid === 'counterparty-nid'`);
})();
await fillMissing();
CHECKS['employment: nothing missing once filled'] = !(await ev(`!!document.querySelector('[data-testid=missing-values]')`));
const empPaper = await text('[data-testid=contract-paper]');
CHECKS['employment paper: «عقد عمل», job, term, clauses, pay by work'] = empPaper.includes('عقد عمل') && empPaper.includes('الوظيفة: مصمم جرافيك') && empPaper.includes('مدة العقد: غير محدد') && empPaper.includes('8. الموافقة') && empPaper.includes('حسب حجم العمل المنجز') && empPaper.includes('بيانات الحساب البنكي للموظف');
CHECKS['employment paper: no quarters, no Swift'] = !empPaper.includes('الربع الأول') && !empPaper.includes('Swift');
CHECKS['employment paper: nothing runs off a page'] = !(await ev(`!!document.querySelector('[data-testid=contract-paper] .paper-page[data-overflow]')`));
if (process.env.SHOT_DIR) { // optional: page images of the employment paper for a visual check
  await ev(`document.querySelector('[data-testid=open-paper-big]').click()`); await sleep(600);
  const n = await ev(`document.querySelectorAll('[data-testid=paper-big] .paper-page').length`);
  for (let i = 0; i < n; i++) {
    const r = await ev(`(()=>{const p=document.querySelectorAll('[data-testid=paper-big] .paper-page')[${i}];p.scrollIntoView();const b=p.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()`); await sleep(200);
    const img = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1.5 } });
    (await import('node:fs')).writeFileSync(`${process.env.SHOT_DIR}/emp-${i + 1}.png`, Buffer.from(img.result.data, 'base64'));
  }
  await ev(`document.querySelector('[data-testid=paper-big-close]').click()`); await sleep(300);
}
await setT('salary-monthly', '4500'); await sleep(200);
CHECKS['employment paper: a typed amount shows monthly'] = (await text('[data-testid=paper-salary]')).includes('4,500');
await clickSel('[data-testid=sign-send]'); CHECKS['creative contract signed + sent'] = await signFlow(); await toastHas('أُرسل'); await closeToast();
await waitFor(`!!document.querySelector('[data-testid=contract-sheet]')`);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
// the short (partnership) template stays covered on a client draft
await clickSel('[data-testid=new-contract]'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="عقد جديد"]')`);
await ev(`document.querySelector('[data-testid=contract-kind] [data-kind=short]').click()`); await sleep(100);
await click('إنشاء'); await waitFor(`!!document.querySelector('[data-testid=contract-editor]')`, 20000);
await setT('track-0-monthly', '3000'); await sleep(200);
// 2 Nov: the short contract gets «بنود إضافية» on their own page before the signatures
await clickSel('[data-testid=section-add]'); await sleep(400);
const KS = await ev(`[...document.querySelectorAll('[data-testid=section-editor][data-custom]')].pop()?.dataset.anchor?.slice(4)`);
await setT(`section-title-${KS}`, 'بند الملكية'); await setT(`section-body-${KS}`, 'تؤول ملكية التصاميم للعميل بعد السداد.'); await sleep(400);
CHECKS['short contract: «بنود إضافية» page before the signatures'] = (await text('[data-testid=contract-paper]')).includes('بنود إضافية') && (await text('[data-testid=contract-paper]')).includes('بند الملكية') && await ev(`(()=>{const ps=[...document.querySelectorAll('[data-testid=contract-paper] .paper-page')];const i=ps.findIndex(p=>p.innerText.includes('بند الملكية'));return i>0 && i<ps.length-1 && !!ps[ps.length-1].querySelector('[data-testid=paper-signatures]')})()`);
// Codex check 2 Nov: save WITH gaps → panel → «وقّع عن هوامش» → the window lists the gaps → a tap opens the editor ON it
await clickSel('[data-testid=save-version]'); await toastHas('انحفظت'); await closeToast();
await ev(`document.querySelector('[data-testid=contract-editor] button[aria-label="إلغاء"]')?.click()`); await sleep(700);
await clickSel('[data-testid=sign-hawamish]'); await sleep(400);
CHECKS['panel: sign window lists the empty fields'] = await ev(`document.querySelectorAll('[data-testid=sign-gap]').length > 0`);
await ev(`document.querySelector('[data-testid=sign-gap]').click()`); await sleep(1200);
CHECKS['…a tapped gap opens the editor ON that field'] = await ev(`!!document.querySelector('[data-testid=contract-editor]') && ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName) && !!document.activeElement?.dataset?.testid`);
await fillMissing();
CHECKS['short contract: nothing missing once its text words are filled'] = !(await ev(`!!document.querySelector('[data-testid=missing-values]')`));
CHECKS['short paper: track price + total'] = (await text('[data-testid=contract-paper]')).includes('3,000 ريال شهرياً') && (await text('[data-testid=contract-paper]')).includes('36,000');
await clickSel('[data-testid=save-version]'); await toastHas('انحفظت'); await closeToast();
await ev(`document.querySelector('[data-testid=contract-editor] button[aria-label="إلغاء"]')?.click()`); await sleep(600);
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]')?.click()`); await sleep(300);
// a second (draft) client contract + the block flag
await clickSel('[data-testid=new-contract]'); await waitFor(`!!document.querySelector('[role=dialog][aria-label="عقد جديد"]')`);
await click('إنشاء'); await waitFor(`!!document.querySelector('[data-testid=contract-editor]')`, 20000);
CHECKS['a NEW contract starts blank (no memory from other contracts)'] = (await ev(`document.querySelectorAll('[data-testid=recall]').length`)) === 0;
// 2 Nov: a 15th clause on the full template — numbered «15», signatures still close the LAST page, nothing overflows
await clickSel('[data-testid=section-add]'); await sleep(400);
const K15 = await ev(`[...document.querySelectorAll('[data-testid=section-editor][data-custom]')].pop()?.dataset.anchor?.slice(4)`);
await setT(`section-title-${K15}`, 'بند الضمان الإضافي'); await setT(`section-body-${K15}`, 'نص بند الضمان.'); await sleep(400);
CHECKS['full template: added clause prints as 15 and the signatures stay on the last page'] = (await text('[data-testid=contract-paper]')).includes('بند الضمان الإضافي') && await ev(`(()=>{const ps=[...document.querySelectorAll('[data-testid=contract-paper] .paper-page')];return !!ps[ps.length-1].querySelector('[data-testid=paper-signatures]') && ps.slice(0,-1).every(p=>!p.querySelector('[data-testid=paper-signatures]')) && !ps.some(p=>p.hasAttribute('data-overflow'))})()`) && await ev(`[...document.querySelectorAll('[data-testid=contract-paper] .paper-num')].some(x=>x.textContent.trim()==='15')`);
await clickSel(`[data-testid=section-delete-${K15}]`); await sleep(150); await clickSel(`[data-testid=section-delete-confirm-${K15}]`); await sleep(300);
// council 1 Nov: a version whose text runs past a page can be SAVED but never signed or sent — editor AND sheet
await setT('pricing-monthly', '3000'); await setT('pricing-months', '3'); await sleep(200);
await ev(`document.querySelector('[data-anchor="sec:05"] button[title]').click()`); await sleep(150);
await setInput(`document.querySelector('[data-anchor="sec:05"] textarea')`, 'نص طويل يتجاوز الصفحة. '.repeat(500)); await sleep(500);
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false}); await sleep(700);
await setInput(`document.querySelector('[data-anchor="sec:05"] textarea')`, 'نص طويل يتجاوز الصفحة. '.repeat(501)); await sleep(500);
CHECKS['narrow screen, form tab open: overflow still blocks «وقّع وأرسل» (paper measured while hidden)'] = await ev(`!!document.querySelector('[data-testid=overflow-warning]') && document.querySelector('[data-testid=sign-send]').disabled === true`);
await send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false}); await sleep(700);
CHECKS['editor: overflow disables «وقّع وأرسل»'] = await ev(`!!document.querySelector('[data-testid=overflow-warning]') && document.querySelector('[data-testid=sign-send]').disabled === true`);
await clickSel('[data-testid=save-version]'); await toastHas('انحفظت النسخة 1'); await closeToast();
await ev(`document.querySelector('[data-testid=contract-editor] button[aria-label="إلغاء"]').click()`); await sleep(600);
CHECKS['sheet: overflow blocks Hawamish signing (second send path)'] = await waitFor(`!!document.querySelector('[data-testid=sheet-overflow-block]') && document.querySelector('[data-testid=sign-hawamish]')?.disabled === true`, 5000).then(()=>true).catch(()=>false);
// 2 Nov (council 🔴): an INCOMPLETE saved version can't be signed/sent from the panel either — it says what is missing
// 2 Nov (Yousef): empty fields WARN (named, tap to complete) but signing stays possible — only the core blocks
CHECKS['sheet: empty fields are named and say you can still sign'] = await ev(`!!document.querySelector('[data-testid=sheet-missing-block]') && document.querySelector('[data-testid=sheet-missing-block]').innerText.includes('فاضية') && document.querySelector('[data-testid=sheet-missing-block]').innerText.includes('على أي حال')`);
// 1 Nov: «احظر العميل حتى التوقيع» removed at Yousef's request
CHECKS['no «block the client» option anymore'] = !(await ev(`!!document.querySelector('[data-testid=contract-block]')`));
await ev(`document.querySelector('[data-testid=contract-sheet] button[aria-label="إلغاء"]').click()`); await sleep(300);
CHECKS['admin: every contract in exactly ONE tab; the ended one only in «المنتهية»'] = await (async () => {
  const ids = []; for (const n of ['قيد الإعداد', 'السارية', 'المنتهية']) { await tab(n); ids.push(...(await ev(`[...document.querySelectorAll('[data-testid=contract-card]')].map(c=>c.dataset.status)`))); }
  await tab('المنتهية'); const ended = await ev(`[...document.querySelectorAll('[data-testid=contract-card]')].map(c=>c.dataset.status)`); await tab('قيد الإعداد');
  return ids.length === 4 && ids.filter((x) => x === 'completed').length === 1 && ended.length === 1 && ended[0] === 'completed' })();
// his rule (2 Nov): term = contract DATE + months; ran out + 14 days without a renewal → «المنتهية»; renewed → «تجدّد»
CHECKS['term + 14-day renewal rule'] = await ev(`(async()=>{const m=await import('/src/lib/contracts.ts');
  const content={kind:'full',date:'2025-01-10',pricing:{mode:'monthly',months:12},tracks:[]};
  const c={id:'a',number:2601,status:'signed',clientId:'k'};
  const at=(d,all=[c])=>m.contractPlace(c,content,all,d);
  const r1=at('2026-01-10'), r2=at('2026-01-15'), r3=at('2026-01-25'), r4=at('2026-01-24');
  const ren=at('2026-01-12',[c,{id:'b',number:2650,status:'signed',clientId:'k'}]);
  const none=m.contractPlace(c,{...content,pricing:{mode:'project',months:0}},[c],'2030-01-01');
  const emp=m.contractTermMonths({kind:'employment',term:'6 أشهر',pricing:{}});
  return m.contractEndDate(content)==='2026-01-10' && r1.stage==='active' && r1.graceLeft===undefined && r2.stage==='active' && r2.graceLeft===9
    && r4.stage==='active' && r4.graceLeft===0 && r3.stage==='ended' && r3.reason==='expired' && ren.stage==='ended' && ren.reason==='renewed'
    && none.stage==='active' && emp===6})()`);
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
// client: never blocked (option removed) + the unsent draft is invisible
await click('ادخل كعميل'); await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='العقود')`, 20000); await sleep(400);
CHECKS['client is never blocked'] = !(await ev(`!!document.querySelector('[data-testid=contract-blocked]')`));
await click('العقود'); await waitFor(`!!document.querySelector('[data-testid=contracts-board]')`);
await tab('المنتهية'); // the client's contract ended → «المنتهية» (2 Nov: one place per contract)
CHECKS['client never sees the unsent draft'] = (await ev(`document.querySelectorAll('[data-testid=contract-card]').length`)) === 1;
// 1 Nov (his phone): every bottom tab opens ITS own section, labelled, with no second tab bar inside the panel
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true}); await sleep(700);
const sec = async (id) => { await ev(`document.querySelector('[data-testid=nav-${id}]').click()`); await sleep(350); return ev(`(()=>{const a=document.querySelector('aside');return a?a.innerText.slice(0,400):''})()`); };
const sMain = await sec('main'), sMsg = await sec('messages'), sAlert = await sec('alerts'), sSet = await sec('settings');
CHECKS['phone: messages is its own section'] = await (async () => { await sec('messages'); return ev(`!!document.querySelector('aside [placeholder*="رسالة"]') && !document.querySelector('aside').innerText.includes('تقدم المشاريع')`); })();
CHECKS['phone: progress has no chat in it'] = await (async () => { await sec('main'); return ev(`document.querySelector('aside').innerText.includes('تقدم المشاريع') && !document.querySelector('aside [placeholder*="رسالة"]')`); })();
CHECKS['phone: alerts and settings differ from progress'] = sAlert !== sMain && sSet !== sMain && sMsg !== sMain;
CHECKS['client alerts never show a creative\'s «عقد عمل»'] = await (async () => { await sec('alerts'); return ev(`![...document.querySelectorAll('[data-testid=activity-item]')].some(x=>x.innerText.includes('عقد عمل'))`) })();
CHECKS['phone: bottom tabs carry names'] = (await text('[data-testid=nav-messages]')).includes('الرسائل') && (await text('[data-testid=nav-alerts]')).includes('التنبيهات');
if (process.env.SHOT_DIR) for (const id of ['main', 'messages', 'alerts']) { // optional phone images for a visual check
  await ev(`document.querySelector('[data-testid=nav-${id}]').click()`); await sleep(500);
  const img = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(`${process.env.SHOT_DIR}/phone-client-${id}.png`, Buffer.from(img.result.data, 'base64'));
}
await ev(`document.querySelector('[data-testid=nav-main]').click()`); await sleep(200);
await send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false}); await sleep(600);
// reload: persisted
await send('Page.reload'); await sleep(1500); await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='العقود')`, 20000);
await click('العقود'); await sleep(300); await tab('المنتهية'); await waitFor(`!!document.querySelector('[data-testid=contract-card]')`);
CHECKS['persisted after reload'] = await ev(`document.querySelector('[data-testid=contract-card]').dataset.status === 'completed'`);

CHECKS['no console errors'] = errors.length === 0;

ws.close(); chrome.kill(); try{fs.rmSync(`${PROFILE}`,{recursive:true,force:true});}catch{}
console.log(JSON.stringify({...CHECKS, errors}, null, 1));
const failed = Object.entries(CHECKS).filter(([, ok]) => !ok).map(([c]) => c)
if (failed.length) { console.error('FAILED:', failed); process.exit(1) }
console.log('PASS smoke-contracts.mjs')
