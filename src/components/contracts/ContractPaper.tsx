import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { deepLatin } from '@/lib/latinDigits'
import { SHORT_FOOTNOTE, agreementDateLine, contractTotal, currencyShort, fillText, fmtAmount, secKey, signDate } from '@/lib/contracts'
import type { ContractContent, ContractPartyInfo, ContractVersion } from '@/types'

/**
 * The contract as paper — the manager's Figma anatomy: cover in the client's colour with the ✱ mark and the
 * client name, «هوامش ✱» header + bilingual copyright footer on every page, accent title bar with the draft
 * number, Hijri + Gregorian date line, two-column parties, numbered section bars over grey boxes, bank block,
 * signature block with the stamp boxes. Pages are A4 (210 × 297 mm) and print as-is (@media print in index.css).
 */

type Signer = { name: string; cap: string; at?: string }

/** Pages whose text runs past the bottom (the page clips it): page number + the clauses on it. */
export type PaperOverflow = { page: number; sections: string[] }

// The big paper (1 Nov, his pick ⭐٥): every part can be tapped to open its editor beside the paper. Without onPick the
// wrapper is display:contents, so the printed/normal paper lays out exactly as before.
const PickCtx = createContext<{ onPick?: (id: string) => void; active?: string | null }>({})
function Pick({ id, children }: { id: string; children: React.ReactNode }) {
  const { onPick, active } = useContext(PickCtx)
  if (!onPick) return <div className="paper-pick-static" data-pick={id}>{children}</div>
  return (
    <div
      role="button"
      tabIndex={0}
      data-pick={id}
      className={cn('paper-pick', active === id && 'paper-pick-active')}
      onClick={(e) => {
        e.stopPropagation()
        onPick(id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPick(id)
        }
      }}
    >
      {children}
    </div>
  )
}
const Page = ({ c, children, cover }: { c: ContractContent; children: React.ReactNode; cover?: boolean }) => (
  <section className={cn('paper-page', cover && 'paper-cover')} style={{ ['--accent' as string]: c.accent }}>
    {!cover && <div className="paper-head"><Wordmark /></div>}
    <div className="paper-body">{children}</div>
    <div className="paper-foot" dir="ltr">
      <span>All rights reserved to Howamesh Co. {c.copyrightYear} H</span>
      <span dir="rtl">جميع الحقوق محفوظة لشركة نموذج هوامش {c.copyrightYear}هـ</span>
    </div>
  </section>
)
const Bar = ({ num, title, sub }: { num?: string; title: string; sub?: string }) => (
  <div className="paper-bar">
    {num && <span className="paper-num">{num}</span>}
    <span>{title}</span>
    {sub && <span className="paper-bar-sub" dir="ltr">{sub}</span>}
  </div>
)
const Box = ({ c, text, className }: { c: ContractContent; text: string; className?: string }) => (
  <div className={cn('paper-box', className)}>
    {fillText(text, c).split('\n').map((line, i) => (
      <p key={i} className={cn(/^(\d+\/|أولاً|ثانياً|ثالثاً|وتشمل|ولا تشمل)/.test(line.trim()) && 'paper-item')}>
        {line}
      </p>
    ))}
  </div>
)
/** A clause of the full template: numbered bar + grey box; the pricing clause (key 04) opens the pricing editor. */
const FullClause = ({ c, s }: { c: ContractContent; s: ContractContent['sections'][number] }) => (
  <Pick id={secKey(s) === '04' ? 'pricing' : `sec:${secKey(s)}`}><Bar num={s.num} title={s.title} /><Box c={c} text={s.body} /></Pick>
)
/** Short contract / offer: the clauses the team added, on their own pages (3 per page) before the signatures. */
const ExtraClauses = ({ c }: { c: ContractContent }) => (
  <>
    {chunk(c.sections, Array(40).fill(3)).map((group, i) => (
      <Page key={`extra-${i}`} c={c}>
        {i === 0 && <Bar title="بنود إضافية" sub="Additional clauses" />}
        {group.map((s) => <FullClause key={secKey(s)} c={c} s={s} />)}
      </Page>
    ))}
  </>
)
/** «عقد عمل» clauses: one grey box, «1. طبيعة العمل» bold heads (the Figma look), each tappable on the big paper */
const Clauses = ({ c, list }: { c: ContractContent; list: ContractContent['sections'] }) => (
  <div className="paper-box paper-clauses">
    {list.map((s) => (
      <Pick key={secKey(s)} id={`sec:${secKey(s)}`}>
        <div className="paper-clause">
          <p className="paper-clause-title">{s.num}. {s.title}</p>
          {fillText(s.body, c).split('\n').map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </Pick>
    ))}
  </div>
)
const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="paper-row">
    <span className="paper-row-label">{label}</span>
    <span className="paper-row-value" dir="auto">{value || '…'}</span>
  </div>
)
const Party = ({ p, title, full }: { p: ContractPartyInfo; title: string; full: boolean }) => (
  <div className="paper-party">
    <div className="paper-row paper-row-head">{title}</div>
    <div className="paper-row paper-row-center">{p.name || '…'}</div>
    <div className="paper-row paper-row-center" dir="rtl">
      {/* a person has no CR: print the ID instead of «########» (1 Nov) */}
      <span>{p.cr ? `س.ت: ${p.cr}` : p.nationalId ? `الهوية: ${p.nationalId}` : 'س.ت: ########'}</span>
      <span className="mx-2">{p.country}</span>
    </div>
    {full && <div className="paper-row paper-row-center">{p.city || '…'}</div>}
    <div className="paper-row paper-row-center">{p.repTitle || '…'}</div>
    {full ? <div className="paper-row paper-row-center">{p.repName || '…'}</div> : <Row label={p.repTitle || 'الممثل'} value={p.repName} />}
    <Row label="رقم التواصل" value={p.phone} />
    <Row label="ايميل التواصل" value={p.email} />
    {full && <Row label="الهوية الوطنية" value={p.nationalId} />}
  </div>
)
const SignBlock = ({ c, first, second, firstSig, secondSig, firstSigner, secondSigner, hawamishIsFirst, stamp, employee }: { c: ContractContent; first: ContractPartyInfo; second: ContractPartyInfo; firstSig?: string; secondSig?: string; firstSigner: Signer; secondSigner: Signer; hawamishIsFirst: boolean; stamp?: string; employee?: boolean }) => (
  <>
    <Pick id="bank">
    <Bar title={employee ? 'بيانات الحساب البنكي للموظف' : 'بيانات الحساب البنكي'} />
    <div className={employee ? undefined : 'paper-cols'}>
      <div className="paper-party">
        <Row label="صاحب الحساب" value={c.bank.owner} />
        <Row label="رقم الحساب" value={c.bank.account} />
        <Row label="الآيبان (IBAN)" value={c.bank.iban} />
        {!employee && <Row label="Swift Code" value={c.bank.swift} />}
      </div>
    </div>
    </Pick>
    <Pick id="signers">
    <div className="paper-cols paper-sign" data-testid="paper-signatures">
      {[{ title: 'الطرف الأول', p: first, sig: firstSig, s: firstSigner, stampHere: hawamishIsFirst }, { title: 'الطرف الثاني', p: second, sig: secondSig, s: secondSigner, stampHere: !hawamishIsFirst }].map((col) => (
        <div key={col.title} className="paper-party">
          <div className="paper-row paper-row-head">{col.title}</div>
          <div className="paper-row paper-row-center">{col.p.name || '…'}</div>
          <Row label="الاسم:" value={col.s.name} />
          <Row label="الصفة:" value={col.s.cap} />
          <Row label="التاريخ:" value={col.s.at ? signDate(col.s.at) : signDate(c.date)} />
          <div className="paper-stamp">
            <span className="paper-stamp-label">الختم الرسمي</span>
            {col.stampHere && stamp && <img src={stamp} alt="" className="paper-stamp-img" />}
            {col.sig && <img src={col.sig} alt="" className="paper-sig-img" data-testid="paper-signature" />}
          </div>
        </div>
      ))}
    </div>
    </Pick>
  </>
)

