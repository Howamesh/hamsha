import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useStr } from '@/lib/useStr'
import { useData, useSession } from '@/store/session'
import { useUi } from '@/store/ui'
import type { PendingInvite } from '@/types'
import { Button, SectionTitle } from './ui'

/**
 * Admin panel: members invited but without a password yet, each with «أعد الإرسال».
 * Hidden when the list is empty. `refreshKey` re-reads the list after a new invitation.
 */
export function PendingInvites({ refreshKey }: { refreshKey: number }) {
  const { t } = useStr()
  const s = useData()
  const list = useSession((x) => x.listPendingInvites)
  const resend = useSession((x) => x.resendInvite)
  const setToast = useUi((u) => u.setToast)
  const [items, setItems] = useState<PendingInvite[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    list()
      .then(setItems)
      .catch(() => setItems([]))
  }, [list])
  useEffect(() => {
    load()
  }, [load, refreshKey])

  if (items.length === 0) return null
  const roleLabel = (r: PendingInvite['role']) => (r === 'admin' ? t('roleAdmin') : r === 'creative' ? t('roleCreative') : t('roleClient'))

  async function onResend(p: PendingInvite) {
    setBusy(p.email)
    try {
      const r = await resend(p.email)
      if (r.sent) setToast(`${t('resendSent')} ${p.email}`, 'info')
      else if (r.reason === 'already_registered') setToast(t('inviteAlready'), 'error')
      else setToast(t('inviteNotSent'), 'error')
      if (r.reason === 'already_registered') load()
    } catch {
      /* toast already shown by the store */
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="pending-invites">
      <SectionTitle>
        {t('pendingInvites')} · {items.length}
      </SectionTitle>
      {items.map((p) => {
        const client = p.clientId ? s.clients.find((c) => c.id === p.clientId) : undefined
        return (
          <div key={p.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <div dir="auto" className="text-[12.5px] font-semibold truncate">
                {p.name} · {roleLabel(p.role)}
                {client ? ` · ${client.name}` : ''}
              </div>
              <div dir="ltr" className="text-[11px] text-fg-secondary truncate text-start">
                {p.email}
              </div>
            </div>
            <Button size="sm" onClick={() => void onResend(p)} disabled={busy === p.email} title={t('resendInvite')}>
              <RefreshCw size={13} className={busy === p.email ? 'animate-spin' : ''} /> {t('resendInvite')}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
