import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { SHORT_FOOTNOTE, agreementDateLine, contractTotal, currencyShort, fillText, fmtAmount, signDate } from '@/lib/contracts'
import type { ContractContent, ContractPartyInfo, ContractVersion } from '@/types'

/**
 * The contract as paper — the manager's Figma anatomy: cover in the client's colour with the ✱ mark and the
 * client name, «هوامش ✱» header + bilingual copyright footer on every page, accent title bar with the draft
 * number, Hijri + Gregorian date line, two-column parties, numbered section bars over grey boxes, bank block,
 * signature block with the stamp boxes. Pages are A4 (210 × 297 mm) and print as-is (@media print in index.css).
 */

type Signer = { name: string; cap: string; at?: string }
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
      <span>س.ت: {p.cr || '########'}</span>
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
const SignBlock = ({ c, first, second, firstSig, secondSig, firstSigner, secondSigner, hawamishIsFirst, stamp }: { c: ContractContent; first: ContractPartyInfo; second: ContractPartyInfo; firstSig?: string; secondSig?: string; firstSigner: Signer; secondSigner: Signer; hawamishIsFirst: boolean; stamp?: string }) => (
  <>
    <Bar title="بيانات الحساب البنكي" />
    <div className="paper-cols">
      <div className="paper-party">
        <Row label="صاحب الحساب" value={c.bank.owner} />
        <Row label="رقم الحساب" value={c.bank.account} />
        <Row label="الآيبان (IBAN)" value={c.bank.iban} />
        <Row label="Swift Code" value={c.bank.swift} />
      </div>
    </div>
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
  </>
)

