import { isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { fromIso, isWeekend, toIso, weekDays, hhmm } from '@/lib/dates'
import { hijriCell } from '@/lib/hijri'
import { clientById, tasksOnDay, taskProgress, urgency, userById } from '@/lib/derive'
import { useStr, useNow } from '@/lib/useStr'
import { useUi } from '@/store/ui'
import { useData } from '@/store/session'
import { Avatar } from '../ui'
import { BrandTile } from '../BrandTile'
import type { Task } from '@/types'
import type { NewTaskSeed } from '../NewTaskDialog'

const dot: Record<string, string> = { late: 'var(--accent)', soon: 'var(--warning)', done: 'var(--success)', ok: 'var(--fg-faint)' }

export function WeekView({ tasks, onCreate }: { tasks: Task[]; onCreate?: (seed: NewTaskSeed) => void }) {
  const { days, lang, t } = useStr()
  const s = useData()
  const now = useNow()
  const focus = useUi((u) => u.focus)
  const weekStart = useUi((u) => u.weekStart)
  const openTask = useUi((u) => u.openTask)
  const setFocus = useUi((u) => u.setFocus)
  const setView = useUi((u) => u.setView)
  const week = weekDays(fromIso(focus), weekStart)
  const minutes = now.getHours() * 60 + now.getMinutes()

  return (
    <div className="flex-1 min-h-0 rounded-md border border-border bg-card overflow-x-auto overflow-y-hidden no-scrollbar">
      <div className="grid h-full gap-2 p-2.5" style={{ gridTemplateColumns: 'repeat(7,minmax(150px,1fr))', minWidth: 7 * 150 + 60 }}>
        {week.map((d) => {
          const iso = toIso(d)
          const today = isToday(d)
          const list = tasksOnDay(tasks, iso)
          const idx = weekStart === 'sunday' ? (d.getDay() + 6) % 7 : (d.getDay() + 6) % 7
          return (
            <div
              key={iso}
              className={cn(
                'relative flex flex-col min-h-0 rounded-md border bg-card overflow-hidden',
                today ? 'border-accent/60' : 'border-border',
                isWeekend(d) && !today && 'bg-weekend',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setFocus(iso)
                  setView('day')
                }}
                className="flex items-center gap-2 px-3 py-2.5 border-b border-border-soft text-start cursor-pointer"
              >
                <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-fg-secondary">{days[idx]}</span>
                <span
                  className={cn(
                    'grid place-items-center min-w-[26px] h-[26px] px-1.5 rounded-full text-[13px] font-bold tabular-nums',
                    today ? 'bg-accent text-accent-fg' : 'bg-muted-bg text-fg',
                  )}
                >
                  {d.getDate()}
                </span>
                <span className="text-[10px] text-fg-muted truncate ms-auto">{hijriCell(d, lang)}</span>
              </button>
              <div
                className={cn('relative flex-1 min-h-0 overflow-y-auto no-scrollbar p-2 flex flex-col gap-1.5', onCreate && 'cursor-crosshair')}
                onClick={(e) => {
                  if (e.target === e.currentTarget) onCreate?.({ day: iso })
                }}
              >
                {today && (
                  <div className="absolute inset-x-0 h-[2px] bg-accent z-[3] pointer-events-none" style={{ top: `${(minutes / 1440) * 100}%` }}>
                    <span className="absolute -top-[9px] end-1 rounded bg-accent text-accent-fg text-[10px] font-bold px-1.5 py-[2px]" dir="ltr">
                      {hhmm(now)}
                    </span>
                  </div>
                )}
                {list.length > 0 && <div className="text-[10px] font-bold tracking-[0.06em] uppercase text-fg-muted">{t('deliveries')}</div>}
                {list.map((task) => {
                  const client = clientById(s, task.clientId)
                  const owner = userById(s, task.ownerId)
                  const pr = taskProgress(s, task)
                  const u = urgency(s, task)
                  const color = client?.color ?? '#D9B600'
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => openTask(task.id)}
                      className="text-start rounded-md p-2.5 cursor-pointer hover:opacity-90 border border-transparent"
                      style={{ background: color + '22', borderInlineStartColor: color, borderInlineStartWidth: 3 }}
                    >
                      <div className="flex items-start gap-1.5">
                        <BrandTile client={client} size={18} className="mt-[1px]" />
                        <span className="w-[6px] h-[6px] rounded-full mt-[6px] shrink-0 order-last" style={{ background: dot[u] }} />
                        <span dir="auto" className={cn('text-[12.5px] font-semibold leading-snug', u === 'done' && 'line-through opacity-70')}>
                          {client?.name} · {task.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        {owner && <Avatar name={owner.name} color={owner.color} size={18} />}
                        <span className="text-[10.5px] font-semibold text-fg-secondary">
                          {pr.done}/{pr.total} · {pr.hours}{t('hourShort')}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
