import { useMemo, useState } from 'react'
import { FileSignature, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import type { Contract } from '@/types'
import { contractStatusTone, contractTotal, contractsNeedingAction, currencyShort, fmtAmount, visibleContracts } from '@/lib/contracts'
import { Button, Segmented } from '../ui'
import { BrandTile } from '../BrandTile'
import { NewContractDialog } from './NewContractDialog'

type Filter = 'action' | 'all' | 'archive'

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
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const admin = me.role === 'admin'
  const legalMissing = [
    !s.legal?.party.name?.trim() && t('legalName'),
    !s.legal?.party.cr?.trim() && t('legalCr'),
    !s.legal?.signer.name?.trim() && t('legalSigner'),
    !s.legal?.banks.some((b) => b.iban?.trim()) && t('legalIban'),
  ].filter(Boolean) as string[]
  const action = contractsNeedingAction(contracts, me.role)
  const list = contracts
    // «الحالية» = everything not yet in the archive (completed / rejected), so the two tabs never repeat (2 Nov)
    .filter((c) => (filter === 'all' ? c.status !== 'completed' && c.status !== 'rejected' : filter === 'archive' ? c.status === 'completed' || c.status === 'rejected' : admin ? c.status === 'changes' || c.status === 'signed' || (c.status === 'draft' && c.currentVersion > 0) : c.status === 'sent' || c.status === 'opened'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="flex-1 min-h-0 rounded-md border border-border bg-card flex flex-col" data-testid="contracts-board">
      <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-border">
        <div className="text-[15px] font-semibold">{t('contractsTitle')}</div>
        {action > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-accent-fg text-[11px] font-bold grid place-items-center">{action}</span>}
        <div className="flex-1" />
        <Segmented
          size="sm"
          value={filter}
          options={[
            { value: 'action', label: admin ? t('filterAction') : t('awaitingYou') },
            { value: 'all', label: t('filterCurrent') },
            { value: 'archive', label: t('filterArchive') },
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
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4">
        {contracts.length === 0 ? (
          <Empty text={admin ? t('contractsEmptyTeam') : t('contractsEmptyClient')} />
        ) : list.length === 0 ? (
          <Empty text={t('socialEmptyFilter')} />
        ) : (
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
            {list.map((c) => (
              <ContractCard key={c.id} c={c} onOpen={() => ui.openContract(c.id)} lang={lang} />
            ))}
          </div>
        )}
      </div>
      {creating && <NewContractDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="h-full grid place-items-center text-[13px] text-fg-secondary text-center px-6">{text}</div>
}

function ContractCard({ c, onOpen, lang }: { c: Contract; onOpen: () => void; lang: 'ar' | 'en' }) {
  const { t } = useStr()
  const s = useData()
  const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined
  const creative = c.creativeId ? s.users.find((u) => u.id === c.creativeId) : undefined
  const v = s.contractVersions.find((x) => x.contractId === c.id && x.number === c.currentVersion)
  const total = v ? contractTotal(v.content) : 0
  const label = c.kind === 'offer' ? `عرض #${c.number}` : c.kind === 'employment' ? `عقد عمل #${c.number}` : `مسودة #${c.number}`
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
          <ContractStatusChip st={c.status} />
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
      </div>
    </button>
  )
}