export function ContractPaper({ content, version, number, stamp: stampProp, className, scale, onPick, active, onOverflow }: { content: ContractContent; version?: ContractVersion; number: number; stamp?: string; className?: string; scale?: number; onPick?: (id: string) => void; active?: string | null; onOverflow?: (pages: PaperOverflow[]) => void }) {
  // digits typed in Arabic before the «كل الأرقام إنجليزي» rule still show in English on the paper (display only)
  const c = useMemo(() => deepLatin(content), [content])
  const first = c.counterpartySide === 'first' ? c.counterparty : c.hawamish
  const second = c.counterpartySide === 'first' ? c.hawamish : c.counterparty
  const firstSig = c.counterpartySide === 'first' ? version?.signature : version?.firstSignature
  const secondSig = c.counterpartySide === 'first' ? version?.firstSignature : version?.signature
  const firstSigner = c.counterpartySide === 'first' ? { name: version?.signerName ?? c.signers.counterparty.name, cap: version?.signerCapacity ?? c.signers.counterparty.capacity, at: version?.decidedAt } : { name: version?.firstSigner ?? c.signers.hawamish.name, cap: version?.firstCapacity ?? c.signers.hawamish.capacity, at: version?.firstSignedAt }
  const secondSigner = c.counterpartySide === 'first' ? { name: version?.firstSigner ?? c.signers.hawamish.name, cap: version?.firstCapacity ?? c.signers.hawamish.capacity, at: version?.firstSignedAt } : { name: version?.signerName ?? c.signers.counterparty.name, cap: version?.signerCapacity ?? c.signers.counterparty.capacity, at: version?.decidedAt }
  const hawamishIsFirst = c.counterpartySide !== 'first'
  // a frozen version shows ONLY the stamp it was frozen with — never today's Settings stamp (council 1 Nov)
  const stamp = version ? c.stamp : c.stamp || stampProp
  const emp = c.kind === 'employment'
  const draftLabel = c.kind === 'offer' ? `عرض #${number}` : emp ? `عقد ${number}/${(c.date || '').slice(0, 4) || '…'}` : `مسودة #${number}`
  const cur = currencyShort(c.pricing.currency)
  // a page is fixed A4 and clips what does not fit: measure after every render, flag the page (screen only, never printed)
  const root = useRef<HTMLDivElement>(null)
  const lastOverflow = useRef('')
  const lastReporter = useRef<typeof onOverflow>(undefined)
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const over: PaperOverflow[] = []
    el.querySelectorAll<HTMLElement>(':scope > .paper-page').forEach((page, i) => {
      // the body stretches with its content (flex), so compare where the text ENDS with where the footer starts —
      // in layout units (offsetTop/Height, relative to the page), which CSS zoom does not distort like client rects
      const body = page.querySelector<HTMLElement>('.paper-body')
      const foot = page.querySelector<HTMLElement>('.paper-foot')
      const end = body ? contentBottom(body) : 0
      // (the cover is laid out to sit right on the footer by design — never flagged; a hidden paper measures 0)
      const o = !page.classList.contains('paper-cover') && !!foot && foot.offsetTop > 0 && end > foot.offsetTop + 1
      page.toggleAttribute('data-overflow', o)
      if (o) over.push({ page: i + 1, sections: [...page.querySelectorAll<HTMLElement>('[data-pick^="sec:"]')].map((x) => x.dataset.pick!.slice(4)) })
    })
    const key = JSON.stringify(over)
    // report on a change — or when this paper becomes the reporting one (the small preview hands over to the big paper)
    if (key !== lastOverflow.current || lastReporter.current !== onOverflow) {
      lastOverflow.current = key
      lastReporter.current = onOverflow
      onOverflow?.(over)
    }
  })

  return (
    <PickCtx.Provider value={{ onPick, active }}>
    <div ref={root} className={cn('paper', onPick && 'paper-picking', className)} dir="rtl" style={scale ? { zoom: scale } : undefined} data-testid="contract-paper">
      {/* ---- cover ---- */}
      <Page c={c} cover>
        <div className="paper-cover-card">
          <Star className="paper-cover-star" />
          <div className="paper-cover-name" dir="auto">{emp ? 'عقد عمل' : c.counterparty.name || '…'}</div>
        </div>
        <div className="paper-cover-rule" />
        <div className="paper-cover-title">{emp ? c.counterparty.name || '…' : `(*) ${c.title}`}</div>
      </Page>

      {c.kind === 'short' && (
        <>
          <Page c={c}>
            <Bar title={c.title} sub={draftLabel} />
            <div className="paper-row paper-row-split"><span>الشريك</span><span dir="auto">{c.counterparty.name || '…'}</span></div>
            <Pick id="parties">
            <div className="paper-cols">
              <Party p={first} title="الطرف الأول" full={false} />
              <Party p={second} title="الطرف الثاني" full={false} />
            </div>
            </Pick>
            <div className="paper-row paper-row-split"><span dir="auto">{c.project || '…'}</span><span>مدة العقد : {c.tracks[0]?.months || '…'} شهر</span></div>
            <Pick id="scope">
            <Bar title="نطاق العمل" sub="Scope of work" />
            <Box c={c} text={c.scope} className="paper-box-tall" />
            </Pick>
          </Page>
          <Page c={c}>
            {c.tracks.map((t, k) => (
              <Pick key={k} id="tracks">
                <Bar title={t.name} sub={t.nameEn} />
                <div className="paper-months" dir="rtl">
                  {Array.from({ length: 13 }, (_, i) => (((Number.isNaN(new Date(c.date).getMonth()) ? 0 : new Date(c.date).getMonth()) + i) % 12) + 1).map((m, i) => (
                    <span key={i} className="paper-month"><b>{m}</b><small>شهر</small></span>
                  ))}
                </div>
                <div className="paper-quarters">
                  {['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'].map((q, i) => (
                    <div key={q} className="paper-quarter">
                      <div className="paper-row paper-row-center paper-row-dark">{q}</div>
                      <div className="paper-row paper-row-center paper-row-light">{t.quarters[i] || '…'}</div>
                    </div>
                  ))}
                </div>
              </Pick>
            ))}
          </Page>
          <ExtraClauses c={c} />
          <Page c={c}>
            <Bar title={draftLabel} />
            <div className="paper-row paper-row-split"><span>الشريك</span><span dir="auto">{c.counterparty.name || '…'}</span></div>
<Pick id="tracks">
            {c.tracks.map((t, k) => (
              <div key={k} className="paper-row paper-row-split">
                <span>{t.name}</span>
                <span>مدة العقد : {t.months || '…'} شهر · {t.monthly ? fmtAmount(t.monthly) : '…'} {cur} شهرياً</span>
              </div>
            ))}
            <div className="paper-note">{fillText(SHORT_FOOTNOTE, c)}</div>
            <div className="paper-row paper-row-split"><span>الإجمالي</span><span>{contractTotal(c) ? fmtAmount(contractTotal(c)) : '…'} {cur}</span></div>
            </Pick>
            <SignBlock c={c} first={first} second={second} firstSig={firstSig} secondSig={secondSig} firstSigner={firstSigner} secondSigner={secondSigner} hawamishIsFirst={hawamishIsFirst} stamp={stamp} />
          </Page>
        </>
      )}

      {c.kind === 'full' && (
        <>
          <Page c={c}>
            <Bar title={c.title} sub={draftLabel} />
            <div className="paper-row paper-row-split paper-row-accent"><span>تم الاتفاق بين كلٍ من</span><span>{agreementDateLine(c.date)}</span></div>
            <Pick id="parties">
            <div className="paper-cols">
              <Party p={first} title="الطرف الأول" full />
              <Party p={second} title="الطرف الثاني" full />
            </div>
            </Pick>
            {c.sections.slice(0, 1).map((s) => <FullClause key={secKey(s)} c={c} s={s} />)}
          </Page>
          {/* the manager's page rhythm for the 14 template clauses; clauses the team adds continue 2 per page and the
              signatures always close the LAST page (alone on a new page when that page already holds 2 clauses) */}
          {(() => {
            const groups = chunk(c.sections.slice(1), [2, 3, 2, 3, 2, 1, ...Array(40).fill(2)])
            const signAlone = groups.length > 0 && groups[groups.length - 1].length > 1
            const sign = <SignBlock c={c} first={first} second={second} firstSig={firstSig} secondSig={secondSig} firstSigner={firstSigner} secondSigner={secondSigner} hawamishIsFirst={hawamishIsFirst} stamp={stamp} />
            return (
              <>
                {groups.map((group, i) => (
                  <Page key={i} c={c}>
                    {group.map((s) => <FullClause key={secKey(s)} c={c} s={s} />)}
                    {i === groups.length - 1 && !signAlone && sign}
                  </Page>
                ))}
                {(signAlone || groups.length === 0) && <Page c={c}>{sign}</Page>}
              </>
            )
          })()}
        </>
      )}

      {c.kind === 'employment' && (
        <>
          <Page c={c}>
            <div className="paper-row paper-row-split paper-row-light"><span>{c.title || 'عقد عمل'}</span><span>{draftLabel}</span></div>
            <Pick id="parties">
            <div className="paper-row paper-row-split paper-row-dark"><span>الموظف</span><span dir="auto">{c.counterparty.name || '…'}</span></div>
            <div className="paper-cols">
              <div className="paper-party">
                <Row label="ممثل هوامش" value={c.hawamish.repName} />
                <Row label="رقم التواصل" value={c.hawamish.phone} />
                <Row label="ايميل التواصل" value={c.hawamish.email} />
              </div>
              <div className="paper-party">
                <Row label="الموظف" value={c.counterparty.name} />
                <Row label="رقم التواصل" value={c.counterparty.phone} />
                <Row label="ايميل التواصل" value={c.counterparty.email} />
              </div>
            </div>
            </Pick>
            <Pick id="basics">
            <div className="paper-row paper-row-split"><span>الوظيفة: {c.jobTitle || '…'}</span><span>مدة العقد: {c.term || '…'}</span></div>
            </Pick>
            <Pick id="parties">
            <div className="paper-cols">
              {[{ t: 'الطرف الأول', p: c.hawamish, id: c.hawamish.cr ? `س.ت: ${c.hawamish.cr}` : 'س.ت: …' }, { t: 'الطرف الثاني', p: c.counterparty, id: `هوية رقم: ${c.counterparty.nationalId || '…'}` }].map((x) => (
                <div key={x.t} className="paper-party">
                  <div className="paper-row paper-row-head">{x.t}</div>
                  <div className="paper-row paper-row-center"><b>{x.p.name || '…'}</b></div>
                  <div className="paper-row paper-row-center" dir="rtl"><b>{x.p.country}</b><span className="mx-2">{x.id}</span></div>
                </div>
              ))}
            </div>
            </Pick>
            <Bar title="بنود العقد" sub="Contract Clauses" />
            <Clauses c={c} list={c.sections.slice(0, 3)} />
          </Page>
          {/* clauses 4–8 on page 2 like the Figma; clauses the team adds continue 5 per page */}
          {chunk(c.sections.slice(3), [5, ...Array(40).fill(5)]).map((group, i) => (
            <Page key={`emp-${i}`} c={c}>
              <Bar title="بنود العقد" sub="Contract Clauses" />
              <Clauses c={c} list={group} />
            </Page>
          ))}
          <Page c={c}>
            <div className="paper-row paper-row-center paper-row-light">{draftLabel}</div>
            <div className="paper-row paper-row-split paper-row-dark"><span>الموظف</span><span dir="auto">{c.counterparty.name || '…'}</span></div>
            <Pick id="salary">
            <div className="paper-row paper-row-split" data-testid="paper-salary"><span>{c.jobTitle || '…'}</span><span>{c.pricing.monthly > 0 ? `${fmtAmount(c.pricing.monthly)} ${cur} شهرياً` : 'حسب حجم العمل المنجز'}</span></div>
            </Pick>
            <SignBlock c={c} first={first} second={second} firstSig={firstSig} secondSig={secondSig} firstSigner={firstSigner} secondSigner={secondSigner} hawamishIsFirst={hawamishIsFirst} stamp={stamp} employee />
          </Page>
        </>
      )}
      {c.kind === 'offer' && (
        <>
          <Page c={c}>
            <Bar title={`(*) ${c.title}`} sub={draftLabel} />
            <div className="paper-row paper-row-split paper-row-accent"><span>تم إنشاء العرض</span><span>{agreementDateLine(c.date)}</span></div>
            <Pick id="parties">
            <div className="paper-cols">
              <Party p={first} title="الطرف الأول" full />
              <Party p={second} title="الطرف الثاني" full />
            </div>
            </Pick>
            <Pick id="scope">
            <Bar num="01" title="تمهيد" />
            <Box c={c} text={c.scope} />
            </Pick>
          </Page>
          <Page c={c}>
            <Pick id="packages">
            <Bar num="02" title={c.project || 'الباقات'} />
            <div className="paper-packages">
              {c.packages.map((p, k) => (
                <div key={k} className="paper-package">
                  <div className="paper-row paper-row-split paper-row-dark"><span>{p.name}</span><span dir="auto">{p.subtitle}</span></div>
                  <ul className="paper-package-items">
                    {p.items.map((it, j) => <li key={j}>{it}</li>)}
                  </ul>
                  <div className="paper-row paper-row-center paper-row-dark">{p.price ? fmtAmount(p.price) : '…'} {cur}{p.per === 'month' ? ' / شهرياً' : ''}</div>
                </div>
              ))}
            </div>
            </Pick>
            {c.unitName && (
              <>
                <Bar num="03" title={c.unitName} />
                <div className="paper-row paper-row-split paper-row-dark"><span>{c.unitName}</span><span>{c.unitPrice ? fmtAmount(c.unitPrice) : '…'} {cur}</span></div>
                <ul className="paper-package-items paper-box">
                  {c.unitItems.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              </>
            )}
          </Page>
          <ExtraClauses c={c} />
          <Page c={c}>
            <SignBlock c={c} first={first} second={second} firstSig={firstSig} secondSig={secondSig} firstSigner={firstSigner} secondSigner={secondSigner} hawamishIsFirst={hawamishIsFirst} stamp={stamp} />
          </Page>
        </>
      )}
    </div>
    </PickCtx.Provider>
  )
}

