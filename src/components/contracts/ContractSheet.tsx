import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, FileSignature, MessageSquareWarning, Pencil, Printer, Send, ShieldBan, Trash2, Undo2, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, fmtTime, useNarrow, useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import type { ContractVersion, SignatureInput } from '@/types'
import { EMPTY_LEGAL, contractTotal, currencyShort, fmtAmount, visibleContractVersions } from '@/lib/contracts'
import { Button, SectionTitle } from '../ui'
import { ContractStatusChip } from './ContractsBoard'
import { ContractPaper } from './ContractPaper'
import { ContractEditor } from './ContractEditor'
import { SignDialog } from './SignDialog'

function when(iso: string, lang: 'ar' | 'en') {
  return `${fmtDate(iso.slice(0, 10), lang, { day: 'numeric', month: 'short' })} · ${fmtTime(iso, lang)}`
}

/**
 * The contract opened from the board: the paper of the version being looked at, the role's actions, the
 * versions and (admin) the audit trail. Admin → editor; counterparty → sign / changes / reject.
 */
export function ContractSheet() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()
  const ui = useUi()
  const sess = useSession()
  const narrow = useNarrow()
  const contract = s.contracts.find((c) => c.id === ui.contractId)
  const versions = useMemo(() => (contract && me ? visibleContractVersions(s, me, contract.id) : []), [s, me, contract])
  const current = versions.find((v) => v.number === contract?.currentVersion) ?? versions[0]
  const [pick, setPick] = useState<{ key: string; id: string } | null>(null)
  const key = `${contract?.id}:${contract?.currentVersion}`
  const view = (pick?.key === key ? versions.find((v) => v.id === pick.id) : undefined) ?? current
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState<{ who: 'hawamish' | 'counterparty'; versionId: string } | null>(null)
  const [deciding, setDeciding] = useState<'changes' | 'rejected' | null>(null)
  const [note, setNote] = useState('')
  const [printing, setPrinting] = useState(false)
  const counterparty = !!me && me.role !== 'admin'
  // the counterparty opening the current sent version = «فُتح»
  useEffect(() => {
    if (counterparty && contract?.status === 'sent' && current && !current.openedAt) void sess.markContractOpened(current.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterparty, contract?.id, contract?.status, current?.id])
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const id = window.setTimeout(() => window.print(), 150)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])
  if (!contract || !me) return null
  if (ui.contractEditing && me.role === 'admin') {
    return <ContractEditor contract={contract} current={versions.find((v) => v.number === contract.currentVersion)} onClose={() => ui.openContract(contract.id, false)} />
  }
  const client = contract.clientId ? s.clients.find((c) => c.id === contract.clientId) : undefined
  const creative = contract.creativeId ? s.users.find((u) => u.id === contract.creativeId) : undefined
  const admin = me.role === 'admin'
  const legal = s.legal ?? EMPTY_LEGAL
  const close = () => ui.openContract(null)
  const isCurrent = !!view && view.number === contract.currentVersion
  const canDecide = counterparty && (contract.status === 'sent' || contract.status === 'opened') && isCurrent && !view?.decision
  const rejectedV = contract.status === 'changes' || contract.status === 'rejected' ? versions.find((v) => v.number === contract.currentVersion && v.decision) : undefined
  const events = admin ? s.contractEvents.filter((e) => e.contractId === contract.id).sort((a, b) => b.at.localeCompare(a.at)) : []
  const total = view ? contractTotal(view.content) : 0

  const act = async (fn: () => Promise<void>, toast?: string) => {
    setBusy(true)
    try {
      await fn()
      if (toast) ui.setToast(toast, 'info')
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false)
    }
  }
  // the signature binds to the version that was on screen when the dialog opened; a newer version cancels it
  const signHawamish = (sig: SignatureInput) => act(async () => { if (!signing || signing.versionId !== current?.id) { setSigning(null); throw new Error('stale') } await sess.signContractFirst(signing.versionId, sig); setSigning(null) }, t('hawamishSigned'))
  const signCounterparty = (sig: SignatureInput) => act(async () => { if (!signing || signing.versionId !== current?.id) { setSigning(null); throw new Error('stale') } await sess.decideContract(signing.versionId, 'signed', undefined, sig); setSigning(null) }, t('contractSignedToast'))
  const evLabel = (e: string) => {
    const m: Record<string, string> = { created: t('evCreated'), version: t('evVersion'), first_signed: t('evFirstSigned'), sent: t('evSent'), withdrawn: t('evWithdrawn'), opened: t('evOpened'), signed: t('evSigned'), changes: t('evChanges'), rejected: t('evRejected'), completed: t('evCompleted') }
    return m[e] ?? e
  }

  return (
    <div
      className={cn('fixed z-[70] bg-card border border-border rounded-md shadow-[0_24px_60px_rgba(0,0,0,0.18)] flex flex-col anim-sheet overflow-hidden', narrow ? 'inset-x-0 bottom-0 top-[6%] rounded-b-none' : 'bottom-[10px] inset-x-[10px] top-[72px]')}
      style={!narrow && ui.panelOpen ? { [(lang === 'ar' ? 'right' : 'left')]: 'calc(var(--panel-w) + 20px)' } : undefined}
      role="dialog"
      aria-label={contract.title}
      data-testid="contract-sheet"
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <span className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: contract.accent }} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold truncate" dir="auto">{contract.title}</div>
          <div className="text-[11px] text-fg-secondary truncate">
            {client?.name ?? creative?.name} · <span dir="ltr">{contract.kind === 'offer' ? `عرض #${contract.number}` : `مسودة #${contract.number}`}</span>
            {total > 0 && view ? ` · ${fmtAmount(total)} ${currencyShort(view.content.pricing.currency)}` : ''}
          </div>
        </div>
        <ContractStatusChip st={contract.status} />
        <Button size="icon" variant="ghost" onClick={close} aria-label={t('cancel')}>
          <X size={16} />
        </Button>
      </div>

      <div className={cn('flex-1 min-h-0 grid', narrow ? 'grid-cols-1 overflow-y-auto no-scrollbar' : 'grid-cols-[1fr_380px]')}>
        <div className={cn('min-h-0 paper-preview', narrow && 'max-h-[60vh]')}>
          {view ? <ContractPaper content={view.content} version={view} number={contract.number} stamp={legal.stamp || undefined} scale={narrow ? 0.42 : 0.6} /> : <div className="p-6 text-[13px] text-fg-secondary text-center">{t('noVersionYet')}</div>}
        </div>

        <div className="min-h-0 overflow-y-auto no-scrollbar p-4 flex flex-col gap-4 border-s border-border">
          {rejectedV && (
            <div className="rounded-md border border-danger-dark/30 bg-danger-tint/50 p-3 flex flex-col gap-1.5" data-testid="contract-changes-banner">
              <div className="text-[13px] font-semibold text-danger-dark">{contract.status === 'changes' ? t('contractChangesBanner', { n: rejectedV.number }) : t('contractRejectedBanner', { n: rejectedV.number })}</div>
              {rejectedV.decisionNote && <div className="text-[12.5px] whitespace-pre-wrap" dir="auto" data-testid="contract-decision-note">{rejectedV.decisionNote}</div>}
            </div>
          )}

          {/* ---- counterparty: sign / changes / reject ---- */}
          {counterparty && (
            <div className="rounded-md border border-border p-4 flex flex-col gap-3" data-testid="counterparty-actions">
              {canDecide ? (
                deciding ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault()
                      if (deciding === 'changes' && !note.trim()) return
                      void act(() => sess.decideContract(view!.id, deciding, note.trim() || undefined), t('contractDecisionToast')).then(() => { setDeciding(null); setNote('') })
                    }}
                  >
                    <div className="text-[13px] font-semibold">{deciding === 'changes' ? t('requestContractChanges') : t('rejectContract')}</div>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={deciding === 'changes' ? t('changesNotePh') : t('rejectNotePh')} dir="auto" autoFocus className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] resize-y" data-testid="contract-note" />
                    <div className="flex gap-2 justify-end">
                      <Button type="button" onClick={() => setDeciding(null)}>{t('cancel')}</Button>
                      <Button type="submit" variant="primary" disabled={busy || (deciding === 'changes' && !note.trim())}>{t('sendChanges')}</Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="text-[14px] font-semibold">{t('cstatusSent')}</div>
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="primary" className="bg-success hover:bg-success-dark px-5" disabled={busy} onClick={() => current && setSigning({ who: 'counterparty', versionId: current.id })} data-testid="sign-contract">
                        <FileSignature size={15} /> {t('signContract')}
                      </Button>
                      <Button variant="dark" disabled={busy} onClick={() => setDeciding('changes')}>
                        <MessageSquareWarning size={15} /> {t('requestContractChanges')}
                      </Button>
                      <Button disabled={busy} onClick={() => setDeciding('rejected')}>
                        <XCircle size={15} /> {t('rejectContract')}
                      </Button>
                    </div>
                  </>
                )
              ) : (
                <ContractStatusChip st={contract.status} />
              )}
            </div>
          )}

          {/* ---- admin ---- */}
          {admin && (
            <div className="rounded-md border border-border p-4 flex flex-col gap-3" data-testid="contract-admin-actions">
              <div className="flex flex-wrap gap-2 items-center">
                {contract.status !== 'signed' && contract.status !== 'completed' && (
                  <Button variant={contract.currentVersion === 0 ? 'primary' : 'outline'} disabled={busy} onClick={() => ui.openContract(contract.id, true)} data-testid="edit-contract">
                    <Pencil size={14} /> {t('editContract')}
                  </Button>
                )}
                {contract.status === 'draft' && current && !current.firstSignature && (
                  <Button variant="dark" disabled={busy} onClick={() => current && setSigning({ who: 'hawamish', versionId: current.id })} data-testid="sign-hawamish">
                    <FileSignature size={14} /> {t('signHawamish')}
                  </Button>
                )}
                {contract.status === 'draft' && current?.firstSignature && (
                  <Button variant="primary" disabled={busy} onClick={() => act(() => sess.updateContract(contract.id, { status: 'sent' }), t('contractSentToast'))} data-testid="send-contract">
                    <Send size={14} /> {t('sendContract')}
                  </Button>
                )}
                {(contract.status === 'sent' || contract.status === 'opened') && (
                  <Button disabled={busy} onClick={() => act(() => sess.updateContract(contract.id, { status: 'draft' }), t('contractWithdrawn'))}>
                    <Undo2 size={14} /> {t('withdrawContract')}
                  </Button>
                )}
                {contract.status === 'signed' && (
                  <Button variant="primary" disabled={busy} onClick={() => act(() => sess.updateContract(contract.id, { status: 'completed' }))} data-testid="complete-contract">
                    <Check size={14} /> {t('completeContract')}
                  </Button>
                )}
                {contract.status !== 'signed' && contract.status !== 'completed' && (
                  <Button variant="ghost" size="sm" className="ms-auto text-accent hover:text-accent" disabled={busy} onClick={() => confirm(t('confirmDeleteContract')) && act(() => sess.deleteContract(contract.id)).then(close)}>
                    <Trash2 size={14} /> {t('deleteContract')}
                  </Button>
                )}
              </div>
              {client && (
                <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                  <input type="checkbox" checked={!!client.contractBlock} onChange={(e) => void act(() => sess.updateClient(client.id, { contractBlock: e.target.checked }))} data-testid="contract-block" />
                  <ShieldBan size={14} /> {t('contractBlock')}
                </label>
              )}
            </div>
          )}

          {view && (
            <Button onClick={() => setPrinting(true)} data-testid="print-contract">
              <Printer size={14} /> {t('printContract')}
            </Button>
          )}

          {/* ---- signatures summary ---- */}
          {view && (view.firstSignature || view.signature) && (
            <div className="rounded-md bg-success-tint/50 p-3 text-[12.5px] flex flex-col gap-1" data-testid="signatures-summary">
              {view.firstSignature && <div>✓ {t('hawamishSigned')}: {view.firstSigner} · {view.firstSignedAt ? when(view.firstSignedAt, lang) : ''}</div>}
              {view.signature && <div>✓ {t('counterpartySigned')} {view.signerName} ({view.signerCapacity ?? '—'}) · {view.decidedAt ? when(view.decidedAt, lang) : ''}</div>}
              <div className="text-[10.5px] text-fg-muted font-mono truncate" dir="ltr" title={view.contentHash}>{t('fingerprint')}: {view.contentHash.slice(0, 16)}…</div>
            </div>
          )}

          {/* ---- versions ---- */}
          <SectionTitle>{t('contractVersions')}</SectionTitle>
          <div className="flex flex-col gap-2 -mt-2" data-testid="contract-versions">
            {versions.map((v) => (
              <VersionRow key={v.id} v={v} active={v.id === view?.id} current={v.number === contract.currentVersion} onClick={() => setPick({ key, id: v.id })} />
            ))}
          </div>

          {/* ---- audit trail (admin) ---- */}
          {admin && events.length > 0 && (
            <>
              <SectionTitle>{t('contractTrail')}</SectionTitle>
              <ol className="flex flex-col gap-1 -mt-2 text-[11.5px]" data-testid="contract-trail">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-2 items-baseline">
                    <span className="font-semibold">{evLabel(e.event)}</span>
                    {e.version ? <span className="text-fg-muted">v{e.version}</span> : null}
                    <span className="text-fg-secondary">{s.users.find((u) => u.id === e.actor)?.name ?? e.actorRole ?? ''}</span>
                    <span className="ms-auto text-fg-muted tabular-nums" dir="ltr">{when(e.at, lang)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>

      {signing?.who === 'hawamish' && current && signing.versionId === current.id && <SignDialog title={t('signHawamish')} defaultName={current.content.signers.hawamish.name} defaultCapacity={current.content.signers.hawamish.capacity} onConfirm={signHawamish} onClose={() => setSigning(null)} busy={busy} />}
      {signing?.who === 'counterparty' && current && signing.versionId === current.id && <SignDialog title={t('signContract')} defaultName={current.content.signers.counterparty.name || me.name} defaultCapacity={current.content.signers.counterparty.capacity} onConfirm={signCounterparty} onClose={() => setSigning(null)} busy={busy} />}
      {printing && view && createPortal(<div className="print-root"><ContractPaper content={view.content} version={view} number={contract.number} stamp={legal.stamp || undefined} /></div>, document.body)}
    </div>
  )
}

function VersionRow({ v, active, current, onClick }: { v: ContractVersion; active: boolean; current: boolean; onClick: () => void }) {
  const { t, lang } = useStr()
  return (
    <button type="button" onClick={onClick} className={cn('rounded-md border px-3 py-2 text-start cursor-pointer flex flex-col gap-1', active ? 'border-fg' : 'border-border hover:border-fg-faint')} data-testid="contract-version-row">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
        <span>{t('version')} {v.number}</span>
        {current && <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 bg-muted-bg text-fg-secondary">{t('currentVersion')}</span>}
        {v.firstSignature && <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 bg-info-tint text-info">{t('hawamishSigned')}</span>}
        {v.decision && <span className={cn('text-[10.5px] font-bold rounded-md px-1.5 py-0.5', v.decision === 'signed' ? 'bg-success-tint text-success-dark' : 'bg-danger-tint text-danger-dark')}>{v.decision === 'signed' ? t('cstatusSigned') : v.decision === 'changes' ? t('cstatusChanges') : t('cstatusRejected')}</span>}
        <span className="ms-auto text-[10.5px] text-fg-muted font-medium" dir="ltr">{when(v.createdAt, lang)}</span>
      </div>
      {v.note && <div className="text-[11.5px] text-fg-secondary" dir="auto">{v.note}</div>}
      {v.decisionNote && (
        <div className="text-[12px] rounded-md bg-danger-tint text-danger-dark px-2.5 py-1.5 whitespace-pre-wrap" dir="auto">
          {v.decisionNote}
        </div>
      )}
    </button>
  )
}
