import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Login from './routes/Login'
import Shell from './routes/Shell'
import { useSession } from './store/session'
import { useUi } from './store/ui'

export default function App() {
  const booted = useSession((s) => s.booted)
  const boot = useSession((s) => s.boot)
  const user = useSession((s) => s.user)
  const lang = useUi((s) => s.lang)
  const theme = useUi((s) => s.theme)
  const setCheckin = useUi((s) => s.setCheckin)

  useEffect(() => {
    void boot()
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

  // Creative check-in on sign-in and when coming back to the tab
  useEffect(() => {
    if (user?.role === 'creative') setCheckin(true)
    const onVis = () => {
      if (document.visibilityState === 'visible' && useSession.getState().user?.role === 'creative') setCheckin(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [user?.id, user?.role, setCheckin])

  if (!booted) return <div className="h-dvh grid place-items-center text-fg-muted text-sm">…</div>

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<Shell />} />
      </Routes>
    </BrowserRouter>
  )
}
