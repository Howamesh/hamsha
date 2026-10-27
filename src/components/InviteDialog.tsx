import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useStr } from '@/lib/useStr'
import { useData, useSession } from '@/store/session'
import { useUi } from '@/store/ui'
import type { Role } from '@/types'
import { Button, Input, SectionTitle, Segmented } from './ui'

/**
 * «ادعُ عضواً» — admin-only sheet. Collects e-mail, name, role (and the client for a client
 * account); the repository records the invitation and e-mails it. The toast tells the truth:
 * sent / recorded-but-not-sent / already a member.
 */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const { t } = useStr()
  const s = useData()
  const inviteMember = useSession((x) => x.inviteMember)
  const setToast = useUi((u) => u.setToast)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('creative')
  const [clientId, setClientId] = useState(s.clients[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const roles: Array<{ value: Role; label: string }> = [
    { value: 'admin', label: t('roleAdmin') },
    { value: 'creative', label: t('roleCreative') },
    { value: 'client', label: t('roleClient') },
  ]
  const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'
  const canSend = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && (role !== 'client' || !!clientId) && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSend) return
    setBusy(true)
    try {
      const r = await inviteMember({ email: email.trim(), role, name: name.trim() || undefined, clientId: role === 'client' ? clientId : undefined })
      if (r.sent) setToast(`${t('inviteSent')} ${email.trim()}`, 'info')
      else if (r.reason === 'already_registered') setToast(t('inviteAlready'), 'error')
      else setToast(t('inviteNotSent'), 'error')
      if (r.sent) onClose()
    } catch {
      /* the session store already showed the error toast */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/35 grid place-items-center p-4 anim-fade" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-[min(460px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet max-h-[92dvh] overflow-y-auto no-scrollbar" role="dialog" aria-label={t('inviteTitle')}>
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">{t('inviteTitle')}</div>
          <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label={t('cancel')}>
            <X size={16} />
          </Button>
        </div>
        <div className="-mt-2 text-[12px] text-fg-secondary">{t('inviteHint')}</div>

        <label className="flex flex-col gap-1.5">
          <SectionTitle>{t('inviteEmail')}</SectionTitle>
          <Input autoFocus type="email" inputMode="email" autoComplete="off" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required />
        </label>
        <label className="flex flex-col gap-1.5">
          <SectionTitle>{t('inviteName')}</SectionTitle>
          <Input value={name} onChange={(e) => setName(e.target.value)} dir="auto" placeholder={t('inviteName')} />
        </label>
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t('inviteRole')}</SectionTitle>
          <Segmented size="sm" value={role} options={roles} onChange={setRole} />
        </div>
        {role === 'client' && (
          <label className="flex flex-col gap-1.5 anim-fade">
            <SectionTitle>{t('inviteClient')}</SectionTitle>
            {s.clients.length === 0 ? (
              <div className="text-[12.5px] text-fg-muted">{t('inviteNoClients')}</div>
            ) : (
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={field}>
                {s.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" className="px-4" disabled={!canSend}>
            {busy ? t('inviteSending') : t('inviteSend')}
          </Button>
        </div>
      </form>
    </div>
  )
}
