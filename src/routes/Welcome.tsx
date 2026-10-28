import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Logo } from '@/components/ui'
import { PasswordInput } from '@/components/PasswordInput'
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

  // Supabase puts a failure reason in the hash when the link itself is bad (#error_code=otp_expired…)
  const [linkError] = useState<string | null>(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return h.get('error_code') ?? h.get('error')
  })
  useEffect(() => {
    if (linkError) {
      const id = setTimeout(() => setHasSession(false), 0)
      return () => clearTimeout(id)
    }
    // supabase-js consumes the #access_token fragment asynchronously and the first profile read may be
    // slow (far region) — keep asking for up to ~6 s before calling the link dead (2026-10-28).
    let alive = true
    let tries = 0
    const ask = () => {
      void repo.restoreSession().then((u) => {
        if (!alive) return
        if (u) setHasSession(true)
        else if (++tries < 12) setTimeout(ask, 500)
        else setHasSession(false)
      })
    }
    const id = setTimeout(ask, 300)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [linkError])

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
        {hasSession === false && (
          <div className="rounded-md bg-danger-tint text-danger-dark text-[13px] font-semibold px-3 py-2">
            {linkError === 'otp_expired' ? t('welcomeLinkExpired') : t('welcomeNoSession')}
          </div>
        )}
        {hasSession === null && <div className="text-[12.5px] text-fg-secondary">{t('welcomeChecking')}</div>}
        <PasswordInput autoComplete="new-password" placeholder={t('newPassword')} value={pw} onChange={(e) => setPw(e.target.value)} required />
        <PasswordInput autoComplete="new-password" placeholder={t('confirmPassword')} value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        {error && <div className="rounded-md bg-danger-tint text-danger-dark text-[13px] font-semibold px-3 py-2 anim-fade">{error}</div>}
        <Button type="submit" variant="primary" className="h-[44px] text-[14.5px]" disabled={busy || hasSession === false}>
          {busy ? t('signingIn') : t('savePassword')}
        </Button>
      </form>
    </div>
  )
}
