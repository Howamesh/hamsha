import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bell, Calendar, ChevronLeft, ChevronRight, LogOut, MessageCircle, PanelRightOpen, PieChart, Settings, User } from 'lucide-react'
import { addDays, addMonths, addWeeks } from 'date-fns'
import { cn } from '@/lib/utils'
import { fromIso, toIso, todayIso, weekDays } from '@/lib/dates'
import { hijriRange } from '@/lib/hijri'
import { visibleTasks } from '@/lib/derive'
import { useNarrow, useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi, type PanelTab } from '@/store/ui'
import { Avatar, Button, Badge, Logo, Segmented } from '@/components/ui'
import { MonthView } from '@/components/calendar/MonthView'
import { WeekView } from '@/components/calendar/WeekView'
import { DayView } from '@/components/calendar/DayView'
import { AdminPanel } from '@/components/panel/AdminPanel'
import { CreativePanel } from '@/components/panel/CreativePanel'
import { ClientPanel } from '@/components/panel/ClientPanel'
import { TaskSheet } from '@/components/TaskSheet'
import { Checkin } from '@/components/Checkin'
import { NewTaskDialog, type NewTaskSeed } from '@/components/NewTaskDialog'
import { Toast } from '@/components/Toast'
import { useAlerts } from '@/components/Alerts'
import { BrandTile } from '@/components/BrandTile'

export default function Shell() {
  const me = useUser()
  if (!me) return <Navigate to="/login" replace />
  return <App />
}

