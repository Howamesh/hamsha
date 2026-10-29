import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { useData, useSession } from '@/store/session'
import { useUi } from '@/store/ui'
import type { ContractKind, ContractParty } from '@/types'
import { Button, Input, SectionTitle } from '../ui'

const TITLES: Record<ContractKind, string> = {
  short: 'عقد شراكة المحتوى وتفعيل وسائل التواصل',
  full: 'عقد إنشاء وتطوير موقع إلكتروني وتفعيل التواصل الاجتماعي',
  offer: 'عرض بناء حساب تعليمي تثقيفي وإنتاج فيديوهات',
}

/** «عقد جديد» (admin): template + counterparty + title + colour → an empty draft, then the editor opens. */
export function NewContractDialog({ onClose }: { onClose: () => void }) {
  const { t } = useStr()
  const s = useData()
  const sess = useSession()
  const openContract = useUi((u) => u.openContract)
  const creatives = s.users.filter((u) => u.role === 'creative')
  const [kind, setKind] = useState<ContractKind>('full')
  const [party, setParty] = useState<ContractParty>('client')
  const [clientId, setClientId] = useState(s.clients[0]?.id ?? '')
  const [creativeId, setCreativeId] = useState(creatives[0]?.id ?? '')
  const [title, setTitle] = useState(TITLES.full)
  const [touched, setTouched] = useState(false)
  const [accent, setAccent] = useState(s.clients[0]?.color ?? '#D9B600')
  const [busy, setBusy] = useState(false)
  const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'
  const can = !!title.trim() && (party === 'client' ? !!clientId : !!creativeId) && !busy

  const pickKind = (k: ContractKind) => {
    setKind(k)
    if (!touched) setTitle(TITLES[k])
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!can) return
    setBusy(true)
    try {
      const c = await sess.createContract({ kind, party, clientId: party === 'client' ? clientId : undefined, creativeId: party === 'creative' ? creativeId : undefined, title: title.trim(), accent })
      onClose()
      openContract(c.id, true)
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-[80] bg-black/35 grid place-items-center p-4 anim-fade" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-[min(640px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet max-h-[92dvh] overflow-y-auto no-scrollbar" role="dialog" aria-label={t('newContractTitle')}>
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">{t('newContractTitle')}</div>
          <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label={t('cancel')}>
            <X size={16} />
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t('contractKind')}</SectionTitle>
          <div className="grid grid-cols-3 gap-2 -mt-1" data-testid="contract-kind">
            {(['short', 'full', 'offer'] as ContractKind[]).map((k) => (
              <button key={k} type="button" onClick={() => pickKind(k)} className={cn('rounded-md border px-3 py-3 text-[12.5px] font-semibold text-start cursor-pointer', kind === k ? 'border-fg bg-muted-bg' : 'border-border hover:border-fg-faint')} data-kind={k} aria-pressed={kind === k}>
                {t(k === 'short' ? 'kindShort' : k === 'full' ? 'kindFull' : 'kindOffer')}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <SectionTitle>{t('contractWith')}</SectionTitle>
            <select value={party} onChange={(e) => setParty(e.target.value as ContractParty)} className={cn(field, '-mt-1 cursor-pointer')} data-testid="contract-party">
              <option value="client">{t('partyClient')}</option>
              <option value="creative">{t('partyCreative')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <SectionTitle>{party === 'client' ? t('tabClients') : t('partyCreative')}</SectionTitle>
            {party === 'client' ? (
              <select value={clientId} onChange={(e) => { setClientId(e.target.value); setAccent(s.clients.find((c) => c.id === e.target.value)?.color ?? accent) }} className={cn(field, '-mt-1 cursor-pointer')} data-testid="contract-client">
                {s.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <select value={creativeId} onChange={(e) => setCreativeId(e.target.value)} className={cn(field, '-mt-1 cursor-pointer')} data-testid="contract-creative">
                {creatives.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <SectionTitle>{t('contractTitleLabel')}</SectionTitle>
          <Input value={title} onChange={(e) => { setTitle(e.target.value); setTouched(true) }} placeholder={t('contractTitlePh')} dir="auto" className="-mt-1 py-2 text-[13px]" required data-testid="contract-title" />
        </label>
        <label className="flex items-center gap-3">
          <SectionTitle>{t('accentColor')}</SectionTitle>
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-8 w-14 rounded cursor-pointer border border-border bg-bg" data-testid="contract-accent" />
          <span className="text-[11px] text-fg-muted" dir="ltr">{accent}</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!can}>
            {t('createContract')}
          </Button>
        </div>
      </form>
    </div>
  )
}
