import { focusTask, isDone, partsOf, urgency, visibleTasks } from '@/lib/derive'
import { todayIso } from '@/lib/dates'
import { fmtDate, useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { Avatar, Button, Segmented } from './ui'

/** Creative check-in popup — shown on sign-in (D25 in the director's spec). */
export function Checkin() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()
  const ui = useUi()
  const sess = useSession()
  if (!me || me.role !== 'creative' || !ui.checkinOpen) return null
  const presence = s.presence[me.id] ?? 'away'
  const T = todayIso()
  const mine = visibleTasks(s, me, null).filter((x) => !isDone(s, x))
  const today = mine.filter((x) => x.start <= T && T <= x.end)
  const openParts = today.flatMap((x) => partsOf(s, x.id)).filter((p) => !p.done && p.assigneeId === me.id).length
  const focus = focusTask(s, me)
  const fClient = focus && s.clients.find((c) => c.id === focus.clientId)
  const close = () => ui.setCheckin(false)

  return (
    <div className="fixed inset-0 z-[80] bg-black/35 grid place-items-center p-4 anim-fade" onClick={close}>
      <div className="w-[min(540px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="flex items-start gap-3">
          <Avatar name={me.name} color={me.color} size={38} />
          <div className="min-w-0">
            <div className="text-[18px] font-semibold tracking-[-0.01em]">{t('checkinTitle', { name: me.name.split(' ')[0] })}</div>
            <div className="text-[12.5px] text-fg-secondary">{t('checkinSub')}</div>
          </div>
        </div>
        <Segmented
          value={presence}
          options={[
            { value: 'live', label: t('imLive'), dot: 'var(--success)' },
            { value: 'away', label: t('notLive'), dot: 'var(--fg-faint)' },
          ]}
          onChange={(v) => void sess.setPresence(v)}
        />
        {focus && (
          <div className="rounded-md bg-fg text-bg p-3.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-bold tracking-[0.08em] uppercase text-warning">{t('focusFirst')}</div>
              <div dir="auto" className="text-[14px] font-semibold truncate mt-1">
                {fClient?.name} · {focus.title}
              </div>
              <div className="text-[11.5px] opacity-80 mt-0.5">
                {urgency(s, focus) === 'late' ? t('late') : t('dueSoon')} · {fmtDate(focus.end, lang)}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="bg-card text-fg"
              onClick={() => {
                close()
                ui.openTask(focus.id)
              }}
            >
              {t('open')}
            </Button>
          </div>
        )}
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.08em] uppercase text-fg-secondary">
            {t('tasksToday')} · {today.length} {t('today')} · {openParts} {t('openParts')}
          </div>
          {today.length ? (
            <div className="flex flex-col gap-1.5 mt-2">
              {today.map((x) => {
                const c = s.clients.find((k) => k.id === x.clientId)
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => {
                      close()
                      ui.openTask(x.id)
                    }}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-start text-[13px] font-semibold cursor-pointer hover:border-fg-faint"
                  >
                    <span className="w-[8px] h-[8px] rounded-full" style={{ background: c?.color }} />
                    <span className="truncate">
                      {c?.name} · {x.title}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-dashed border-fg-faint p-3.5 text-center text-[13px] text-fg-secondary">{t('nothingToday')}</div>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={() => { close(); ui.setPanelTab('messages') }} className="text-[12.5px] font-semibold text-fg-secondary hover:text-fg cursor-pointer">
            {t('askTeam')}
          </button>
          <div className="flex-1" />
          <Button size="sm" onClick={() => { void sess.setPresence('away'); close() }}>
            {t('imAway')}
          </Button>
          <Button size="sm" variant="dark" onClick={() => { void sess.setPresence('live'); close() }}>
            {t('allClear')}
          </Button>
        </div>
      </div>
    </div>
  )
}
