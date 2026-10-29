import { useState, type FormEvent } from 'react'
import { PenLine, X } from 'lucide-react'
import { useStr } from '@/lib/useStr'
import type { SignatureInput } from '@/types'
import { Button, Input, SectionTitle } from '../ui'
import { SignaturePad } from './SignaturePad'

/** Name + capacity + a drawn / uploaded signature + the acknowledgement checkbox. Used by both sides. */
export function SignDialog({ title, defaultName, defaultCapacity, onConfirm, onClose, busy }: { title: string; defaultName?: string; defaultCapacity?: string; onConfirm: (sig: SignatureInput) => Promise<void> | void; onClose: () => void; busy?: boolean }) {
  const { t } = useStr()
  const [name, setName] = useState(defaultName ?? '')
  const [capacity, setCapacity] = useState(defaultCapacity ?? '')
  const [sig, setSig] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  const can = !!name.trim() && !!sig && ack && !busy
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!can || !sig) return
    void onConfirm({ signature: sig, name: name.trim(), capacity: capacity.trim() })
  }
  return (
    <div className="fixed inset-0 z-[92] bg-black/40 grid place-items-center p-4 anim-fade" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-[min(560px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet max-h-[92dvh] overflow-y-auto no-scrollbar" role="dialog" aria-label={title} data-testid="sign-dialog">
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em] inline-flex items-center gap-2">
            <PenLine size={18} /> {title}
          </div>
          <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label={t('cancel')}>
            <X size={16} />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <SectionTitle>{t('signerName')}</SectionTitle>
            <Input value={name} onChange={(e) => setName(e.target.value)} dir="auto" className="-mt-1 py-2 text-[13px]" required data-testid="sign-name" />
          </label>
          <label className="flex flex-col gap-1.5">
            <SectionTitle>{t('signerCapacity')}</SectionTitle>
            <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder={t('signerCapacityPh')} dir="auto" className="-mt-1 py-2 text-[13px]" data-testid="sign-capacity" />
          </label>
        </div>
        <SignaturePad value={sig} onChange={setSig} />
        <label className="flex items-start gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" data-testid="sign-ack" />
          <span>{t('signatureAck')}</span>
        </label>
        <div className="text-[11px] text-fg-muted">{t('signatureHint')}</div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!can} data-testid="sign-confirm">
            {busy ? t('uploading') : title}
          </Button>
        </div>
      </form>
    </div>
  )
}
