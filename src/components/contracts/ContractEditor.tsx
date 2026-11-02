import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Lock, Maximize2, Minimize2, Minus, Plus, Save, Send, Trash2, Unlock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTime, useNarrow, useStr } from '@/lib/useStr'
import { useData, useSession } from '@/store/session'
import { useUi } from '@/store/ui'
import type { Contract, ContractContent, ContractPartyInfo, ContractVersion } from '@/types'
import { CURRENCIES, EMPTY_LEGAL, JOB_TITLES, TERMS, coreMissing, amountWords, contractTotal, currencyWord, emptyContent, fmtAmount, missingFields, originalIfChanged, partyFromClient, partyFromCreative } from '@/lib/contracts'
import { deepLatin, toLatin } from '@/lib/latinDigits'
import { clearDraft, loadDraft, saveDraft } from '@/lib/contractDraft'
import { Button, Input, SectionTitle } from '../ui'
import { ContractPaper, type PaperOverflow } from './ContractPaper'
import { SignDialog } from './SignDialog'

const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'
const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(toLatin(v).replace(/[^\d.]/g, '')) || 0))

/**
 * The admin's contract editor: form on one side, the paper live on the other. The fixed core is locked
 * (unlock on purpose); amounts/counts start EMPTY and the paper shows «…» until typed; «احفظ نسخة» freezes a
 * numbered version; «وقّع وأرسل» = Hawamish's signature on that version, then the contract goes out.
 */
