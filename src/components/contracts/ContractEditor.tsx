import { useEffect, useMemo, useState } from 'react'
import { Lock, Plus, Save, Send, Trash2, Unlock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNarrow, useStr } from '@/lib/useStr'
import { useData, useSession } from '@/store/session'
import { useUi } from '@/store/ui'
import type { Contract, ContractContent, ContractPartyInfo, ContractVersion } from '@/types'
import { CURRENCIES, EMPTY_LEGAL, amountWords, contractTotal, currencyWord, emptyContent, fmtAmount, missingValues, partyFromClient, partyFromCreative } from '@/lib/contracts'
import { Button, Input, SectionTitle } from '../ui'
import { ContractPaper } from './ContractPaper'
import { SignDialog } from './SignDialog'

const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'
const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0))

/**
 * The admin's contract editor: form on one side, the paper live on the other. The fixed core is locked
 * (unlock on purpose); amounts/counts start EMPTY and the paper shows «…» until typed; «احفظ نسخة» freezes a
 * numbered version; «وقّع وأرسل» = Hawamish's signature on that version, then the contract goes out.
 */
export function ContractEditor({ contract, current, onClose }: { contract: Contract; current?: ContractVersion; onClose: () => void }) {
  const { t } = useStr()
  const s = useData()
  const sess = useSession()
  const ui = useUi()
  const narrow = useNarrow(1200)
  const legal = s.legal ?? EMPTY_LEGAL
  const counterpartyInfo = useMemo<ContractPartyInfo>(() => {
    if (contract.party === 'client') {
      const c = s.clients.find((x) => x.id === contract.clientId)
      return c ? partyFromClient(c) : { ...EMPTY_LEGAL.party, name: '' }
    }
    const u = s.users.find((x) => x.id === contract.creativeId)
    return u ? partyFromCreative(u) : { ...EMPTY_LEGAL.party, name: '' }
  }, [s, contract])
  const [c, setC] = useState<ContractContent>(() => (current ? JSON.parse(JSON.stringify(current.content)) : emptyContent(contract.kind, counterpartyInfo, contract.title, contract.accent, legal)))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState(false)
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'form' | 'paper'>('form')
  useEffect(() => {
    if (!current) return
    setC(JSON.parse(JSON.stringify(current.content)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])
  const dirtyContent = !current || JSON.stringify(current.content) !== JSON.stringify(c)
  // after «يبي تعديل» / «مرفوض» the decided version can never be re-sent: re-sending always freezes a new one
  const mustFreeze = contract.status === 'changes' || contract.status === 'rejected'
  const dirty = dirtyContent || mustFreeze
  const missing = missingValues(c)
  const total = contractTotal(c)
  const cur = currencyWord(c.pricing.currency)
  const up = (patch: Partial<ContractContent>) => setC((x) => ({ ...x, ...patch }))
  const upParty = (k: 'hawamish' | 'counterparty', patch: Partial<ContractPartyInfo>) => setC((x) => ({ ...x, [k]: { ...x[k], ...patch } }))
  const upPricing = (patch: Partial<ContractContent['pricing']>) => setC((x) => ({ ...x, pricing: { ...x.pricing, ...patch } }))

  /** Freezes a version and returns exactly the row the store created (never «the newest in the list»). */
  async function saveInner(): Promise<ContractVersion | undefined> {
    if (!dirty) return current
    try {
      const v = await sess.saveContractVersion(contract.id, { ...c, stamp: c.stamp || legal.stamp || undefined }, note.trim() || undefined)
      ui.setToast(t('contractSaved', { n: v.number }), 'info')
      setNote('')
      return v
    } catch {
      return undefined
    }
  }
  async function save() {
    setBusy(true)
    try {
      await saveInner()
    } finally {
      setBusy(false)
    }
  }
  async function signAndSend(sig: { signature: string; name: string; capacity: string }) {
    setBusy(true)
    try {
      const v = await saveInner()
      if (!v) return
      await sess.signContractFirst(v.id, sig)
      await sess.updateContract(contract.id, { status: 'sent' })
      ui.setToast(t('contractSentToast'), 'info')
      setSigning(false)
      ui.openContract(contract.id, false)
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false)
    }
  }

  const Num = ({ label, value, onChange, suffix, testId }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; testId?: string }) => (
    <label className="flex flex-col gap-1.5 min-w-0">
      <SectionTitle>{label}</SectionTitle>
      <div className="relative -mt-1">
        <Input value={value === 0 ? '' : String(value)} onChange={(e) => onChange(num(e.target.value))} placeholder="0" dir="ltr" inputMode="numeric" className={cn('py-2 text-[13px] tabular-nums', value === 0 && 'border-warning-dark/50 bg-warning-tint/30')} data-testid={testId} />
        {suffix && <span className="absolute inset-y-0 end-3 grid place-items-center text-[11px] text-fg-muted pointer-events-none">{suffix}</span>}
      </div>
      {value === 0 && <span className="text-[10.5px] text-warning-dark">{t('suggested')}</span>}
    </label>
  )
  const PartyFields = ({ k, p, full }: { k: 'hawamish' | 'counterparty'; p: ContractPartyInfo; full: boolean }) => (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fName')}</SectionTitle><Input value={p.name} onChange={(e) => upParty(k, { name: e.target.value })} dir="auto" className="py-1.5 text-[13px]" data-testid={`${k}-name`} /></label>
      <label className="flex flex-col gap-1"><SectionTitle>{t('fCr')}</SectionTitle><Input value={p.cr} onChange={(e) => upParty(k, { cr: e.target.value })} dir="ltr" className="py-1.5 text-[13px]" /></label>
      <label className="flex flex-col gap-1"><SectionTitle>{t('fCountry')}</SectionTitle><Input value={p.country} onChange={(e) => upParty(k, { country: e.target.value })} dir="auto" className="py-1.5 text-[13px]" /></label>
      {full && <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fCity')}</SectionTitle><Input value={p.city} onChange={(e) => upParty(k, { city: e.target.value })} dir="auto" className="py-1.5 text-[13px]" /></label>}
      <label className="flex flex-col gap-1"><SectionTitle>{t('fRepTitle')}</SectionTitle><Input value={p.repTitle} onChange={(e) => upParty(k, { repTitle: e.target.value })} dir="auto" className="py-1.5 text-[13px]" /></label>
      <label className="flex flex-col gap-1"><SectionTitle>{t('fRepName')}</SectionTitle><Input value={p.repName} onChange={(e) => upParty(k, { repName: e.target.value })} dir="auto" className="py-1.5 text-[13px]" data-testid={`${k}-rep`} /></label>
      <label className="flex flex-col gap-1"><SectionTitle>{t('fPhone')}</SectionTitle><Input value={p.phone} onChange={(e) => upParty(k, { phone: e.target.value })} dir="ltr" className="py-1.5 text-[13px]" /></label>
      <label className="flex flex-col gap-1"><SectionTitle>{t('fEmail')}</SectionTitle><Input value={p.email} onChange={(e) => upParty(k, { email: e.target.value })} dir="ltr" className="py-1.5 text-[13px]" /></label>
      {full && <label className="flex flex-col gap-1"><SectionTitle>{t('fNationalId')}</SectionTitle><Input value={p.nationalId} onChange={(e) => upParty(k, { nationalId: e.target.value })} dir="ltr" className="py-1.5 text-[13px]" /></label>}
    </div>
  )

  const form = (
    <div className="flex flex-col gap-5 min-w-0">
      {/* basics */}
      <Group title={t('secBasics')}>
        <label className="flex flex-col gap-1"><SectionTitle>{t('contractTitleLabel')}</SectionTitle><Input value={c.title} onChange={(e) => up({ title: e.target.value })} dir="auto" className="py-1.5 text-[13px]" /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('fProject')}</SectionTitle><Input value={c.project} onChange={(e) => up({ project: e.target.value })} placeholder="مثال: تعزيز الحضور الرقمي وبناء هوية إعلامية" dir="auto" className="py-1.5 text-[13px]" data-testid="contract-project" /></label>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1"><SectionTitle>{t('fDate')}</SectionTitle><Input type="date" value={c.date} onChange={(e) => up({ date: e.target.value })} dir="ltr" className="py-1.5 text-[13px]" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('accentColor')}</SectionTitle><input type="color" value={c.accent} onChange={(e) => up({ accent: e.target.value })} className="h-9 w-full rounded cursor-pointer border border-border bg-bg" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('fCounterpartySide')}</SectionTitle>
            <select value={c.counterpartySide} onChange={(e) => up({ counterpartySide: e.target.value as 'first' | 'second' })} className={cn(field, 'py-1.5 cursor-pointer')}>
              <option value="first">{t('sideFirst')}</option>
              <option value="second">{t('sideSecond')}</option>
            </select>
          </label>
        </div>
      </Group>
      <Group title={t('secCounterparty')}>
        <PartyFields k="counterparty" p={c.counterparty} full={c.kind !== 'short'} />
      </Group>
      <Group title={t('secHawamish')} hint={!legal.party.cr ? t('missingValues') : undefined}>
        <PartyFields k="hawamish" p={c.hawamish} full={c.kind !== 'short'} />
      </Group>

      {/* numbers */}
      {c.kind !== 'offer' && (
        <Group title={t('secVars')}>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fPlatforms')}</SectionTitle><Input value={c.vars.platforms} onChange={(e) => up({ vars: { ...c.vars, platforms: e.target.value } })} placeholder="Instagram · TikTok · X" dir="auto" className="py-1.5 text-[13px]" data-testid="vars-platforms" /></label>
            <Num label={t('fPosts')} value={c.vars.posts} onChange={(n) => up({ vars: { ...c.vars, posts: n } })} testId="vars-posts" />
            <Num label={t('fDesigns')} value={c.vars.designs} onChange={(n) => up({ vars: { ...c.vars, designs: n } })} />
            <Num label={t('fVideos')} value={c.vars.videos} onChange={(n) => up({ vars: { ...c.vars, videos: n } })} />
          </div>
        </Group>
      )}

      {/* pricing */}
      {c.kind === 'full' && (
        <Group title={t('secPricing')}>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1"><SectionTitle>{t('secPricing')}</SectionTitle>
              <select value={c.pricing.mode} onChange={(e) => upPricing({ mode: e.target.value as 'monthly' | 'project' })} className={cn(field, 'py-1.5 cursor-pointer')} data-testid="pricing-mode">
                <option value="monthly">{t('pricingMonthly')}</option>
                <option value="project">{t('pricingProject')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><SectionTitle>{t('fCurrency')}</SectionTitle>
              <select value={c.pricing.currency} onChange={(e) => upPricing({ currency: e.target.value })} className={cn(field, 'py-1.5 cursor-pointer')}>
                {Object.keys(CURRENCIES).map((k) => <option key={k} value={k}>{k} · {CURRENCIES[k].word}</option>)}
              </select>
            </label>
            {c.pricing.mode === 'monthly' ? (
              <>
                <Num label={t('fMonthly')} value={c.pricing.monthly} onChange={(n) => upPricing({ monthly: n })} suffix={cur} testId="pricing-monthly" />
                <Num label={t('fMonths')} value={c.pricing.months} onChange={(n) => upPricing({ months: n })} suffix="شهر" testId="pricing-months" />
              </>
            ) : (
              <>
                <Num label={t('fProjectTotal')} value={c.pricing.projectTotal} onChange={(n) => upPricing({ projectTotal: n })} suffix={cur} />
                <div className="col-span-2 flex flex-col gap-2">
                  <SectionTitle>{t('fInstallments')}</SectionTitle>
                  {c.pricing.installments.map((i, k) => (
                    <div key={k} className="flex gap-2 items-center">
                      <Input value={i.label} onChange={(e) => upPricing({ installments: c.pricing.installments.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} placeholder="عند توقيع العقد" dir="auto" className="py-1.5 text-[13px] flex-1" />
                      <Input value={i.amount === 0 ? '' : String(i.amount)} onChange={(e) => upPricing({ installments: c.pricing.installments.map((x, j) => (j === k ? { ...x, amount: num(e.target.value) } : x)) })} placeholder="0" dir="ltr" inputMode="numeric" className="py-1.5 text-[13px] w-[120px] tabular-nums" />
                      <Button size="icon" variant="ghost" onClick={() => upPricing({ installments: c.pricing.installments.filter((_, j) => j !== k) })} aria-label={t('mediaRemove')}><Trash2 size={14} /></Button>
                    </div>
                  ))}
                  <Button size="sm" className="self-start" onClick={() => upPricing({ installments: [...c.pricing.installments, { label: '', amount: 0 }] })}><Plus size={14} /> {t('addInstallment')}</Button>
                </div>
              </>
            )}
            <Num label={t('fLateDays')} value={c.pricing.lateDays} onChange={(n) => upPricing({ lateDays: n })} suffix="يوم" />
            <Num label={t('fSupportMonths')} value={c.pricing.supportMonths} onChange={(n) => upPricing({ supportMonths: n })} suffix="شهر" />
          </div>
          <div className="rounded-md bg-muted-bg px-3 py-2 text-[12.5px]" data-testid="pricing-total">
            <b>{t('fTotal')}:</b> {total > 0 ? amountWords(total, cur) : '…'}
          </div>
        </Group>
      )}
      {c.kind === 'short' && (
        <Group title={t('secTracks')}>
          <label className="flex flex-col gap-1"><SectionTitle>{t('fCurrency')}</SectionTitle>
            <select value={c.pricing.currency} onChange={(e) => upPricing({ currency: e.target.value })} className={cn(field, 'py-1.5 cursor-pointer w-[220px]')}>
              {Object.keys(CURRENCIES).map((k) => <option key={k} value={k}>{k} · {CURRENCIES[k].word}</option>)}
            </select>
          </label>
          {c.tracks.map((tr, k) => (
            <div key={k} className="rounded-md border border-border p-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1"><SectionTitle>{t('fName')}</SectionTitle><Input value={tr.name} onChange={(e) => up({ tracks: c.tracks.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} dir="auto" className="py-1.5 text-[13px]" /></label>
                <label className="flex flex-col gap-1"><SectionTitle>EN</SectionTitle><Input value={tr.nameEn} onChange={(e) => up({ tracks: c.tracks.map((x, j) => (j === k ? { ...x, nameEn: e.target.value } : x)) })} dir="ltr" className="py-1.5 text-[13px]" /></label>
                <Num label={t('fMonthly')} value={tr.monthly} onChange={(n) => up({ tracks: c.tracks.map((x, j) => (j === k ? { ...x, monthly: n } : x)) })} suffix={cur} testId={`track-${k}-monthly`} />
                <Num label={t('fMonths')} value={tr.months} onChange={(n) => up({ tracks: c.tracks.map((x, j) => (j === k ? { ...x, months: n } : x)) })} suffix="شهر" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {tr.quarters.map((q, qi) => (
                  <label key={qi} className="flex flex-col gap-1"><SectionTitle>{t('fQuarter', { n: qi + 1 })}</SectionTitle><Input value={q} onChange={(e) => up({ tracks: c.tracks.map((x, j) => (j === k ? { ...x, quarters: x.quarters.map((y, yi) => (yi === qi ? e.target.value : y)) as typeof x.quarters } : x)) })} dir="auto" className="py-1.5 text-[12px]" /></label>
                ))}
              </div>
              {c.tracks.length > 1 && <Button size="sm" variant="ghost" className="self-start text-accent" onClick={() => up({ tracks: c.tracks.filter((_, j) => j !== k) })}><Trash2 size={14} /> {t('mediaRemove')}</Button>}
            </div>
          ))}
          <Button size="sm" className="self-start" onClick={() => up({ tracks: [...c.tracks, { name: 'النطاق التسويقي', nameEn: 'Marketing Scope', months: c.tracks[0]?.months ?? 12, monthly: 0, quarters: ['', '', '', ''] }] })}><Plus size={14} /> {t('addTrack')}</Button>
          <div className="rounded-md bg-muted-bg px-3 py-2 text-[12.5px]"><b>{t('fTotal')}:</b> {total > 0 ? `${fmtAmount(total)} ${cur}` : '…'}</div>
        </Group>
      )}
      {c.kind === 'offer' && (
        <Group title={t('secPackages')}>
          {c.packages.map((p, k) => (
            <div key={k} className="rounded-md border border-border p-3 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1"><SectionTitle>{t('fName')}</SectionTitle><Input value={p.name} onChange={(e) => up({ packages: c.packages.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} dir="auto" className="py-1.5 text-[13px]" /></label>
                <label className="flex flex-col gap-1"><SectionTitle>{t('postTitle')}</SectionTitle><Input value={p.subtitle} onChange={(e) => up({ packages: c.packages.map((x, j) => (j === k ? { ...x, subtitle: e.target.value } : x)) })} placeholder="الحضور الرقمي" dir="auto" className="py-1.5 text-[13px]" /></label>
                <Num label={`${t('fTotal')} ${t('perMonth')}`} value={p.price} onChange={(n) => up({ packages: c.packages.map((x, j) => (j === k ? { ...x, price: n } : x)) })} suffix={cur} testId={`package-${k}-price`} />
              </div>
              <label className="flex flex-col gap-1"><SectionTitle>{t('fPackageItems')}</SectionTitle><textarea value={p.items.join('\n')} onChange={(e) => up({ packages: c.packages.map((x, j) => (j === k ? { ...x, items: e.target.value.split('\n') } : x)) })} rows={5} dir="auto" className={cn(field, 'resize-y')} /></label>
              {c.packages.length > 1 && <Button size="sm" variant="ghost" className="self-start text-accent" onClick={() => up({ packages: c.packages.filter((_, j) => j !== k) })}><Trash2 size={14} /> {t('mediaRemove')}</Button>}
            </div>
          ))}
          {c.packages.length < 3 && <Button size="sm" className="self-start" onClick={() => up({ packages: [...c.packages, { name: `الباقة ${c.packages.length + 1}`, subtitle: '', price: 0, per: 'month', items: [] }] })}><Plus size={14} /> {t('addPackage')}</Button>}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1"><SectionTitle>{t('fUnit')}</SectionTitle><Input value={c.unitName} onChange={(e) => up({ unitName: e.target.value })} dir="auto" className="py-1.5 text-[13px]" /></label>
            <Num label={t('fTotal')} value={c.unitPrice} onChange={(n) => up({ unitPrice: n })} suffix={cur} />
            <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fPackageItems')}</SectionTitle><textarea value={c.unitItems.join('\n')} onChange={(e) => up({ unitItems: e.target.value.split('\n') })} rows={3} dir="auto" className={cn(field, 'resize-y')} /></label>
          </div>
        </Group>
      )}

      {/* scope + sections */}
      {c.kind !== 'full' && (
        <Group title={c.kind === 'offer' ? 'تمهيد' : t('secScope')}>
          <textarea value={c.scope} onChange={(e) => up({ scope: e.target.value })} rows={7} dir="auto" className={cn(field, 'resize-y leading-relaxed')} data-testid="contract-scope" />
        </Group>
      )}
      {c.kind === 'full' && (
        <Group title={t('secSections')}>
          {c.sections.map((sec, k) => {
            const locked = !!sec.fixed && !unlocked.has(sec.num)
            return (
              <div key={sec.num} className="rounded-md border border-border p-3 flex flex-col gap-2" data-testid="section-editor">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold tabular-nums">{sec.num}</span>
                  <Input value={sec.title} onChange={(e) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} dir="auto" className="py-1 text-[13px] flex-1" disabled={locked} />
                  {sec.fixed && (
                    <Button size="sm" variant="ghost" onClick={() => setUnlocked((u) => { const n = new Set(u); if (n.has(sec.num)) n.delete(sec.num); else n.add(sec.num); return n })} title={locked ? t('unlockSection') : t('fixedSection')}>
                      {locked ? <Lock size={14} /> : <Unlock size={14} />} <span className="text-[11px]">{locked ? t('fixedSection') : t('unlockSection')}</span>
                    </Button>
                  )}
                </div>
                {sec.num === '04' ? (
                  <div className="text-[11.5px] text-fg-secondary">{t('secPricing')} ← {t('secPricing')}</div>
                ) : (
                  <textarea value={sec.body} onChange={(e) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, body: e.target.value } : x)) })} rows={locked ? 3 : 7} dir="auto" disabled={locked} className={cn(field, 'resize-y leading-relaxed', locked && 'opacity-70')} />
                )}
              </div>
            )
          })}
        </Group>
      )}

      <Group title={t('secBank')}>
        <div className="grid grid-cols-2 gap-2">
          {legal.banks.length > 1 && (
            <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('secBank')}</SectionTitle>
              <select value={legal.banks.findIndex((b) => b.iban === c.bank.iban)} onChange={(e) => up({ bank: { ...legal.banks[Number(e.target.value)] } })} className={cn(field, 'py-1.5 cursor-pointer')}>
                {legal.banks.map((b, i) => <option key={i} value={i}>{b.swift} · {b.iban}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1"><SectionTitle>صاحب الحساب</SectionTitle><Input value={c.bank.owner} onChange={(e) => up({ bank: { ...c.bank, owner: e.target.value } })} dir="auto" className="py-1.5 text-[13px]" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>رقم الحساب</SectionTitle><Input value={c.bank.account} onChange={(e) => up({ bank: { ...c.bank, account: e.target.value } })} dir="ltr" className="py-1.5 text-[13px]" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>IBAN</SectionTitle><Input value={c.bank.iban} onChange={(e) => up({ bank: { ...c.bank, iban: e.target.value } })} dir="ltr" className="py-1.5 text-[13px]" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>Swift</SectionTitle><Input value={c.bank.swift} onChange={(e) => up({ bank: { ...c.bank, swift: e.target.value } })} dir="ltr" className="py-1.5 text-[13px]" /></label>
        </div>
      </Group>
      <Group title={t('secSigners')}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><SectionTitle>{t('secHawamish')} · {t('signerName')}</SectionTitle><Input value={c.signers.hawamish.name} onChange={(e) => up({ signers: { ...c.signers, hawamish: { ...c.signers.hawamish, name: e.target.value } } })} dir="auto" className="py-1.5 text-[13px]" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('signerCapacity')}</SectionTitle><Input value={c.signers.hawamish.capacity} onChange={(e) => up({ signers: { ...c.signers, hawamish: { ...c.signers.hawamish, capacity: e.target.value } } })} dir="auto" className="py-1.5 text-[13px]" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('secCounterparty')} · {t('signerName')}</SectionTitle><Input value={c.signers.counterparty.name} onChange={(e) => up({ signers: { ...c.signers, counterparty: { ...c.signers.counterparty, name: e.target.value } } })} dir="auto" className="py-1.5 text-[13px]" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('signerCapacity')}</SectionTitle><Input value={c.signers.counterparty.capacity} onChange={(e) => up({ signers: { ...c.signers, counterparty: { ...c.signers.counterparty, capacity: e.target.value } } })} dir="auto" className="py-1.5 text-[13px]" /></label>
        </div>
      </Group>
      <label className="flex flex-col gap-1"><SectionTitle>{t('noteToClient')}</SectionTitle><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('noteToClientPh')} dir="auto" className="py-1.5 text-[13px]" /></label>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[75] bg-card flex flex-col anim-fade" role="dialog" aria-label={t('editContract')} data-testid="contract-editor">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border flex-wrap">
        <span className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: c.accent }} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold truncate" dir="auto">{t('editContract')} · {c.title}</div>
          <div className="text-[11px] text-fg-secondary">{current ? `${t('version')} ${current.number}` : t('noVersionYet')}{dirty && current ? ' · ' + t('unlockSection') : ''}</div>
        </div>
        {narrow && <SegmentedMini value={tab} onChange={setTab} labels={[t('secSections'), t('openPaper')]} />}
        {missing.length > 0 && <span className="text-[11.5px] text-warning-dark font-semibold max-w-[320px] truncate" title={missing.join(' · ')} data-testid="missing-values">{t('missingValues')} ({missing.length})</span>}
        <Button disabled={busy || !dirtyContent} onClick={() => void save()} data-testid="save-version">
          <Save size={14} /> {t('saveVersion')}
        </Button>
        <Button variant="primary" disabled={busy || missing.length > 0} onClick={() => setSigning(true)} data-testid="sign-send">
          <Send size={14} /> {t('signAndSend')}
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label={t('cancel')}>
          <X size={16} />
        </Button>
      </div>
      <div className={cn('flex-1 min-h-0 grid', narrow ? 'grid-cols-1' : 'grid-cols-[minmax(380px,520px)_1fr]')}>
        <div className={cn('min-h-0 overflow-y-auto no-scrollbar p-4 border-e border-border', narrow && tab !== 'form' && 'hidden')}>
          <div className="text-[11.5px] text-fg-secondary mb-3">{t('saveVersionHint')}</div>
          {form}
        </div>
        <div className={cn('min-h-0 paper-preview', narrow && tab !== 'paper' && 'hidden')}>
          <ContractPaper content={c} number={contract.number} version={current && !dirtyContent ? current : undefined} stamp={legal.stamp || undefined} scale={narrow ? 0.45 : 0.62} />
        </div>
      </div>
      {signing && <SignDialog title={t('signAndSend')} defaultName={c.signers.hawamish.name} defaultCapacity={c.signers.hawamish.capacity} onConfirm={signAndSend} onClose={() => setSigning(false)} busy={busy} />}
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="text-[13px] font-semibold border-b border-border pb-1">{title}</div>
      {hint && <div className="text-[11px] text-warning-dark">{hint}</div>}
      {children}
    </section>
  )
}
function SegmentedMini<T extends string>({ value, onChange, labels }: { value: T; onChange: (v: T) => void; labels: [string, string] }) {
  const vals = ['form', 'paper'] as unknown as [T, T]
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
      {vals.map((v, i) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={cn('px-3 py-1.5 cursor-pointer', value === v ? 'bg-fg text-bg' : 'bg-bg')}>{labels[i]}</button>
      ))}
    </div>
  )
}
