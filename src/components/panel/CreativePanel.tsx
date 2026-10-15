import { Bell, Home, MessageCircle, Settings, User, X } from 'lucide-react'
import { clientProgress, isDone, partsOf, urgency, visibleTasks } from '@/lib/derive'
import { CITIES } from '@/lib/prayer'
import { QUOTES, partsCount } from '@/lib/i18n'
import { useNow, useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi, type PanelTab } from '@/store/ui'
import { Avatar, Bar, Button, Card, SectionTitle } from '../ui'
import { Chat } from '../Chat'
import { AlertsList, useAlerts } from '../Alerts'
import { SettingsPanel } from '../Settings'
import { PanelTabs } from './PanelTabs'

export function CreativePanel() {
  const { t } = useStr()
  const ui = useUi()
  const alertCount = useAlerts().length
  const tabs: Array<{ id: PanelTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'main', label: t('tabHome'), icon: <Home size={16} /> },
    { id: 'profile', label: t('tabProfile'), icon: <User size={16} /> },
    { id: 'messages', label: t('tabInbox'), icon: <MessageCircle size={16} /> },
    { id: 'alerts', label: t('tabAlerts'), icon: <Bell size={16} />, badge: alertCount },
    { id: 'settings', label: t('tabSettings'), icon: <Settings size={16} /> },
  ]
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="text-[17px] font-semibold tracking-[-0.01em]">{t('panelCreative')}</div>
        <Button size="icon" variant="ghost" onClick={() => ui.togglePanel(false)} aria-label={t('hidePanel')}>
          <X size={16} />
        </Button>
      </div>
      <PanelTabs tabs={tabs} />
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-5 pt-3 flex flex-col gap-4">
        {ui.panelTab === 'main' && <HomeTab />}
        {ui.panelTab === 'profile' && <ProfileTab />}
        {ui.panelTab === 'messages' && <Chat channel="team" className="flex-1 min-h-[320px]" />}
        {ui.panelTab === 'alerts' && <AlertsList />}
        {ui.panelTab === 'settings' && <SettingsPanel />}
      </div>
    </>
  )
}