export function ContractEditor({ contract, current, onClose, initialField, onJumped }: { contract: Contract; current?: ContractVersion; onClose: () => void; /** open ON this field (a gap tapped in the panel's sign window) */ initialField?: string | null; onJumped?: () => void }) {
  const { t, lang } = useStr()
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
  // deepLatin: Arabic digits saved before the rule (e.g. the bank account) come into the form as English
  const fresh = (): ContractContent => deepLatin(current ? JSON.parse(JSON.stringify(current.content)) : emptyContent(contract.kind, counterpartyInfo, contract.title, contract.accent, legal))
  // unsaved edits from before a refresh come back — only if they were made on this same version
  const [draft] = useState(() => {
    const d = loadDraft(contract.id)
    return d && d.base === (current?.id ?? null) ? d : null
  })
  const [c, setC] = useState<ContractContent>(() => (draft ? deepLatin(draft.content) : fresh()))
  const [note, setNote] = useState(() => draft?.note ?? '')
  const [restoredAt, setRestoredAt] = useState<string | null>(draft?.at ?? null)
  const [draftFailed, setDraftFailed] = useState(false)
  // the draft this tab wrote last (or adopted on restore): a tab only ever clears ITS OWN draft, never another tab's newer one
  const ownDraftAt = useRef<string | null>(draft?.at ?? null)
  // the form as it was when «احفظ نسخة» was pressed: typing that continues while the save is in flight must survive it
  const sentFrom = useRef<string | null>(null)
  const [focusSec, setFocusSec] = useState<string | null>(null)
  // ⭐٥ (1 Nov): the paper at full size; tapping a part opens its editor in a panel beside it
  const [paperBig, setPaperBig] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [overflow, setOverflow] = useState<PaperOverflow[]>([])
  // 1 Nov notes: the big paper opens WHERE he was (or on the part he tapped), and closing it brings the form to the
  // part he edited, highlighted, with a word that the edit is in (and kept as a draft)
  const formScroll = useRef<HTMLDivElement>(null)
  const smallScroll = useRef<HTMLDivElement>(null)
  const bigScroll = useRef<HTMLDivElement>(null)
  const openAt = useRef<{ pick: string | null; ratio: number }>({ pick: null, ratio: 0 })
  const bigSession = useRef<{ edited: boolean; lastPick: string | null }>({ edited: false, lastPick: null })
  const openPaper = (target?: EventTarget | null) => {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-pick]') : null
    const sc = smallScroll.current
    openAt.current = { pick: el?.dataset.pick ?? null, ratio: sc && sc.scrollHeight ? sc.scrollTop / sc.scrollHeight : 0 }
    bigSession.current = { edited: false, lastPick: el?.dataset.pick ?? null }
    setPick(el?.dataset.pick ?? null)
    setPaperBig(true)
  }
  const closePaper = () => {
    const big = bigScroll.current
    const ratio = big && big.scrollHeight ? big.scrollTop / big.scrollHeight : 0
    const target = bigSession.current.lastPick
    const changed = bigSession.current.edited
    setPaperBig(false)
    setPick(null)
    // on a narrow screen the form is a tab: show it so he sees the part he just edited
    if (narrow && target) setTab('form')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (smallScroll.current) smallScroll.current.scrollTop = ratio * smallScroll.current.scrollHeight
      const anchor = target && formScroll.current?.querySelector<HTMLElement>(`[data-anchor="${target}"]`)
      if (anchor && formScroll.current) {
        formScroll.current.scrollTop += anchor.getBoundingClientRect().top - formScroll.current.getBoundingClientRect().top - 12
        anchor.classList.remove('form-flash')
        void anchor.offsetWidth
        anchor.classList.add('form-flash')
      }
    }))
    if (changed) ui.setToast(t('paperEditApplied'), 'info')
  }
  // opened from the panel's sign window on a tapped gap → go straight to that field once the form is laid out
  useEffect(() => {
    if (!initialField) return
    const id = setTimeout(() => { goToField(initialField); onJumped?.() }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialField])
  /** The missing-values bar: close the big paper / show the form tab, scroll to the field, focus it, flash it. */
  const goToField = (field: string) => {
    if (paperBig) {
      setPaperBig(false)
      setPick(null)
    }
    if (narrow) setTab('form')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const box = formScroll.current
      const el = box?.querySelector<HTMLElement>(`[data-testid="${field}"]`)
      if (!box || !el) return
      box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 3
      el.focus({ preventScroll: true })
      const wrap = el.closest<HTMLElement>('label') ?? el
      wrap.classList.remove('form-flash')
      void wrap.offsetWidth
      wrap.classList.add('form-flash')
    }))
  }
  useEffect(() => {
    if (pick) bigSession.current.lastPick = pick
  }, [pick])
  // any typing while the big paper is open counts as «he edited» (even if he typed it back)
  const seenC = useRef(c)
  useEffect(() => {
    if (paperBig && seenC.current !== c) bigSession.current.edited = true
    seenC.current = c
  }, [c, paperBig])
  // place the big paper where he was: on the tapped part, or at the same relative height as the small preview
  useLayoutEffect(() => {
    if (!paperBig) return
    const big = bigScroll.current
    if (!big) return
    const el = openAt.current.pick ? big.querySelector<HTMLElement>(`[data-pick="${openAt.current.pick}"]`) : null
    // not scrollIntoView: the part sits inside an overflow:hidden page and the browser would scroll THAT box
    if (el) big.scrollTop += el.getBoundingClientRect().top - big.getBoundingClientRect().top - 80
    else big.scrollTop = openAt.current.ratio * big.scrollHeight
  }, [paperBig])
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState(false)
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'form' | 'paper'>('form')
  // a NEW version (saved here or elsewhere) replaces the form; the first render keeps a restored draft
  const seenVersion = useRef(current?.id)
  // what this tab started from — the saved version, or the empty template before the first version (verify round:
  // with no version yet a save from another tab replaced unsaved typing without a word)
  const baseJson = useRef<string | null>(null)
  if (baseJson.current === null) baseJson.current = JSON.stringify(fresh())
  const [elsewhere, setElsewhere] = useState<number | null>(null)
  useEffect(() => {
    if (!current || seenVersion.current === current.id) return
    seenVersion.current = current.id
    const now = JSON.stringify(c)
    const ownSave = sentFrom.current !== null
    const typedSince = ownSave && sentFrom.current !== now
    // saved from ANOTHER tab/person while this form had unsaved edits: keep them (now a draft on top), say so (council 1 Nov)
    const editedHere = !ownSave && now !== baseJson.current
    sentFrom.current = null
    baseJson.current = JSON.stringify(deepLatin(current.content))
    setRestoredAt(null)
    if (editedHere) setElsewhere(current.number)
    else if (!typedSince) setC(JSON.parse(JSON.stringify(current.content))) // else: keep the newer typing, now a draft on top of this version
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])
  const overflowText = overflow.length ? t('overflowWarn', { pages: overflow.map((o) => (o.sections.length ? `${o.page} (${t('clause')} ${o.sections.join('، ')})` : String(o.page))).join(' · ') }) : ''
  const dirtyContent = !current || JSON.stringify(current.content) !== JSON.stringify(c)
  // every change is kept in this browser at once (no debounce: a refresh right after typing loses nothing)
  // (a note alone is not a draft: on its own it cannot be saved as a version)
  useEffect(() => {
    if (dirtyContent) {
      const at = new Date().toISOString()
      const ok = saveDraft(contract.id, { base: current?.id ?? null, content: c, note, at })
      if (ok) ownDraftAt.current = at
      setDraftFailed(!ok)
    } else if (ownDraftAt.current && loadDraft(contract.id)?.at === ownDraftAt.current) {
      clearDraft(contract.id)
      ownDraftAt.current = null
    }
  }, [c, note, dirtyContent, current?.id, contract.id])
  // 1 Nov: «تجاهلها» read like «close this message» and wiped his whole morning of edits. Now: hiding the banner is its
  // own harmless button, going back to the saved version asks first, and it can be undone in this session.
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [undo, setUndo] = useState<{ c: ContractContent; note: string } | null>(null)
  const replaceWith = (next: ContractContent) => {
    setUndo({ c, note })
    setC(next)
  }
  // «ذاكرة العقد» (1 Nov, his idea): a field he empties offers back what it held IN THIS CONTRACT (its saved versions + what
  // was typed this session). A new contract starts blank — nothing comes from other contracts.
  const [sessionMem, setSessionMem] = useState<Record<string, string>>({})
  useEffect(() => {
    const now = recallValues(c)
    setSessionMem((prev) => {
      let changed = false
      const next = { ...prev }
      for (const [k, v] of Object.entries(now)) {
        // deleting character by character leaves prefixes of the remembered value: never remember those
        if (next[k] !== v && !(next[k] ?? '').startsWith(v)) {
          next[k] = v
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [c])
  const mem = useMemo(() => {
    const m: Record<string, string> = {}
    s.contractVersions.filter((v) => v.contractId === contract.id).sort((a, b) => a.number - b.number).forEach((v) => Object.assign(m, recallValues(v.content)))
    return { ...m, ...sessionMem }
  }, [s.contractVersions, contract.id, sessionMem])
  const discardDraft = () => {
    clearDraft(contract.id)
    ownDraftAt.current = null
    replaceWith(fresh())
    setNote('')
    setRestoredAt(null)
    setConfirmDiscard(false)
  }
  // after «يبي تعديل» / «مرفوض» the decided version can never be re-sent: re-sending always freezes a new one
  const mustFreeze = contract.status === 'changes' || contract.status === 'rejected'
  const dirty = dirtyContent || mustFreeze
  const emp = c.kind === 'employment'
  const missingList = missingFields(c)
  const missing = missingList.map((m) => m.label)
  // only the core blocks «وقّع وأرسل»; the rest is shown as a warning inside the sign window (Yousef 2 Nov)
  const core = coreMissing(c)
  const total = contractTotal(c)
  const cur = currencyWord(c.pricing.currency)
  const up = (patch: Partial<ContractContent>) => setC((x) => ({ ...x, ...patch }))
  const upParty = (k: 'hawamish' | 'counterparty', patch: Partial<ContractPartyInfo>) => setC((x) => ({ ...x, [k]: { ...x[k], ...patch } }))
  const toggleLock = (num: string) => setUnlocked((u) => { const n = new Set(u); if (n.has(num)) n.delete(num); else n.add(num); return n })
  const upPricing = (patch: Partial<ContractContent['pricing']>) => setC((x) => ({ ...x, pricing: { ...x.pricing, ...patch } }))

  /** Freezes a version and returns exactly the row the store created (never «the newest in the list»). */
  async function saveInner(force = false): Promise<ContractVersion | undefined> {
    if (!dirty && !force) return current
    const sentNote = note
    sentFrom.current = JSON.stringify(c)
    try {
      const v = await sess.saveContractVersion(contract.id, { ...c, stamp: c.stamp || legal.stamp || undefined }, sentNote.trim() || undefined)
      ui.setToast(t('contractSaved', { n: v.number }), 'info')
      setNote((n) => (n === sentNote ? '' : n))
      return v
    } catch {
      sentFrom.current = null
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
    if (overflow.length > 0) return // text that does not fit would print cut — never sign it
    setBusy(true)
    try {
      // 2 Nov (council): a version that already reached the other side keeps its signature forever — signing again
      // (after «سحب») always freezes a NEW version, even with the same text
      const v = await saveInner(!!current?.sentAt)
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

  // the form in named blocks: the full form uses them all; the big-paper side panel shows only the block for what was tapped
  const blkBasics = (
      <Group title={t('secBasics')} anchor="basics">
        <label className="flex flex-col gap-1"><SectionTitle>{t('contractTitleLabel')}</SectionTitle><Input value={c.title} onChange={(e) => up({ title: e.target.value })} dir="auto" className="py-1.5 text-[13px]" data-testid="contract-title-input" /></label>
        {emp ? (
          <>
            <div className="flex flex-col gap-1"><SectionTitle>{t('fJobTitle')}</SectionTitle><Input value={c.jobTitle ?? ''} onChange={(e) => up({ jobTitle: e.target.value })} placeholder="مثال: مصمم جرافيك" dir="auto" className="py-1.5 text-[13px]" data-testid="contract-job" /><Recall value={c.jobTitle ?? ''} memo={mem.jobTitle} onPick={(v) => up({ jobTitle: v })} />
              <Chips list={JOB_TITLES} value={c.jobTitle ?? ''} onPick={(v) => up({ jobTitle: v })} testId="job-chip" /></div>
            <div className="flex flex-col gap-1"><SectionTitle>{t('fTerm')}</SectionTitle><Input value={c.term ?? ''} onChange={(e) => up({ term: e.target.value })} dir="auto" className="py-1.5 text-[13px]" data-testid="contract-term" />
              <Chips list={TERMS} value={c.term ?? ''} onPick={(v) => up({ term: v })} testId="term-chip" /></div>
          </>
        ) : (
        <label className="flex flex-col gap-1"><SectionTitle>{t('fProject')}</SectionTitle><Input value={c.project} onChange={(e) => up({ project: e.target.value })} placeholder="مثال: تعزيز الحضور الرقمي وبناء هوية إعلامية" dir="auto" className="py-1.5 text-[13px]" data-testid="contract-project" /><Recall value={c.project} memo={mem.project} onPick={(v) => up({ project: v })} /></label>
        )}
        <div className={cn('grid gap-2', emp ? 'grid-cols-2' : 'grid-cols-3')}>
          <label className="flex flex-col gap-1"><SectionTitle>{t('fDate')}</SectionTitle><Input type="date" value={c.date} onChange={(e) => up({ date: e.target.value })} dir="ltr" className="py-1.5 text-[13px]" data-testid="contract-date" /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('accentColor')}</SectionTitle><input type="color" value={c.accent} onChange={(e) => up({ accent: e.target.value })} className="h-9 w-full rounded cursor-pointer border border-border bg-bg" /></label>
          {!emp && <label className="flex flex-col gap-1"><SectionTitle>{t('fCounterpartySide')}</SectionTitle>
            <select value={c.counterpartySide} onChange={(e) => up({ counterpartySide: e.target.value as 'first' | 'second' })} className={cn(field, 'py-1.5 cursor-pointer')}>
              <option value="first">{t('sideFirst')}</option>
              <option value="second">{t('sideSecond')}</option>
            </select>
          </label>}
        </div>
      </Group>
  )
  const blkParties = (
    <>
      <Group title={emp ? t('secEmployee') : t('secCounterparty')} anchor="parties">
        <PartyFields k="counterparty" p={c.counterparty} full={c.kind !== 'short' && !emp} person={emp} onChange={upParty} mem={mem} />
      </Group>
      <Group title={t('secHawamish')} hint={!legal.party.cr ? t('missingValues') : undefined}>
        <PartyFields k="hawamish" p={c.hawamish} full={c.kind !== 'short' && !emp} onChange={upParty} mem={mem} />
      </Group>
    </>
  )
  const blkVars = c.kind !== 'offer' && !emp && (
        <Group title={t('secVars')}>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fPlatforms')}</SectionTitle><PlatformPicker value={c.vars.platforms} onChange={(v) => up({ vars: { ...c.vars, platforms: v } })} /></div>
            <Num label={t('fPosts')} value={c.vars.posts} onChange={(n) => up({ vars: { ...c.vars, posts: n } })} testId="vars-posts" optional={!missingList.some((m) => m.field === 'vars-posts')} />
            <Num label={t('fDesigns')} value={c.vars.designs} onChange={(n) => up({ vars: { ...c.vars, designs: n } })} testId="vars-designs" optional={!missingList.some((m) => m.field === 'vars-designs')} />
            <Num label={t('fVideos')} value={c.vars.videos} onChange={(n) => up({ vars: { ...c.vars, videos: n } })} testId="vars-videos" optional={!missingList.some((m) => m.field === 'vars-videos')} />
          </div>
        </Group>
      )
  const blkPricing = c.kind === 'full' && (
        <Group title={t('secPricing')} anchor="pricing">
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
                <Num label={t('fProjectTotal')} value={c.pricing.projectTotal} onChange={(n) => upPricing({ projectTotal: n })} suffix={cur} testId="pricing-total" />
                <div className="col-span-2 flex flex-col gap-2">
                  <SectionTitle>{t('fInstallments')}</SectionTitle>
                  {c.pricing.installments.map((i, k) => (
                    <div key={k} className="flex gap-2 items-center">
                      <Input value={i.label} onChange={(e) => upPricing({ installments: c.pricing.installments.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} placeholder="عند توقيع العقد" dir="auto" className="py-1.5 text-[13px] flex-1" />
                      <Input value={i.amount === 0 ? '' : String(i.amount)} onChange={(e) => upPricing({ installments: c.pricing.installments.map((x, j) => (j === k ? { ...x, amount: num(e.target.value) } : x)) })} placeholder="0" dir="ltr" inputMode="numeric" className="py-1.5 text-[13px] w-[120px] tabular-nums" data-testid={`installment-${k}`} />
                      <Button size="icon" variant="ghost" onClick={() => upPricing({ installments: c.pricing.installments.filter((_, j) => j !== k) })} aria-label={t('mediaRemove')}><Trash2 size={14} /></Button>
                    </div>
                  ))}
                  <Button size="sm" className="self-start" onClick={() => upPricing({ installments: [...c.pricing.installments, { label: '', amount: 0 }] })}><Plus size={14} /> {t('addInstallment')}</Button>
                </div>
              </>
            )}
            <Num label={t('fLateDays')} hint={t('lateDaysHint')} value={c.pricing.lateDays} onChange={(n) => upPricing({ lateDays: n })} suffix="يوم" />
            <Num label={t('fSupportMonths')} hint={t('supportMonthsHint')} optional value={c.pricing.supportMonths} onChange={(n) => upPricing({ supportMonths: n })} suffix="شهر" />
          </div>
          <div className="rounded-md bg-muted-bg px-3 py-2 text-[12.5px]" data-testid="pricing-total">
            <b>{t('fTotal')}:</b> {total > 0 ? amountWords(total, cur) : '…'}
          </div>
        </Group>
      )
  const blkTracks = c.kind === 'short' && (
        <Group title={t('secTracks')} anchor="tracks">
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
                <Num label={t('fMonths')} value={tr.months} onChange={(n) => up({ tracks: c.tracks.map((x, j) => (j === k ? { ...x, months: n } : x)) })} suffix="شهر" testId={`track-${k}-months`} />
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
      )
  const blkPackages = c.kind === 'offer' && (
        <Group title={t('secPackages')} anchor="packages">
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
      )
  const blkScope = c.kind !== 'full' && !emp && (
        <Group title={c.kind === 'offer' ? 'تمهيد' : t('secScope')} anchor="scope">
          <div className="relative">
            <textarea value={c.scope} onChange={(e) => up({ scope: e.target.value })} rows={7} dir="auto" className={cn(field, 'resize-y leading-relaxed pe-10')} data-testid="contract-scope" />
            <Button size="icon" variant="ghost" className="absolute top-1 end-1" onClick={() => setFocusSec('scope')} aria-label={t('expandSection')} title={t('expandSection')} data-testid="section-expand-scope">
              <Maximize2 size={15} />
            </Button>
          </div>
        </Group>
      )
  // «عقد عمل»: pay in its own small block (optional amount — the clauses say it follows the work done)
  const blkSalary = emp && (
        <Group title={t('secSalary')} anchor="salary">
          <div className="grid grid-cols-2 gap-2">
            <Num label={t('fSalary')} hint={t('salaryHint')} optional value={c.pricing.monthly} onChange={(n) => upPricing({ monthly: n })} suffix={cur} testId="salary-monthly" />
            <label className="flex flex-col gap-1"><SectionTitle>{t('fCurrency')}</SectionTitle>
              <select value={c.pricing.currency} onChange={(e) => upPricing({ currency: e.target.value })} className={cn(field, 'py-1.5 cursor-pointer')}>
                {Object.keys(CURRENCIES).map((k) => <option key={k} value={k}>{k} · {CURRENCIES[k].word}</option>)}
              </select>
            </label>
          </div>
        </Group>
      )
  const blkSections = (c.kind === 'full' || emp) && (
        <Group title={t('secSections')} note={t('sectionsNote')}>
          {c.sections.map((sec, k) => {
            const locked = !!sec.fixed && !unlocked.has(sec.num)
            return (
              <div key={sec.num} className="rounded-md border border-border p-3 flex flex-col gap-2" data-testid="section-editor" data-anchor={sec.num === '04' ? undefined : `sec:${sec.num}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold tabular-nums">{sec.num}</span>
                  <Input value={sec.title} onChange={(e) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} dir="auto" className="py-1 text-[13px] flex-1" disabled={locked} />
                  {sec.fixed && (
                    <Button size="sm" variant="ghost" onClick={() => toggleLock(sec.num)} title={locked ? t('fixedSection') : t('unlockSection')}>
                      {locked ? <Lock size={14} /> : <Unlock size={14} />} <span className="text-[11px]">{locked ? t('fixedSection') : t('unlockSection')}</span>
                    </Button>
                  )}
                  {sec.num !== '04' && (
                    <Button size="icon" variant="ghost" onClick={() => setFocusSec(sec.num)} aria-label={t('expandSection')} title={t('expandSection')} data-testid={`section-expand-${sec.num}`}>
                      <Maximize2 size={15} />
                    </Button>
                  )}
                </div>
                <ChangedNote original={originalIfChanged(sec)} onRestore={(o) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, title: o.title, body: o.body } : x)) })} testId={`changed-${sec.num}`} />
                {sec.num === '04' ? (
                  <div className="text-[11.5px] text-fg-secondary">{t('secPricing')} ← {t('secPricing')}</div>
                ) : (
                  <textarea value={sec.body} onChange={(e) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, body: e.target.value } : x)) })} rows={locked ? 3 : 7} dir="auto" disabled={locked} className={cn(field, 'resize-y leading-relaxed', locked && 'opacity-70')} />
                )}
              </div>
            )
          })}
        </Group>
      )
  const blkBank = (
      <Group title={emp ? t('secEmployeeBank') : t('secBank')} anchor="bank">
        <div className="grid grid-cols-2 gap-2">
          {!emp && legal.banks.length > 1 && (
            <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('secBank')}</SectionTitle>
              <select value={legal.banks.findIndex((b) => b.iban === c.bank.iban)} onChange={(e) => up({ bank: { ...legal.banks[Number(e.target.value)] } })} className={cn(field, 'py-1.5 cursor-pointer')}>
                {legal.banks.map((b, i) => <option key={i} value={i}>{b.swift} · {b.iban}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1"><SectionTitle>صاحب الحساب</SectionTitle><Input value={c.bank.owner} onChange={(e) => up({ bank: { ...c.bank, owner: e.target.value } })} dir="auto" className="py-1.5 text-[13px]" data-testid="bank-owner" /><Recall value={c.bank.owner} memo={mem['bank.owner']} onPick={(v) => up({ bank: { ...c.bank, owner: v } })} /></label>
          <label className="flex flex-col gap-1"><SectionTitle>رقم الحساب</SectionTitle><Input value={c.bank.account} onChange={(e) => up({ bank: { ...c.bank, account: e.target.value } })} dir="ltr" className="py-1.5 text-[13px]" data-testid="bank-account" /><Recall value={c.bank.account} memo={mem['bank.account']} onPick={(v) => up({ bank: { ...c.bank, account: v } })} /></label>
          <label className="flex flex-col gap-1"><SectionTitle>IBAN</SectionTitle><Input value={c.bank.iban} onChange={(e) => up({ bank: { ...c.bank, iban: e.target.value } })} dir="ltr" className="py-1.5 text-[13px]" data-testid="bank-iban" /><Recall value={c.bank.iban} memo={mem['bank.iban']} onPick={(v) => up({ bank: { ...c.bank, iban: v } })} /></label>
          {!emp && <label className="flex flex-col gap-1"><SectionTitle>Swift</SectionTitle><Input value={c.bank.swift} onChange={(e) => up({ bank: { ...c.bank, swift: e.target.value } })} dir="ltr" className="py-1.5 text-[13px]" /><Recall value={c.bank.swift} memo={mem['bank.swift']} onPick={(v) => up({ bank: { ...c.bank, swift: v } })} /></label>}
        </div>
      </Group>
  )
  const blkSigners = (
      <Group title={t('secSigners')} anchor="signers">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><SectionTitle>{t('secHawamish')} · {t('signerName')}</SectionTitle><Input value={c.signers.hawamish.name} onChange={(e) => up({ signers: { ...c.signers, hawamish: { ...c.signers.hawamish, name: e.target.value } } })} dir="auto" className="py-1.5 text-[13px]" data-testid="signer-hawamish-name" /><Recall value={c.signers.hawamish.name} memo={mem['signers.hawamish.name']} onPick={(v) => up({ signers: { ...c.signers, hawamish: { ...c.signers.hawamish, name: v } } })} /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('signerCapacity')}</SectionTitle><Input value={c.signers.hawamish.capacity} onChange={(e) => up({ signers: { ...c.signers, hawamish: { ...c.signers.hawamish, capacity: e.target.value } } })} dir="auto" className="py-1.5 text-[13px]" /><Recall value={c.signers.hawamish.capacity} memo={mem['signers.hawamish.capacity']} onPick={(v) => up({ signers: { ...c.signers, hawamish: { ...c.signers.hawamish, capacity: v } } })} /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('secCounterparty')} · {t('signerName')}</SectionTitle><Input value={c.signers.counterparty.name} onChange={(e) => up({ signers: { ...c.signers, counterparty: { ...c.signers.counterparty, name: e.target.value } } })} dir="auto" className="py-1.5 text-[13px]" /><Recall value={c.signers.counterparty.name} memo={mem['signers.counterparty.name']} onPick={(v) => up({ signers: { ...c.signers, counterparty: { ...c.signers.counterparty, name: v } } })} /></label>
          <label className="flex flex-col gap-1"><SectionTitle>{t('signerCapacity')}</SectionTitle><Input value={c.signers.counterparty.capacity} onChange={(e) => up({ signers: { ...c.signers, counterparty: { ...c.signers.counterparty, capacity: e.target.value } } })} dir="auto" className="py-1.5 text-[13px]" /><Recall value={c.signers.counterparty.capacity} memo={mem['signers.counterparty.capacity']} onPick={(v) => up({ signers: { ...c.signers, counterparty: { ...c.signers.counterparty, capacity: v } } })} /></label>
        </div>
      </Group>
  )
  const blkNote = (
      <label className="flex flex-col gap-1"><SectionTitle>{t('noteToClient')}</SectionTitle><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('noteToClientPh')} dir="auto" className="py-1.5 text-[13px]" data-testid="editor-note" /></label>
  )
  const pickLabel = (id: string) => {
    if (id.startsWith('sec:')) {
      const sec = c.sections.find((x) => x.num === id.slice(4))
      return sec ? `${sec.num} · ${sec.title}` : ''
    }
    return ({ salary: t('secSalary'), pricing: t('secPricing'), scope: c.kind === 'offer' ? 'تمهيد' : t('secScope'), tracks: t('secVars'), packages: t('secPackages'), parties: t('secParties'), bank: t('secBank'), signers: t('secSigners'), basics: t('secBasics') } as Record<string, string>)[id] ?? ''
  }
  const panelFor = (id: string) => {
    if (id.startsWith('sec:')) {
      const k = c.sections.findIndex((x) => x.num === id.slice(4))
      const sec = c.sections[k]
      if (!sec) return null
      return (
        <SectionPanel
          title={sec.title}
          body={sec.body}
          fixed={!!sec.fixed}
          locked={!!sec.fixed && !unlocked.has(sec.num)}
          onUnlock={() => toggleLock(sec.num)}
          onExpand={() => setFocusSec(sec.num)}
          changedNote={<ChangedNote original={originalIfChanged(sec)} onRestore={(o) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, title: o.title, body: o.body } : x)) })} testId={`panel-changed-${sec.num}`} />}
          onTitle={(v) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, title: v } : x)) })}
          onBody={(v) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, body: v } : x)) })}
        />
      )
    }
    if (id === 'pricing') return <>{blkVars}{blkPricing}</>
    if (id === 'tracks') return <>{blkVars}{blkTracks}</>
    return ({ salary: blkSalary, scope: blkScope, packages: blkPackages, parties: blkParties, bank: blkBank, signers: blkSigners, basics: blkBasics } as Record<string, React.ReactNode>)[id] ?? null
  }
  const form = (
    <div className="flex flex-col gap-5 min-w-0">
      {blkBasics}{blkParties}{blkSalary}{blkVars}{blkPricing}{blkTracks}{blkPackages}{blkScope}{blkSections}{blkBank}{blkSigners}{blkNote}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[75] bg-card flex flex-col anim-fade" role="dialog" aria-label={t('editContract')} data-testid="contract-editor">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border flex-wrap">
        <span className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: c.accent }} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold truncate" dir="auto">{t('editContract')} · {c.title}</div>
          <div className="text-[11px] text-fg-secondary">{current ? `${t('version')} ${current.number}` : t('noVersionYet')}{dirtyContent && current ? ' · ' + t('unsavedChanges') : ''}</div>
        </div>
        {narrow && <SegmentedMini value={tab} onChange={setTab} labels={[t('secSections'), t('openPaper')]} />}
        {overflow.length > 0 && <span className="text-[11.5px] text-accent font-semibold max-w-[320px] truncate" title={overflowText} data-testid="overflow-warning">⚠ {overflowText}</span>}
        {missingList.length > 0 && (
          <button type="button" onClick={() => goToField(missingList[0].field)} className="text-[11.5px] text-warning-dark font-semibold max-w-[360px] truncate rounded-md border border-warning-dark/40 bg-warning-tint/40 px-2.5 py-1 cursor-pointer hover:bg-warning-tint/70" title={missing.join(' · ')} data-testid="missing-values">
            {t('missingGo', { what: missingList[0].label })}{missingList.length > 1 ? ` (+${missingList.length - 1})` : ''} ←
          </button>
        )}
        <Button disabled={busy || !dirtyContent} onClick={() => void save()} data-testid="save-version">
          <Save size={14} /> {t('saveVersion')}
        </Button>
        <Button variant="primary" disabled={busy || core.length > 0 || overflow.length > 0} onClick={() => setSigning(true)} title={overflow.length > 0 ? overflowText : undefined} data-testid="sign-send">
          <Send size={14} /> {t('signAndSend')}
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label={t('cancel')}>
          <X size={16} />
        </Button>
      </div>
      {elsewhere !== null && (
        <div className="flex items-center gap-3 px-4 py-2 bg-warning-tint/40 border-b border-border text-[12.5px]" role="alert" data-testid="version-elsewhere">
          <span className="flex-1">{t('versionElsewhere', { n: elsewhere })}</span>
          <Button size="sm" variant="ghost" onClick={() => { replaceWith(fresh()); setElsewhere(null) }} data-testid="take-their-version">{t('takeTheirVersion')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setElsewhere(null)}>{t('keepMine')}</Button>
        </div>
      )}
      {draftFailed && (
        <div className="px-4 py-2 bg-warning-tint/40 border-b border-border text-[12.5px] text-warning-dark" role="alert" data-testid="draft-failed">{t('draftFailed')}</div>
      )}
      {restoredAt && (
        <div className="flex items-center gap-3 px-4 py-2 bg-warning-tint/40 border-b border-border text-[12.5px] flex-wrap" role="status" data-testid="draft-restored">
          {!confirmDiscard ? (
            <>
              <span className="flex-1 min-w-0">{t('draftRestored', { time: fmtTime(restoredAt, lang) })}</span>
              <Button size="sm" variant="primary" onClick={() => setRestoredAt(null)} data-testid="draft-restored-ok">{t('draftRestoredOk')}</Button>
              <Button size="sm" variant="ghost" className="text-fg-secondary" onClick={() => setConfirmDiscard(true)} data-testid="discard-ask">{t('discardAsk')}</Button>
            </>
          ) : (
            <>
              <span className="flex-1 min-w-0 font-semibold text-danger-dark">{t('discardConfirm')}</span>
              <Button size="sm" variant="ghost" className="text-danger-dark" onClick={discardDraft} data-testid="discard-draft">{t('discardYes')}</Button>
              <Button size="sm" variant="primary" onClick={() => setConfirmDiscard(false)}>{t('discardNo')}</Button>
            </>
          )}
        </div>
      )}
      {undo && (
        <div className="flex items-center gap-3 px-4 py-2 bg-info-tint/40 border-b border-border text-[12.5px]" role="status" data-testid="undo-bar">
          <span className="flex-1">{t('discardedUndo')}</span>
          <Button size="sm" variant="primary" onClick={() => { setC(undo.c); setNote(undo.note); setUndo(null) }} data-testid="undo-discard">{t('undo')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setUndo(null)} aria-label={t('cancel')}><X size={14} /></Button>
        </div>
      )}
      {/* relative: on a narrow screen the hidden paper tab stays laid out underneath, so the overflow check still measures it */}
      <div className={cn('flex-1 min-h-0 grid relative', narrow ? 'grid-cols-1' : 'grid-cols-[minmax(380px,520px)_1fr]')}>
        <div ref={formScroll} className={cn('min-h-0 overflow-y-auto no-scrollbar p-4 border-e border-border', narrow && tab !== 'form' && 'hidden')}>
          <div className="text-[11.5px] text-fg-secondary mb-3">{t('saveVersionHint')}</div>
          {form}
        </div>
        <div ref={smallScroll} className={cn('min-h-0 paper-preview relative cursor-zoom-in', narrow && tab !== 'paper' && 'invisible absolute inset-0 -z-10 pointer-events-none')} aria-hidden={narrow && tab !== 'paper' ? true : undefined} onClick={(e) => openPaper(e.target)} title={t('openPaperBig')}>
          <Button size="sm" className="sticky top-3 z-[2] ms-3 mt-3 shadow" onClick={(e) => { e.stopPropagation(); openPaper() }} data-testid="open-paper-big">
            <Maximize2 size={14} /> {t('openPaperBig')}
          </Button>
          <ContractPaper content={c} number={contract.number} version={current && !dirtyContent ? current : undefined} stamp={legal.stamp || undefined} scale={narrow ? 0.45 : 0.62} onOverflow={paperBig ? undefined : setOverflow} />
        </div>
      </div>
      {paperBig && (
        <div className="fixed inset-0 z-[80] bg-muted-bg flex flex-col anim-fade" role="dialog" aria-label={t('openPaperBig')} data-testid="paper-big">
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-card flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold truncate" dir="auto">{c.title}</div>
              <div className="text-[11.5px] text-fg-secondary">{t('paperBigHint')}</div>
            </div>
            {overflow.length > 0 && <span className="text-[12px] text-accent font-semibold max-w-[360px] truncate" title={overflowText}>⚠ {overflowText}</span>}
            {missingList.length > 0 && (
              <button type="button" onClick={() => goToField(missingList[0].field)} className="text-[12px] text-warning-dark font-semibold max-w-[320px] truncate rounded-md border border-warning-dark/40 bg-warning-tint/40 px-2.5 py-1 cursor-pointer" title={missing.join(' · ')} data-testid="missing-values-big">
                {t('missingGo', { what: missingList[0].label })} ←
              </button>
            )}
            <div className="flex items-center gap-1 rounded-md border border-border bg-bg px-1">
              <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))} aria-label={t('zoomOut')} data-testid="paper-zoom-out"><Minus size={15} /></Button>
              <span className="w-[46px] text-center text-[12.5px] tabular-nums" data-testid="paper-zoom">{Math.round(zoom * 100)}%</span>
              <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(1.8, Math.round((z + 0.1) * 10) / 10))} aria-label={t('zoomIn')} data-testid="paper-zoom-in"><Plus size={15} /></Button>
            </div>
            <Button variant="primary" onClick={closePaper} data-testid="paper-big-close"><Minimize2 size={16} /> {t('collapseSection')}</Button>
          </div>
          <div className="flex-1 min-h-0 flex">
            {pick && (
              <aside className="w-[440px] max-w-[46vw] shrink-0 border-e border-border bg-card flex flex-col min-h-0" data-testid="paper-panel">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                  <div className="flex-1 text-[14px] font-semibold">{pickLabel(pick)}</div>
                  <Button size="icon" variant="ghost" onClick={() => setPick(null)} aria-label={t('cancel')}><X size={16} /></Button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">{panelFor(pick)}</div>
              </aside>
            )}
            <div ref={bigScroll} className="flex-1 min-w-0 overflow-auto py-6" onClick={() => setPick(null)} data-testid="paper-big-scroll">
              <ContractPaper content={c} number={contract.number} version={current && !dirtyContent ? current : undefined} stamp={legal.stamp || undefined} scale={zoom} onPick={setPick} active={pick} onOverflow={setOverflow} />
            </div>
          </div>
        </div>
      )}
      {focusSec && (() => {
        if (focusSec === 'scope') return <SectionFocus num="" title={c.kind === 'offer' ? 'تمهيد' : t('secScope')} body={c.scope} locked={false} onBody={(v) => up({ scope: v })} onClose={() => setFocusSec(null)} />
        const k = c.sections.findIndex((x) => x.num === focusSec)
        const sec = c.sections[k]
        if (!sec) return null
        return (
          <SectionFocus
            num={sec.num}
            title={sec.title}
            body={sec.body}
            locked={!!sec.fixed && !unlocked.has(sec.num)}
            onUnlock={() => toggleLock(sec.num)}
            onTitle={(v) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, title: v } : x)) })}
            onBody={(v) => up({ sections: c.sections.map((x, j) => (j === k ? { ...x, body: v } : x)) })}
            onClose={() => setFocusSec(null)}
          />
        )
      })()}
      {signing && <SignDialog title={t('signAndSend')} defaultName={c.signers.hawamish.name} defaultCapacity={c.signers.hawamish.capacity} onConfirm={signAndSend} onClose={() => setSigning(false)} busy={busy} gaps={missingList} onGo={(f) => { setSigning(false); goToField(f) }} />}
    </div>
  )
}

/** The text fields «ذاكرة العقد» covers, flattened to keys like «counterparty.phone». Empty values are skipped. */
const PARTY_KEYS = ['name', 'cr', 'country', 'city', 'repTitle', 'repName', 'phone', 'email', 'nationalId'] as const
function recallValues(x: ContractContent): Record<string, string> {
  const o: Record<string, string> = {}
  const add = (k: string, v?: string) => {
    if (v && v.trim()) o[k] = v
  }
  for (const side of ['counterparty', 'hawamish'] as const) for (const f of PARTY_KEYS) add(`${side}.${f}`, x[side]?.[f])
  add('project', x.project)
  add('jobTitle', x.jobTitle)
  for (const f of ['owner', 'account', 'iban', 'swift'] as const) add(`bank.${f}`, x.bank?.[f])
  for (const who of ['hawamish', 'counterparty'] as const) for (const f of ['name', 'capacity'] as const) add(`signers.${who}.${f}`, x.signers?.[who]?.[f])
  return o
}

/** Tap-to-fill suggestions under a field (the job, the term); the picked one is marked. */
function Chips({ list, value, onPick, testId }: { list: string[]; value: string; onPick: (v: string) => void; testId: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-0.5">
      {list.map((x) => (
        <button key={x} type="button" onClick={() => onPick(x)} data-testid={testId} aria-pressed={value.trim() === x}
          className={cn('rounded-full border px-2.5 py-1 text-[11.5px] cursor-pointer', value.trim() === x ? 'border-fg bg-fg text-bg' : 'border-border hover:border-fg-faint')}>
          {x}
        </button>
      ))}
    </div>
  )
}

/** Under an EMPTY field that held something in this contract: one tap puts it back. */
function Recall({ value, memo, onPick }: { value: string; memo?: string; onPick: (v: string) => void }) {
  const { t } = useStr()
  if (value.trim() || !memo) return null
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(memo)} className="recall-pill self-start max-w-full truncate rounded-md border border-border bg-muted-bg px-2 py-0.5 text-[11.5px] text-fg-secondary cursor-pointer" title={t('recallHint')} data-testid="recall" dir="auto">
      ↩ {memo}
    </button>
  )
}

// module-level (not inside ContractEditor) so the input keeps focus while typing
function Num({ label, value, onChange, suffix, testId, hint, optional }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; testId?: string; hint?: string; optional?: boolean }) {
  const { t } = useStr()
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <SectionTitle>{label}</SectionTitle>
      {/* the unit sits BESIDE the field, never inside it: inside, it covered the LTR number (1 Nov) */}
      <div className="flex items-center gap-2 -mt-1">
        <Input value={value === 0 ? '' : String(value)} onChange={(e) => onChange(num(e.target.value))} placeholder="0" dir="ltr" inputMode="numeric" className={cn('flex-1 min-w-0 py-2 text-[13px] tabular-nums', value === 0 && !optional && 'border-warning-dark/50 bg-warning-tint/30')} data-testid={testId} />
        {suffix && <span className="shrink-0 whitespace-nowrap text-[11px] text-fg-muted" data-testid={testId ? `${testId}-unit` : undefined}>{suffix}</span>}
      </div>
      {hint && <span className="text-[10.5px] text-fg-secondary leading-snug">{hint}</span>}
      {value === 0 && !optional && <span className="text-[10.5px] text-warning-dark">{t('suggested')}</span>}
    </label>
  )
}

function PartyFields({ k, p, full, person, onChange: upParty, mem }: { k: 'hawamish' | 'counterparty'; p: ContractPartyInfo; full: boolean; person?: boolean; onChange: (k: 'hawamish' | 'counterparty', patch: Partial<ContractPartyInfo>) => void; mem: Record<string, string> }) {
  const { t } = useStr()
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fName')}</SectionTitle><Input value={p.name} onChange={(e) => upParty(k, { name: e.target.value })} dir="auto" className="py-1.5 text-[13px]" data-testid={`${k}-name`} /><Recall value={p.name} memo={mem[`${k}.name`]} onPick={(v) => upParty(k, { name: v })} /></label>
      {/* a person (the employee in «عقد عمل»): no CR, no representative — name, ID, country, phone, e-mail */}
      {!person && <label className="flex flex-col gap-1"><SectionTitle>{t('fCr')}</SectionTitle><Input value={p.cr} onChange={(e) => upParty(k, { cr: e.target.value })} dir="ltr" className="py-1.5 text-[13px]" data-testid={`${k}-cr`} /><Recall value={p.cr} memo={mem[`${k}.cr`]} onPick={(v) => upParty(k, { cr: v })} /></label>}
      <label className="flex flex-col gap-1"><SectionTitle>{t('fCountry')}</SectionTitle><Input value={p.country} onChange={(e) => upParty(k, { country: e.target.value })} dir="auto" className="py-1.5 text-[13px]" /><Recall value={p.country} memo={mem[`${k}.country`]} onPick={(v) => upParty(k, { country: v })} /></label>
      {full && <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fCity')}</SectionTitle><Input value={p.city} onChange={(e) => upParty(k, { city: e.target.value })} dir="auto" className="py-1.5 text-[13px]" data-testid={`${k}-city`} /><Recall value={p.city} memo={mem[`${k}.city`]} onPick={(v) => upParty(k, { city: v })} /></label>}
      {!person && <label className="flex flex-col gap-1"><SectionTitle>{t('fRepTitle')}</SectionTitle><Input value={p.repTitle} onChange={(e) => upParty(k, { repTitle: e.target.value })} dir="auto" className="py-1.5 text-[13px]" /><Recall value={p.repTitle} memo={mem[`${k}.repTitle`]} onPick={(v) => upParty(k, { repTitle: v })} /></label>}
      {!person && <label className="flex flex-col gap-1"><SectionTitle>{t('fRepName')}</SectionTitle><Input value={p.repName} onChange={(e) => upParty(k, { repName: e.target.value })} dir="auto" className="py-1.5 text-[13px]" data-testid={`${k}-rep`} /><Recall value={p.repName} memo={mem[`${k}.repName`]} onPick={(v) => upParty(k, { repName: v })} /></label>}
      <label className="flex flex-col gap-1"><SectionTitle>{t('fPhone')}</SectionTitle><Input value={p.phone} onChange={(e) => upParty(k, { phone: e.target.value })} dir="ltr" inputMode="tel" className="py-1.5 text-[13px]" data-testid={`${k}-phone`} /><Recall value={p.phone} memo={mem[`${k}.phone`]} onPick={(v) => upParty(k, { phone: v })} /></label>
      <label className="flex flex-col gap-1"><SectionTitle>{t('fEmail')}</SectionTitle><Input value={p.email} onChange={(e) => upParty(k, { email: e.target.value })} dir="ltr" inputMode="email" className="py-1.5 text-[13px]" data-testid={`${k}-email`} /><Recall value={p.email} memo={mem[`${k}.email`]} onPick={(v) => upParty(k, { email: v })} /></label>
      <label className="flex flex-col gap-1"><SectionTitle>{t('fNationalId')}</SectionTitle><Input value={p.nationalId} onChange={(e) => upParty(k, { nationalId: e.target.value })} dir="ltr" className="py-1.5 text-[13px]" data-testid={`${k}-nid`} /><Recall value={p.nationalId} memo={mem[`${k}.nationalId`]} onPick={(v) => upParty(k, { nationalId: v })} /></label>
    </div>
  )
}

// «المنصات» as tap-to-pick chips (1 Nov: he wanted choices, not typing). Stored as before: «Instagram · X», so
// old contracts and the paper text keep working; anything typed by hand stays as its own chip.
// his list (1 Nov): Twitter is «تويتر» (not «إكس»); no Facebook / Telegram / Pinterest
const PLATFORMS: [string, string][] = [
  ['Instagram', 'إنستقرام'],
  ['Twitter', 'تويتر'],
  ['TikTok', 'تيك توك'],
  ['Snapchat', 'سناب شات'],
  ['YouTube', 'يوتيوب'],
  ['LinkedIn', 'لينكدإن'],
  ['Threads', 'ثريدز'],
  ['WhatsApp', 'واتساب'],
]
/** older drafts saved «X» for Twitter */
const ALIAS: Record<string, string> = { X: 'Twitter' }
function PlatformPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useStr()
  const [other, setOther] = useState('')
  const picked = value.split('·').map((x) => ALIAS[x.trim()] ?? x.trim()).filter(Boolean)
  const known = new Set(PLATFORMS.map(([en]) => en))
  const extras = picked.filter((p) => !known.has(p))
  const write = (list: string[]) => onChange([...PLATFORMS.map(([en]) => en).filter((en) => list.includes(en)), ...list.filter((p) => !known.has(p))].join(' · '))
  const toggle = (p: string) => write(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p])
  const addOther = () => {
    const v = other.trim()
    if (v && !picked.includes(v)) write([...picked, v])
    setOther('')
  }
  const chip = (on: boolean) => cn('rounded-full border px-3 py-1 text-[12.5px] cursor-pointer transition-colors', on ? 'bg-fg text-bg border-fg' : 'bg-bg border-border hover:border-fg-muted')
  return (
    <div className="flex flex-wrap gap-1.5 items-center" data-testid="vars-platforms">
      {PLATFORMS.map(([en, ar]) => (
        <button key={en} type="button" aria-pressed={picked.includes(en)} onClick={() => toggle(en)} className={chip(picked.includes(en))} data-testid={`platform-${en}`}>
          {ar}
        </button>
      ))}
      {extras.map((p) => (
        <button key={p} type="button" aria-pressed onClick={() => toggle(p)} className={chip(true)} title={t('mediaRemove')}>
          {p} ×
        </button>
      ))}
      <Input value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOther() } }} onBlur={addOther} placeholder={t('otherPlatform')} dir="auto" className="py-1 text-[12.5px] w-[140px]" data-testid="platform-other" />
    </div>
  )
}

/** «معدّل»: this clause differs from the manager's template. Team-only (form + side panel) — never on the paper. Tap to
 *  see the original text and put it back. */
function ChangedNote({ original, onRestore, testId }: { original: { num: string; title: string; body: string; fixed?: boolean } | null; onRestore: (o: { title: string; body: string }) => void; testId: string }) {
  const { t } = useStr()
  const [open, setOpen] = useState(false)
  if (!original) return null
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="self-start rounded-md bg-warning-tint text-warning-dark text-[11px] font-bold px-2 py-0.5 cursor-pointer" aria-expanded={open} data-testid={testId}>
        ✎ {t('changedFromTemplate')} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="rounded-md border border-border bg-muted-bg p-2.5 flex flex-col gap-2 text-[12px]" data-testid={`${testId}-original`}>
          <div className="font-semibold text-fg-secondary">{t('originalText')} · {original.title}</div>
          <div className="whitespace-pre-wrap leading-relaxed text-fg-secondary max-h-[220px] overflow-y-auto" dir="auto">{original.body}</div>
          <Button size="sm" variant="ghost" className="self-start" onClick={() => { onRestore(original); setOpen(false) }} data-testid={`${testId}-restore`}>{t('restoreOriginal')}</Button>
        </div>
      )}
    </div>
  )
}

/** A clause in the big-paper side panel: raw text with its {placeholders}, the paper beside it updates as he types. */
function SectionPanel({ title, body, fixed, locked, onUnlock, onExpand, onTitle, onBody, changedNote }: { title: string; body: string; fixed: boolean; locked: boolean; onUnlock: () => void; onExpand: () => void; onTitle: (v: string) => void; onBody: (v: string) => void; changedNote?: React.ReactNode }) {
  const { t } = useStr()
  return (
    <div className="flex flex-col gap-3 min-h-full">
      {locked && (
        <div className="flex items-center gap-2 rounded-md bg-muted-bg px-3 py-2 text-[12px]">
          <Lock size={14} className="shrink-0" />
          <span className="flex-1">{t('lockedExplain')}</span>
          <Button size="sm" onClick={onUnlock} data-testid="panel-unlock">{t('unlockNow')}</Button>
        </div>
      )}
      {/* 1 Nov: once unlocked there was no way back, and no full-screen like in the form */}
      <div className="flex items-center gap-2 justify-end">
        {fixed && !locked && (
          <Button size="sm" variant="ghost" onClick={onUnlock} data-testid="panel-relock">
            <Lock size={14} /> {t('lockAgain')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onExpand} data-testid="panel-expand">
          <Maximize2 size={14} /> {t('expandSection')}
        </Button>
      </div>
      {changedNote}
      <Input value={title} onChange={(e) => onTitle(e.target.value)} disabled={locked} dir="auto" className="py-2 text-[16px] font-semibold" data-testid="panel-title" />
      <textarea value={body} onChange={(e) => onBody(e.target.value)} readOnly={locked} dir="auto" className={cn(field, 'flex-1 min-h-[50vh] text-[16px] leading-[1.95] resize-none', locked && 'opacity-70')} data-testid="panel-body" />
      <div className="text-[11px] text-fg-secondary leading-relaxed">{t('sectionsNote')}</div>
    </div>
  )
}

/** One clause on the whole screen, big type, to read and edit in comfort (1 Nov: «أكبّره وآخذ راحتي»). */
function SectionFocus({ num, title, body, locked, onUnlock, onTitle, onBody, onClose }: { num: string; title: string; body: string; locked: boolean; onUnlock?: () => void; onTitle?: (v: string) => void; onBody: (v: string) => void; onClose: () => void }) {
  const { t } = useStr()
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[85] bg-card flex flex-col anim-fade" role="dialog" aria-label={title} data-testid="section-focus">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
        {num && <span className="text-[18px] font-bold tabular-nums">{num}</span>}
        {onTitle ? (
          <Input value={title} onChange={(e) => onTitle(e.target.value)} disabled={locked} dir="auto" className="flex-1 py-2 text-[18px] font-semibold" />
        ) : (
          <div className="flex-1 text-[18px] font-semibold" dir="auto">{title}</div>
        )}
        {locked && onUnlock && (
          <Button size="sm" variant="ghost" onClick={onUnlock}>
            <Lock size={14} /> <span className="text-[12px]">{t('fixedSection')}</span>
          </Button>
        )}
        {/* the same corner icon that opened it, reversed: «صغّر» brings him back to the form (1 Nov) */}
        <Button variant="primary" onClick={onClose} aria-label={t('collapseSection')} title={t('collapseSection')} data-testid="section-focus-done">
          <Minimize2 size={16} /> {t('collapseSection')}
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <textarea value={body} onChange={(e) => onBody(e.target.value)} readOnly={locked} dir="auto" autoFocus={!locked} className={cn('block w-full max-w-[920px] min-h-full mx-auto px-6 py-8 bg-transparent text-[21px] leading-[2.1] outline-none resize-none', locked && 'opacity-75')} data-testid="section-focus-body" />
      </div>
    </div>
  )
}

function Group({ title, hint, note, anchor, children }: { title: string; hint?: string; note?: string; anchor?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-md" data-anchor={anchor}>
      <div className="text-[13px] font-semibold border-b border-border pb-1">{title}</div>
      {hint && <div className="text-[11px] text-warning-dark">{hint}</div>}
      {note && <div className="text-[11.5px] text-fg-secondary leading-relaxed">{note}</div>}
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
