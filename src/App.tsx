import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Login from './routes/Login'
import Shell from './routes/Shell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useSession } from './store/session'
import { useUi } from './store/ui'

export default function App() {
  const booted = useSession((s) => s.booted)
  const bootError = useSession((s) => s.bootError)
  const boot = useSession((s) => s.boot)
  const user = useSession((s) => s.user)
  const lang = useUi((s) => s.lang)
  const theme = useUi((s) => s.theme)
  const setCheckin = useUi((s) => s.setCheckin)

  useEffect(() => {
    void boot()
    // Errors already shown as a toast must not also spam the console as "unhandled"
    const onRej = (e: PromiseRejectionEvent) => {
      if ((e.reason as { reported?: boolean } | undefined)?.reported) e.preventDefault()
    }
    window.addEventListener('unhandledrejection', onRej)
    return () => window.removeEventListener('unhandledrejection', onRej)
  }, [boot])

  // Language + theme on the <html> element (RTL flips the whole layout)
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.title = lang === 'ar' ? 'همشة' : 'Hamsha'
  }, [lang])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#0b0b0d' : '#FAFAFA')
  }, [theme])

  // Creative check-in popup is switched OFF for now (Yousef, 2026-10-14) — the
  // component stays in the code; set `checkinOpen` to bring it back.
  useEffect(() => {
    setCheckin(false)
  }, [user?.id, setCheckin])

  if (!booted) return <div className="h-dvh grid place-items-center text-fg-muted text-sm">…</div>
  if (bootError)
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-bg">
        <div className="w-[min(460px,94vw)] rounded-md border border-border bg-card p-6 flex flex-col gap-3 text-center">
          <div className="text-[16px] font-semibold">{lang === 'ar' ? 'تعذّر تحميل البيانات' : 'Could not load data'}</div>
          <div className="text-[12.5px] text-fg-secondary break-words" dir="ltr">{bootError}</div>
          <button type="button" onClick={() => void boot()} className="h-[34px] px-4 rounded-md bg-fg text-bg text-[13px] font-semibold cursor-pointer self-center">
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    )

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
