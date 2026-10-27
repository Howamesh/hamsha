import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Logo } from '@/components/ui'
import { useStr } from '@/lib/useStr'
import { useSession } from '@/store/session'
import { repo } from '@/data'

/**
 * /welcome — where an invite or password-reset e-mail lands. The link itself opens a session
 * (supabase-js reads it from the URL); here the person chooses a password and enters signed in.
 */
export default function Welcome() {
  const { t } = useStr()
  const nav = useNavigate()
  const completeInvite = useSession((s) => s.completeInvite)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    // give supabase-js a moment to consume the #access_token fragment before asking
    const id = setTimeout(() => void repo.restoreSession().then((u) => setHasSession(!!u)), 300)
    return () => clearTimeout(id)
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw.length < 8) return setError(t('pwShort'))
    if (pw !== pw2) return setError(t('pwMismatch'))
    setBusy(true)
    try {
      await completeInvite(pw)
      nav('/', { replace: true })
    } catch {
      setError(t('welcomeNoSession'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center p-6 bg-bg">
      <form onSubmit={submit} className="w-[min(420px,94vw)] rounded-md border border-border bg-card p-6 flex flex-col gap-4">
        <Logo />
        <div>
          <div className="text-[18px] font-semibold">{t('welcomeTitle')}</div>
          <div className="text-[13px] text-fg-secondary mt-1">{t('welcomeHint')}</div>
        </div>
        {hasSession === false && <div className="rounded-md bg-danger-tint text-danger-dark text-[13px] font-semibold px-3 py-2">{t('welcomeNoSession')}</div>}
        <Input type="password" autoComplete="new-password" placeholder={t('newPassword')} value={pw} onChange={(e) => setPw(e.target.value)} required />
        <Input type="password" autoComplete="new-password" placeholder={t('confirmPassword')} value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        {error && <div className="rounded-md bg-danger-tint text-danger-dark text-[13px] font-semibold px-3 py-2 anim-fade">{error}</div>}
        <Button type="submit" variant="primary" className="h-[44px] text-[14.5px]" disabled={busy || hasSession === false}>
          {busy ? t('signingIn') : t('savePassword')}
        </Button>
      </form>
    </div>
  )
}