export function ContractPaper({ content: c, version, number, stamp: stampProp, className, scale }: { content: ContractContent; version?: ContractVersion; number: number; stamp?: string; className?: string; scale?: number }) {
  const first = c.counterpartySide === 'first' ? c.counterparty : c.hawamish
  const second = c.counterpartySide === 'first' ? c.hawamish : c.counterparty
  const firstSig = c.counterpartySide === 'first' ? version?.signature : version?.firstSignature
  const secondSig = c.counterpartySide === 'first' ? version?.firstSignature : version?.signature
  const firstSigner = c.counterpartySide === 'first' ? { name: version?.signerName ?? c.signers.counterparty.name, cap: version?.signerCapacity ?? c.signers.counterparty.capacity, at: version?.decidedAt } : { name: version?.firstSigner ?? c.signers.hawamish.name, cap: version?.firstCapacity ?? c.signers.hawamish.capacity, at: version?.firstSignedAt }
  const secondSigner = c.counterpartySide === 'first' ? { name: version?.firstSigner ?? c.signers.hawamish.name, cap: version?.firstCapacity ?? c.signers.hawamish.capacity, at: version?.firstSignedAt } : { name: version?.signerName ?? c.signers.counterparty.name, cap: version?.signerCapacity ?? c.signers.counterparty.capacity, at: version?.decidedAt }
  const hawamishIsFirst = c.counterpartySide !== 'first'
  const stamp = c.stamp || stampProp
  const draftLabel = c.kind === 'offer' ? `عرض #${number}` : `مسودة #${number}`
  const cur = currencyShort(c.pricing.currency)

  return (
    <div className={cn('paper', className)} dir="rtl" style={scale ? { zoom: scale } : undefined} data-testid="contract-paper">
      {/* ---- cover ---- */}
      <Page c={c} cover>
        <div className="paper-cover-card">
          <Star className="paper-cover-star" />
          <div className="paper-cover-name" dir="auto">{c.counterparty.name || '…'}</div>
        </div>
        <div className="paper-cover-rule" />
        <div className="paper-cover-title">(*) {c.title}</div>
      </Page>

      {c.kind === 'short' && (
        <>
          <Page c={c}>
            <Bar title={c.title} sub={draftLabel} />
            <div className="paper-row paper-row-split"><span>الشريك</span><span dir="auto">{c.counterparty.name || '…'}</span></div>
            <div className="paper-cols">
              <Party p={first} title="الطرف الأول" full={false} />
              <Party p={second} title="الطرف الثاني" full={false} />
            </div>
            <div className="paper-row paper-row-split"><span dir="auto">{c.project || '…'}</span><span>مدة العقد : {c.tracks[0]?.months || '…'} شهر</span></div>
            <Bar title="نطاق العمل" sub="Scope of work" />
            <Box c={c} text={c.scope} className="paper-box-tall" />
          </Page>
          <Page c={c}>
            {c.tracks.map((t, k) => (
              <Fragment key={k}>
                <Bar title={t.name} sub={t.nameEn} />
                <div className="paper-months" dir="rtl">
                  {Array.from({ length: 13 }, (_, i) => ((new Date(c.date).getMonth() + i) % 12) + 1).map((m, i) => (
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
              </Fragment>
            ))}
          </Page>
          <Page c={c}>
            <Bar title={draftLabel} />
            <div className="paper-row paper-row-split"><span>الشريك</span><span dir="auto">{c.counterparty.name || '…'}</span></div>
            {c.tracks.map((t, k) => (
              <div key={k} className="paper-row paper-row-split">
                <span>{t.name}</span>
                <span>مدة العقد : {t.months || '…'} شهر · {t.monthly ? fmtAmount(t.monthly) : '…'} {cur} شهرياً</span>
              </div>
            ))}
            <div className="paper-note">{fillText(SHORT_FOOTNOTE, c)}</div>
            <div className="paper-row paper-row-split"><span>الإجمالي</span><span>{contractTotal(c) ? fmtAmount(contractTotal(c)) : '…'} {cur}</span></div>
            <SignBlock c={c} first={first} second={second} firstSig={firstSig} secondSig={secondSig} firstSigner={firstSigner} secondSigner={secondSigner} hawamishIsFirst={hawamishIsFirst} stamp={stamp} />
          </Page>
        </>
      )}

      {c.kind === 'full' && (
        <>
          <Page c={c}>
            <Bar title={c.title} sub={draftLabel} />
            <div className="paper-row paper-row-split paper-row-accent"><span>تم الاتفاق بين كلٍ من</span><span>{agreementDateLine(c.date)}</span></div>
            <div className="paper-cols">
              <Party p={first} title="الطرف الأول" full />
              <Party p={second} title="الطرف الثاني" full />
            </div>
            {c.sections.slice(0, 1).map((s) => (
              <Fragment key={s.num}><Bar num={s.num} title={s.title} /><Box c={c} text={s.body} /></Fragment>
            ))}
          </Page>
          {chunk(c.sections.slice(1), [2, 3, 2, 3, 2, 1]).map((group, i) => (
            <Page key={i} c={c}>
              {group.map((s) => (
                <Fragment key={s.num}><Bar num={s.num} title={s.title} /><Box c={c} text={s.body} /></Fragment>
              ))}
              {i === 5 && <SignBlock c={c} first={first} second={second} firstSig={firstSig} secondSig={secondSig} firstSigner={firstSigner} secondSigner={secondSigner} hawamishIsFirst={hawamishIsFirst} stamp={stamp} />}
            </Page>
          ))}
        </>
      )}

      {c.kind === 'offer' && (
        <>
          <Page c={c}>
            <Bar title={`(*) ${c.title}`} sub={draftLabel} />
            <div className="paper-row paper-row-split paper-row-accent"><span>تم إنشاء العرض</span><span>{agreementDateLine(c.date)}</span></div>
            <div className="paper-cols">
              <Party p={first} title="الطرف الأول" full />
              <Party p={second} title="الطرف الثاني" full />
            </div>
            <Bar num="01" title="تمهيد" />
            <Box c={c} text={c.scope} />
          </Page>
          <Page c={c}>
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
          <Page c={c}>
            <SignBlock c={c} first={first} second={second} firstSig={firstSig} secondSig={secondSig} firstSigner={firstSigner} secondSigner={secondSigner} hawamishIsFirst={hawamishIsFirst} stamp={stamp} />
          </Page>
        </>
      )}
    </div>
  )
}

function chunk<T>(items: T[], sizes: number[]): T[][] {
  const out: T[][] = []
  let i = 0
  for (const n of sizes) {
    if (i >= items.length) break
    out.push(items.slice(i, i + n))
    i += n
  }
  if (i < items.length) out.push(items.slice(i))
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
