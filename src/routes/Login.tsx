import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Logo } from '@/components/ui'
import { PasswordInput } from '@/components/PasswordInput'
import { useStr } from '@/lib/useStr'
import { useSession } from '@/store/session'
import { IS_DEMO } from '@/data'
import { useUi } from '@/store/ui'

export default function Login() {
  const { t, lang } = useStr()
  const setLang = useUi((s) => s.setLang)
  const signIn = useSession((s) => s.signIn)
  const requestPasswordReset = useSession((s) => s.requestPasswordReset)
  const [notice, setNotice] = useState<string | null>(null)
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const DEMO = IS_DEMO
  async function demo(email: string) {
    setBusy(true)
    try {
      await signIn(email, 'demo')
      nav('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, pw)
      nav('/', { replace: true })
    } catch {
      setError(t('loginError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-bg">
      <div className="w-[min(460px,94vw)] flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="text-[22px] font-bold tracking-[-0.02em]">{t('brand')}</div>
          <div className="flex-1" />
          <Button size="sm" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title="العربية / English">
            {t('langLabel')}
          </Button>
        </div>

        <form onSubmit={submit} className="rounded-md border border-border bg-card p-[26px] flex flex-col gap-4">
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.01em]">{t('loginTitle')}</div>
            <div className="text-[13px] text-fg-secondary mt-1">{t('loginSub')}</div>
          </div>
          <div className="flex flex-col gap-2">
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              placeholder={t('email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <PasswordInput
              autoComplete="current-password"
              placeholder={t('password')}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
            {error && (
              <div className="rounded-md bg-danger-tint text-danger-dark text-[13px] font-semibold px-3 py-2 anim-fade">{error}</div>
            )}
            <Button type="submit" variant="primary" className="h-[44px] text-[14.5px]" disabled={busy}>
              {busy ? t('signingIn') : t('signIn')}
            </Button>
          </div>
          <button
            type="button"
            className="text-[12.5px] text-fg-secondary hover:text-fg self-start cursor-pointer"
            disabled={busy}
            onClick={() => {
              setError(null)
              if (!email.trim()) return setNotice(t('resetNeedEmail'))
              void requestPasswordReset(email).then(() => setNotice(t('resetSent'))).catch(() => setNotice(t('resetSent')))
            }}
          >
            {t('forgot')}
          </button>
          {notice && <div className="rounded-md bg-muted-bg text-fg text-[12.5px] px-3 py-2 anim-fade">{notice}</div>}
        </form>

        {DEMO && (
          <div className="rounded-md border border-dashed border-fg-faint bg-card/60 p-4 flex flex-col gap-2.5">
            <div className="text-[12.5px] font-semibold text-fg-secondary">{t('demoTitle')}</div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="dark" disabled={busy} onClick={() => demo('ibrahim.alqifari@hamsha.studio')}>
                {t('demoAdmin')}
              </Button>
              <Button variant="dark" disabled={busy} onClick={() => demo('abdullah.aboalhossain@hamsha.studio')}>
                {t('demoCreative')}
              </Button>
              <Button variant="dark" disabled={busy} onClick={() => demo('team@directaid.org')}>
                {t('demoClient')}
              </Button>
            </div>
            <div className="text-[11px] text-fg-muted">{t('demoNote')}</div>
          </div>
        )}
      </div>
    </div>
  )
}