function Donut({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      className="relative grid place-items-center w-[62px] h-[62px] rounded-full shrink-0"
      style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, var(--muted-bg) 0)` }}
    >
      <div className="w-[48px] h-[48px] rounded-full bg-card grid place-items-center text-[14px] font-bold tabular-nums">{pct}%</div>
    </div>
  )
}

function HomeTab() {
  const { t, lang } = useStr()
  const today = useNow(60_000)
  const s = useData()
  const me = useUser()!
  const updateProfile = useSession((x) => x.updateProfile)
  const profile = s.profiles[me.id]
  const mine = visibleTasks(s, me, null)
  const myParts = s.parts.filter((p) => p.assigneeId === me.id)
  const done = myParts.filter((p) => p.done).length
  const pct = myParts.length ? Math.round((done / myParts.length) * 100) : 0
  const open = mine.filter((x) => !isDone(s, x))
  const soon = open.filter((x) => urgency(s, x) === 'soon').length
  const late = open.filter((x) => urgency(s, x) === 'late').length
  const quote = QUOTES[lang][today.getDate() % QUOTES[lang].length]
  const clients = s.clients.filter((c) => mine.some((x) => x.clientId === c.id))

  return (
    <>
      <div className="rounded-md bg-fg text-bg p-4">
        <div className="text-[10.5px] font-bold tracking-[0.08em] uppercase text-warning">{t('spark')}</div>
        <div className="text-[14.5px] font-semibold leading-snug mt-1.5">{quote}</div>
      </div>

      <Card className="p-3 flex items-center justify-between gap-3">
        <SectionTitle>{t('location')}</SectionTitle>
        <select
          value={profile?.city ?? 'riyadh'}
          onChange={(e) => void updateProfile({ city: e.target.value })}
          className="rounded-md bg-muted-bg px-2.5 py-1.5 text-[12.5px] font-semibold border-0"
        >
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name[lang]}
            </option>
          ))}
        </select>
      </Card>

      <div className="flex items-center gap-3">
        <Donut pct={pct} color={me.color} />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold truncate">{me.name}</div>
          <div className="text-[12px] text-fg-secondary">
            {open.length} {t('tasks')} · {done} {t('of')} {partsCount(myParts.length, lang)} {lang === 'ar' ? 'منجزة' : 'done'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { n: open.length, l: t('myTasks'), c: 'bg-info-tint text-info' },
          { n: soon, l: t('dueSoon'), c: 'bg-warning-tint text-warning-dark' },
          { n: late, l: t('late'), c: 'bg-danger-tint text-danger-dark' },
        ].map((k) => (
          <div key={k.l} className={`rounded-md p-3 ${k.c}`}>
            <div className="text-[20px] font-bold leading-none tabular-nums">{k.n}</div>
            <div className="text-[11px] font-semibold mt-1.5">{k.l}</div>
          </div>
        ))}
      </div>

      <SectionTitle>{t('progressByClient')}</SectionTitle>
      <div className="flex flex-col gap-2 -mt-2">
        {clients.map((c) => {
          const tasks = mine.filter((x) => x.clientId === c.id)
          const parts = tasks.flatMap((x) => partsOf(s, x.id)).filter((p) => p.assigneeId === me.id)
          const p = parts.length ? Math.round((parts.filter((x) => x.done).length / parts.length) * 100) : clientProgress(s, c).pct
          return (
            <Card key={c.id} className="p-3">
              <div className="flex items-center gap-2">
                <span className="w-[9px] h-[9px] rounded-sm" style={{ background: c.color }} />
                <span className="text-[13px] font-semibold">{c.name}</span>
                <span className="ms-auto text-[12.5px] font-bold tabular-nums">{p}%</span>
              </div>
              <Bar pct={p} color={c.color} className="mt-2" />
            </Card>
          )
        })}
      </div>

      <SectionTitle>{t('teamChat')}</SectionTitle>
      <Chat channel="team" className="-mt-2 h-[300px]" />
    </>
  )
}

function ProfileTab() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const updateProfile = useSession((x) => x.updateProfile)
  const profile = s.profiles[me.id]
  const presence = s.presence[me.id] ?? 'away'
  const hours = Array.from({ length: 19 }, (_, i) => i + 5)
  const whStart = profile?.whStart ?? 9
  const whEnd = profile?.whEnd ?? 17
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={me.name} color={me.color} size={52} />
        <div className="min-w-0">
          <div className="text-[16px] font-semibold truncate">{me.name}</div>
          <div className="text-[12px] text-fg-secondary truncate" dir="ltr">
            {me.title} · {me.email}
          </div>
          <span className={`inline-block mt-1 text-[10.5px] font-bold rounded px-2 py-0.5 ${presence === 'live' ? 'bg-success-tint text-success-dark' : 'bg-muted-bg text-fg-secondary'}`}>
            {presence === 'live' ? t('live') : t('notLive')}
          </span>
        </div>
      </div>

      <SectionTitle>{lang === 'ar' ? 'ساعات العمل' : 'Working hours'}</SectionTitle>
      <Card className="p-3 -mt-2 flex items-center gap-2" dir="ltr">
        <select value={whStart} onChange={(e) => void updateProfile({ whStart: Number(e.target.value) })} className="rounded-md bg-muted-bg px-2 py-1.5 text-[12.5px] font-semibold">
          {hours.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        <span className="text-fg-muted">→</span>
        <select value={whEnd} onChange={(e) => void updateProfile({ whEnd: Number(e.target.value) })} className="rounded-md bg-muted-bg px-2 py-1.5 text-[12.5px] font-semibold">
          {hours.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        <span className="ms-auto text-[12px] font-semibold text-fg-secondary">
          {Math.max(0, whEnd - whStart)} h/{lang === 'ar' ? 'يوم' : 'day'}
        </span>
      </Card>

      <SectionTitle>{lang === 'ar' ? 'ملاحظاتي' : 'Notes'}</SectionTitle>
      <textarea
        defaultValue={profile?.notes ?? ''}
        onBlur={(e) => void updateProfile({ notes: e.target.value })}
        rows={5}
        placeholder={lang === 'ar' ? 'ملاحظات خاصة بك…' : 'Private notes…'}
        className="-mt-2 w-full rounded-md border border-border bg-bg p-3 text-[13px] resize-y"
      />
    </>
  )
}
