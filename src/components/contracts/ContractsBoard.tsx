import { useMemo, useState } from 'react'
import { FileSignature, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import type { Contract } from '@/types'
import { contractPlace, contractStatusTone, contractStep, type ContractStage, contractTotal, contractsNeedingAction, currencyShort, fmtAmount, visibleContracts } from '@/lib/contracts'
import { Button, Segmented } from '../ui'
import { BrandTile } from '../BrandTile'
import { NewContractDialog } from './NewContractDialog'


export function ContractStatusChip({ st, className }: { st: Contract['status']; className?: string }) {
  const { t } = useStr()
  // a counterparty never sees a «draft»: a contract it already received shows as «قيد التعديل» (0012)
  const role = useUser()?.role
  if (st === 'draft' && role && role !== 'admin') return <span className={cn('text-[11px] font-bold rounded-md px-2 py-1 whitespace-nowrap bg-warning-tint text-warning-dark', className)} data-status="revising">{t('beingRevised')}</span>
  const key = (`cstatus${st.charAt(0).toUpperCase()}${st.slice(1)}`) as 'cstatusDraft' | 'cstatusSent' | 'cstatusOpened' | 'cstatusSigned' | 'cstatusChanges' | 'cstatusRejected' | 'cstatusCompleted'
  return <span className={cn('text-[11px] font-bold rounded-md px-2 py-1 whitespace-nowrap', contractStatusTone(st), className)} data-status={st}>{t(key)}</span>
}

/** «العقود»: one card per contract; the admin creates from a template, the counterparty sees only what was sent. */
export function ContractsBoard() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const ui = useUi()
  const contracts = useMemo(() => visibleContracts(s, me), [s, me])
  // in the store so the rail's red number can open «يحتاج تصرّف» (2 Nov)
  const filter = ui.contractsFilter
  const setFilter = ui.setContractsFilter
  const [creating, setCreating] = useState(false)
  const admin = me.role === 'admin'
  const legalMissing = [
    !s.legal?.party.name?.trim() && t('legalName'),
    !s.legal?.party.cr?.trim() && t('legalCr'),
    !s.legal?.signer.name?.trim() && t('legalSigner'),
    !s.legal?.banks.some((b) => b.iban?.trim()) && t('legalIban'),
  ].filter(Boolean) as string[]
  const action = contractsNeedingAction(contracts, me.role)
  // one place per contract (2 Nov, his pick ٥): «قيد الإعداد» → «السارية» → «المنتهية» — never in two tabs
  const placed = contracts.map((c) => {
    const v = s.contractVersions.find((x) => x.contractId === c.id && x.number === c.currentVersion)
    return { c, place: contractPlace(c, v?.content, contracts) }
  }).sort((a, b) => b.c.updatedAt.localeCompare(a.c.updatedAt))
  const count = (st: ContractStage) => placed.filter((x) => x.place.stage === st).length
  const inTab = placed.filter((x) => x.place.stage === filter)
  // «قيد الإعداد» has two groups: what waits on YOU first, then what waits on the other side (an empty group is not shown)
  const mine = filter === 'setup' ? inTab.filter((x) => { const st = contractStep(x.c, me.role); return !!st && st.key !== 'waiting' }) : inTab
  const theirs = filter === 'setup' ? inTab.filter((x) => !mine.includes(x)) : []

  return (
    <div className="flex-1 min-h-0 rounded-md border border-border bg-card flex flex-col" data-testid="contracts-board">
      <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-border">
        <div className="text-[15px] font-semibold">{t('contractsTitle')}</div>
        {action > 0 && (
          <button type="button" onClick={() => setFilter('setup')} title={t('contractsWaiting', { n: action })} className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-accent-fg text-[11px] font-bold grid place-items-center cursor-pointer">
            {action}
          </button>
        )}
        <div className="flex-1" />
        <Segmented
          size="sm"
          value={filter}
          options={[
            { value: 'setup', label: `${t('tabSetupContracts')} ${count('setup') || ''}`.trim() },
            { value: 'active', label: `${t('tabActive')} ${count('active') || ''}`.trim() },
            { value: 'ended', label: `${t('tabEnded')} ${count('ended') || ''}`.trim() },
          ]}
          onChange={setFilter}
        />
        {admin && (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)} data-testid="new-contract">
            <Plus size={14} /> {t('newContract')}
          </Button>
        )}
      </div>
      {/* council 2 Nov: production started with an EMPTY legal identity — say it before the first real contract (a warning,
          never a block: Yousef's rule «نبّهني ووديني له») */}
      {admin && legalMissing.length > 0 && (
        <button type="button" onClick={() => ui.setPanelTab('settings')} className="mx-4 mt-3 rounded-md border border-warning-dark/40 bg-warning-tint/50 px-3 py-2.5 text-start text-[12.5px] text-warning-dark font-semibold cursor-pointer hover:bg-warning-tint" data-testid="legal-missing">
          {t('legalMissingBanner', { list: legalMissing.join('، ') })}
        </button>
      )}
      {/* the red number in words — what is waiting on YOU (2 Nov, his «ما أعرف ايش سببها») */}
      {action > 0 && (
        <button type="button" onClick={() => setFilter('setup')} className="mx-4 mt-3 rounded-md border border-danger-dark/25 bg-danger-tint/60 px-3 py-2 text-start text-[12.5px] text-danger-dark font-semibold cursor-pointer" data-testid="contracts-waiting">
          {action === 1 ? t('contractsWaitingOne') : action === 2 ? t('contractsWaitingTwo') : t('contractsWaiting', { n: action })}
        </button>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4">
        {contracts.length === 0 ? (
          <Empty text={admin ? t('contractsEmptyTeam') : t('contractsEmptyClient')} />
        ) : inTab.length === 0 ? (
          <Empty text={t(filter === 'setup' ? 'emptySetup' : filter === 'active' ? 'emptyActive' : 'emptyEnded')} />
        ) : (
          <div className="flex flex-col gap-4">
            {[{ key: 'mine', title: filter === 'setup' ? t('groupMine') : '', items: mine }, { key: 'theirs', title: admin ? t('groupTheirs') : t('groupHawamish'), items: theirs }].filter((g) => g.items.length > 0).map((g) => (
              <div key={g.key} className="flex flex-col gap-2" data-testid={`contracts-group-${g.key}`}>
                {g.title && <div className={cn('text-[12.5px] font-bold', g.key === 'mine' ? 'text-danger-dark' : 'text-fg-muted')}>{g.title} ({g.items.length})</div>}
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  {g.items.map(({ c, place }) => (
                    <ContractCard key={c.id} c={c} place={place} onOpen={() => ui.openContract(c.id)} lang={lang} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {creating && <NewContractDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

const END_KEY = { completed: 'endCompleted', rejected: 'endRejected', expired: 'endExpired', renewed: 'endRenewed' } as const
const STEP_TONE = { red: 'text-danger-dark', grey: 'text-fg-secondary', green: 'text-success-dark', muted: 'text-fg-muted' } as const
const STEP_KEY = { changes: 'stepChanges', ready: 'stepReady', signed: 'stepSigned', waiting: 'stepWaiting', yourTurn: 'stepYourTurn' } as const

function Empty({ text }: { text: string }) {
  return <div className="h-full grid place-items-center text-[13px] text-fg-secondary text-center px-6">{text}</div>
}

function ContractCard({ c, place, onOpen, lang }: { c: Contract; place: ReturnType<typeof contractPlace>; onOpen: () => void; lang: 'ar' | 'en' }) {
  const { t } = useStr()
  const s = useData()
  const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined
  const creative = c.creativeId ? s.users.find((u) => u.id === c.creativeId) : undefined
  const v = s.contractVersions.find((x) => x.contractId === c.id && x.number === c.currentVersion)
  const total = v ? contractTotal(v.content) : 0
  const me = useUser()!
  const step = contractStep(c, me.role)
  const party = client?.name ?? creative?.name ?? t('otherSide')
  const label = c.kind === 'offer' ? `عرض #${c.number}` : c.kind === 'employment' ? `عقد عمل #${c.number}` : `عقد #${c.number}`
  return (
    <button type="button" onClick={onOpen} className="rounded-md border border-border bg-bg text-start cursor-pointer hover:border-fg-faint overflow-hidden flex anim-fade" data-testid="contract-card" data-status={c.status}>
      <span className="w-[6px] shrink-0" style={{ background: c.accent }} />
      <div className="p-3 flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {client ? <BrandTile client={client} size={18} /> : <FileSignature size={16} className="text-fg-secondary" />}
          <span className="text-[13px] font-semibold truncate" dir="auto">
            {c.title}
          </span>
        </div>
        <div className="text-[11.5px] text-fg-secondary truncate" dir="auto">
          {client?.name ?? creative?.name ?? '—'} · <span dir="ltr">{label}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {place.stage === 'active' ? (
            <span className="text-[11px] font-bold rounded-md px-2 py-1 whitespace-nowrap bg-success-tint text-success-dark" data-status="active">{t('stActive')}</span>
          ) : place.stage === 'ended' ? (
            <span className={cn('text-[11px] font-bold rounded-md px-2 py-1 whitespace-nowrap', place.reason === 'rejected' ? 'bg-danger-tint text-danger-dark' : 'bg-muted-bg text-fg-secondary')} data-status={`ended-${place.reason}`}>{t(END_KEY[place.reason ?? 'completed'])}</span>
          ) : (
            <ContractStatusChip st={c.status} />
          )}
          {total > 0 && v && (
            <span className="text-[11.5px] font-semibold tabular-nums" dir="ltr">
              {fmtAmount(total)} {currencyShort(v.content.pricing.currency)}
            </span>
          )}
          <span className="ms-auto text-[10.5px] text-fg-muted tabular-nums" dir="ltr">
            {fmtDate(c.updatedAt.slice(0, 10), lang, { day: 'numeric', month: 'short' })}
          </span>
        </div>
        {c.status === 'draft' && c.currentVersion === 0 && <span className="text-[10.5px] text-fg-muted">{t('noVersionYet')}</span>}
        {place.stage === 'active' && (
          <span className={cn('text-[11.5px] font-semibold leading-snug', place.graceLeft != null ? 'text-warning-dark' : 'text-fg-muted')} data-testid="contract-term-line">
            {place.graceLeft != null ? t('graceLeft', { d: place.graceLeft }) : place.end ? t('endsOn', { date: fmtDate(place.end, lang, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('noEndDate')}
          </span>
        )}
        {step && place.stage === 'setup' && (
          <span className={cn('text-[11.5px] font-semibold leading-snug', STEP_TONE[step.tone])} data-testid="contract-step" data-step={step.key} dir="auto">
            {t(STEP_KEY[step.key], { who: party })}
          </span>
        )}
      </div>
    </button>
  )
}