function App() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const ui = useUi()
  const narrow = useNarrow()
  const sess = useSession()
  const alertCount = useAlerts().length
  const f = fromIso(ui.focus)
  const isAdmin = me.role === 'admin'
  const isCreative = me.role === 'creative'
  const client = ui.calId ? s.clients.find((c) => c.id === ui.calId) : me.role === 'client' ? s.clients.find((c) => c.id === me.clientId) : null
  const tasks = useMemo(() => visibleTasks(s, me, ui.calId), [s, me, ui.calId])
  const presence = s.presence[me.id] ?? 'away'

  // Close the panel by default on phones
  useEffect(() => {
    if (narrow) ui.togglePanel(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow])

  const shift = (dir: 1 | -1) => {
    const d = ui.view === 'month' ? addMonths(f, dir) : ui.view === 'week' ? addWeeks(f, dir) : addDays(f, dir)
    ui.setFocus(toIso(d))
  }
  const gLabel =
    ui.view === 'month'
      ? new Intl.DateTimeFormat((lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en'), { month: 'long', year: 'numeric' }).format(f)
      : ui.view === 'week'
        ? (() => {
            const w = weekDays(f, ui.weekStart)
            const fmt = new Intl.DateTimeFormat((lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en'), { month: 'short', day: 'numeric' })
            return `${fmt.format(w[0])} – ${fmt.format(w[6])}`
          })()
        : new Intl.DateTimeFormat((lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en'), { weekday: 'short', day: 'numeric', month: 'short' }).format(f)
  const hLabel = ui.view === 'month' ? hijriRange(new Date(f.getFullYear(), f.getMonth(), 1), new Date(f.getFullYear(), f.getMonth() + 1, 0), lang) : ui.view === 'week' ? hijriRange(weekDays(f, ui.weekStart)[0], weekDays(f, ui.weekStart)[6], lang) : hijriRange(f, f, lang)

  const headName = client ? client.name : isAdmin ? t('master') : me.name
  const badge = isAdmin ? (client ? t('badgeAdmin') : t('badgeMaster')) : isCreative ? t('badgeCreative') : t('badgeClient')
  const emptyMsg = isAdmin ? t('emptyMaster') : isCreative ? t('emptyCreative') : t('emptyClient')

  const [newTask, setNewTask] = useState<NewTaskSeed | null>(null)
  const onCreate = isAdmin && s.clients.length > 0 ? (seed: NewTaskSeed) => setNewTask(seed) : undefined

  const Panel = isAdmin ? AdminPanel : isCreative ? CreativePanel : ClientPanel
  const railTabs: Array<{ id: PanelTab; icon: React.ReactNode; badge?: number }> = isCreative
    ? [{ id: 'main', icon: <User size={18} /> }, { id: 'messages', icon: <MessageCircle size={18} /> }, { id: 'alerts', icon: <Bell size={18} />, badge: alertCount }, { id: 'settings', icon: <Settings size={18} /> }]
    : [{ id: 'main', icon: <PieChart size={18} /> }, { id: 'messages', icon: <MessageCircle size={18} /> }, { id: 'alerts', icon: <Bell size={18} />, badge: alertCount }, { id: 'settings', icon: <Settings size={18} /> }]

  return (
    <div className="h-dvh flex flex-col gap-[var(--gap)] p-[var(--gap)] bg-bg overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-2 flex-wrap rounded-md border border-border bg-card px-3 py-2 shrink-0 z-30">
        {isAdmin && client && (
          <Button size="icon" onClick={() => ui.setCalId(null)} aria-label={t('back')}>
            {lang === 'ar' ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </Button>
        )}
        <div className="flex items-center gap-2.5 min-w-0">
          {client ? (
            <BrandTile client={client} size={28} />
          ) : isAdmin ? (
            <Logo size={28} />
          ) : (
            <Avatar name={me.name} color={me.color} size={28} />
          )}
          <span className="text-[17px] font-semibold tracking-[-0.01em] truncate">{headName}</span>
          <Badge className="hidden sm:inline">{badge}</Badge>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <Button size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label={t('prev')}>
            {lang === 'ar' ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </Button>
          <div className="min-w-[120px] text-center">
            <div className="text-[14.5px] font-semibold leading-tight">{gLabel}</div>
            <div className="text-[10px] font-semibold text-fg-secondary leading-tight">{hLabel}</div>
          </div>
          <Button size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label={t('next')}>
            {lang === 'ar' ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </Button>
          <Button size="sm" onClick={() => ui.setFocus(todayIso())}>
            {t('today')}
          </Button>
        </div>
        <Segmented
          value={ui.view}
          options={[
            { value: 'month', label: t('month') },
            { value: 'week', label: t('week') },
            { value: 'day', label: t('day') },
          ]}
          onChange={ui.setView}
        />
        {isCreative && (
          <Segmented
            size="sm"
            value={presence}
            options={[
              { value: 'live', label: t('live'), dot: 'var(--success)' },
              { value: 'away', label: t('notLive'), dot: 'var(--fg-faint)' },
            ]}
            onChange={(v) => void sess.setPresence(v)}
          />
        )}
        {!narrow && (
          <Button size="sm" onClick={() => ui.togglePanel()} className="hidden lg:inline-flex">
            <PanelRightOpen size={14} /> {ui.panelOpen ? t('hidePanel') : t('showPanel')}
          </Button>
        )}
        <Button size="sm" onClick={() => void sess.signOut()} className="hover:text-accent hover:border-accent">
          <LogOut size={14} /> <span className="hidden sm:inline">{t('logout')}</span>
        </Button>
        <Button size="sm" onClick={() => ui.setLang(lang === 'ar' ? 'en' : 'ar')} title="العربية / English">
          {t('langLabel')}
        </Button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 gap-[var(--gap)]">
        {/* Panel / rail */}
        {!narrow && ui.panelOpen && (
          <aside className="w-[var(--panel-w)] shrink-0 rounded-md border border-border bg-card flex flex-col min-h-0 anim-fade">
            <Panel />
          </aside>
        )}
        {!narrow && !ui.panelOpen && (
          <aside className="w-[var(--rail-w)] shrink-0 rounded-md border border-border bg-card flex flex-col items-center gap-1.5 py-2">
            {railTabs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => ui.setPanelTab(r.id)}
                className="relative w-[38px] h-[38px] grid place-items-center rounded-md text-fg-secondary hover:bg-muted-bg hover:text-fg cursor-pointer"
              >
                {r.icon}
                {!!r.badge && <span className="absolute top-1 end-1 min-w-[15px] h-[15px] px-1 rounded-full bg-accent text-accent-fg text-[9.5px] font-bold grid place-items-center">{r.badge}</span>}
              </button>
            ))}
          </aside>
        )}

        <main className={cn('flex-1 min-w-0 min-h-0 flex flex-col gap-[var(--gap)]', narrow && 'pb-[calc(64px+env(safe-area-inset-bottom,0px))]')}>
          {ui.view === 'month' && <MonthView tasks={tasks} onCreate={onCreate} emptyMsg={emptyMsg} hint={isAdmin && client ? t('dragHint') : isCreative ? t('hintCreative') : undefined} />}
          {ui.view === 'week' && <WeekView tasks={tasks} onCreate={onCreate} />}
          {ui.view === 'day' && <DayView tasks={tasks} onCreate={onCreate} />}
        </main>
      </div>

      {/* Phone: panel as a full overlay + bottom bar */}
      {narrow && ui.panelOpen && (
        <div className="fixed inset-0 z-[60] bg-bg/60 backdrop-blur-[2px]" onClick={() => ui.togglePanel(false)}>
          <aside className="absolute inset-x-2 top-2 bottom-[64px] rounded-md border border-border bg-card flex flex-col min-h-0 anim-sheet shadow-[0_24px_60px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
            <Panel />
          </aside>
        </div>
      )}
      {narrow && (
        <nav className="fixed inset-x-2 bottom-2 z-[65] h-[54px] rounded-md border border-border bg-card flex items-stretch shadow-[0_8px_24px_rgba(0,0,0,0.1)]">
          <button type="button" onClick={() => ui.togglePanel(false)} className={cn('flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer', !ui.panelOpen ? 'text-fg' : 'text-fg-secondary')}>
            <Calendar size={18} /> {t(ui.view)}
          </button>
          {railTabs.map((r) => (
            <button key={r.id} type="button" onClick={() => ui.setPanelTab(r.id)} className={cn('relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer', ui.panelOpen && ui.panelTab === r.id ? 'text-fg' : 'text-fg-secondary')}>
              {r.icon}
              {!!r.badge && <span className="absolute top-1.5 end-[22%] min-w-[15px] h-[15px] px-1 rounded-full bg-accent text-accent-fg text-[9.5px] font-bold grid place-items-center">{r.badge}</span>}
            </button>
          ))}
        </nav>
      )}

      {newTask && <NewTaskDialog seed={newTask} clientId={client?.id ?? null} onClose={() => setNewTask(null)} />}
      <TaskSheet />
      <Checkin />
      <Toast />
    </div>
  )
}