/** Lowest edge of the content inside a page body, in page layout units (looks through display:contents wrappers). */
function contentBottom(el: HTMLElement): number {
  let max = 0
  for (const child of el.children) {
    const x = child as HTMLElement
    if (getComputedStyle(x).display === 'contents') max = Math.max(max, contentBottom(x))
    else max = Math.max(max, x.offsetTop + x.offsetHeight)
  }
  return max
}

function chunk<T>(items: T[], sizes: number[]): T[][] {
  const out: T[][] = []
  let i = 0
  for (const n of sizes) {
    if (i >= items.length) break
    out.push(items.slice(i, i + n))
    i += n
  }
  // past the given sizes, keep the LAST size (council 2 Nov: never pile the rest onto one page)
  const last = sizes[sizes.length - 1] || items.length
  while (i < items.length) {
    out.push(items.slice(i, i + last))
    i += last
  }
  return out
}

export function Wordmark() {
  return (
    <span className="paper-wordmark" dir="rtl">
      هوامش <Star className="paper-wordmark-star" />
    </span>
  )
}
/** The ✱ mark of the brand (no official logo file in the repo: drawn as a six-ray asterisk). */
export function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {[0, 60, 120].map((a) => (
        <rect key={a} x="44" y="6" width="12" height="88" rx="6" fill="currentColor" transform={`rotate(${a} 50 50)`} />
      ))}
    </svg>
  )
}
