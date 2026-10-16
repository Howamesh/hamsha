import { useEffect, useRef, useState } from 'react'
import { isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { fromIso } from '@/lib/dates'
import { hijriFull } from '@/lib/hijri'
import { cityById, energyAt, pad2, wallClock } from '@/lib/prayer'
import { clientById, tasksOnDay, taskProgress, urgency, userById } from '@/lib/derive'

import { useStr, useNow } from '@/lib/useStr'
import { useUi } from '@/store/ui'
import { useData, useUser } from '@/store/session'
import { Avatar } from '../ui'
import { BrandTile } from '../BrandTile'
import { PrayerChip, usePrayers } from './Prayer'
import type { Task } from '@/types'
import type { NewTaskSeed } from '../NewTaskDialog'

export function DayView({ tasks, onCreate }: { tasks: Task[]; onCreate?: (seed: NewTaskSeed) => void }) {
  // Drag-select across hour rows (admin): press on 15:00, move to 16:00, release → 15:00–17:00
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null)
  const dragRef = useRef<{ a: number; b: number } | null>(null)
  useEffect(() => {
    if (!drag) return
    const up = () => {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (d && onCreate) {
        const from = Math.min(d.a, d.b)
        const to = Math.max(d.a, d.b) + 1
        onCreate({ day: focus, fromHour: from, toHour: to })
      }
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])
  const inDrag = (h: number) => !!drag && h >= Math.min(drag.a, drag.b) && h <= Math.max(drag.a, drag.b)
  const { lang, t } = useStr()
  const s = useData()
  const user = useUser()
  const now = useNow()
  const focus = useUi((u) => u.focus)
  const openTask = useUi((u) => u.openTask)
  const d = fromIso(focus)
  const list = tasksOnDay(tasks, focus)
  const taskIds = new Set(tasks.map((x) => x.id))
  const partsToday = s.parts.filter((p) => p.day === focus && taskIds.has(p.taskId) && (user?.role !== 'creative' || p.assigneeId === user.id))
  const isCreative = user?.role === 'creative'
  const prayers = usePrayers()
  const fajr = prayers[0]
  const H0 = isCreative ? Math.min(7, fajr.hour) : 7
  const H1 = 22
  const hours = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i)
  const today = isToday(d)
  const cityId = (user && s.profiles[user.id]?.city) || 'riyadh'
  const wc = wallClock(now, cityById(cityId).tz)
  const nowLabel = `${pad2(wc.hour)}:${pad2(wc.minute)}`

  return (
    <div className="flex-1 min-h-0 rounded-md border border-border bg-card flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <div className="text-[15px] font-semibold">
          {new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)}
        </div>
        <div className="text-[11px] font-semibold text-fg-secondary">{hijriFull(d, lang)}</div>
        {isCreative && <div className="ms-auto text-[10.5px] font-bold tracking-[0.06em] uppercase text-warning-dark">{t('energy')}</div>}
        {onCreate && !isCreative && <div className="ms-auto text-[11px] text-fg-muted">{t('dragHint')}</div>}
      </div>

      {list.length > 0 && (
        <div className="px-3 py-2 border-b border-border-soft flex flex-col gap-1.5">
          <div className="text-[10px] font-bold tracking-[0.06em] uppercase text-fg-muted">{t('allDay')}</div>
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
                className="flex items-center gap-3 rounded-md px-3 py-2 text-start cursor-pointer hover:opacity-90 border border-transparent"
                style={{ background: color + '22', borderInlineStartColor: color, borderInlineStartWidth: 3 }}
              >
                <BrandTile client={client} size={20} />
                <span dir="auto" className={cn('text-[13px] font-semibold flex-1 min-w-0 truncate', u === 'done' && 'line-through opacity-70')}>
                  {client?.name} · {task.title}
                </span>
                <span className="text-[11px] font-semibold text-fg-secondary tabular-nums">
                  {pr.done}/{pr.total} · {pr.hours}{t('hourShort')}
                </span>
                {owner && <Avatar name={owner.name} color={owner.color} size={20} />}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar relative">
        {hours.map((h) => {
          const ps = isCreative ? prayers.filter((p) => p.hour === h) : []
          return (
            <div
              key={h}
              className={cn(
                'relative flex min-h-[46px] border-b border-border-soft select-none',
                onCreate && 'cursor-crosshair hover:bg-muted-bg/40',
                inDrag(h) && 'bg-accent/10',
              )}
              onPointerDown={(e) => {
                if (!onCreate || e.button !== 0) return
                if ((e.target as HTMLElement).closest('button')) return
                const d = { a: h, b: h }
                dragRef.current = d
                setDrag(d)
              }}
              onPointerEnter={() => {
                if (dragRef.current) {
                  const d = { ...dragRef.current, b: h }
                  dragRef.current = d
                  setDrag(d)
                }
              }}
            >
              {isCreative && (
                <div className="absolute inset-y-0 start-0 w-[4px] bg-warning" style={{ opacity: energyAt(h, fajr.hour + fajr.minute / 60) }} />
              )}
              {today && wc.hour === h && (
                <div className="absolute inset-x-0 h-[2px] bg-accent z-[3] pointer-events-none" style={{ top: `${(wc.minute / 60) * 100}%` }}>
                  <span className="absolute -top-[9px] start-2 rounded bg-accent text-accent-fg text-[10px] font-bold px-1.5 py-[2px]" dir="ltr">
                    {nowLabel}
                  </span>
                </div>
              )}
              <div className="w-[56px] shrink-0 ps-3 pt-1.5 text-[11px] font-semibold text-fg-muted tabular-nums" dir="ltr">
                {pad2(h)}:00
              </div>
              <div className="flex-1 p-1.5 flex flex-col gap-1">
                {partsToday
                  .filter((p) => p.time && Number(p.time.slice(0, 2)) === h)
                  .map((p) => {
                    const task = s.tasks.find((x) => x.id === p.taskId)
                    const who = userById(s, p.assigneeId)
                    const client = task && clientById(s, task.clientId)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openTask(p.taskId)
                        }}
                        className={cn('max-w-[420px] flex items-center gap-2 rounded-md px-2.5 py-1.5 text-start cursor-pointer border border-transparent', p.done && 'opacity-60')}
                        style={{ background: (client?.color ?? '#D9B600') + '22', borderInlineStartColor: client?.color ?? '#D9B600', borderInlineStartWidth: 3 }}
                      >
                        <span className="text-[11px] font-bold tabular-nums text-fg-secondary" dir="ltr">
                          {p.time}
                        </span>
                        <span dir="auto" className={cn('text-[12.5px] font-semibold truncate', p.done && 'line-through')}>
                          {p.label}
                        </span>
                        <span className="text-[10.5px] text-fg-muted truncate">· {task?.title}</span>
                        {who && <Avatar name={who.name} color={who.color} size={18} className="ms-auto" />}
                      </button>
                    )
                  })}
                {ps.map((p) => (
                  <div key={p.name} className="max-w-[280px]">
                    <PrayerChip prayer={p} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
