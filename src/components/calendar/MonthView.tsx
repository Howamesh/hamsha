import { isSameMonth, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { dayFraction, fromIso, isWeekend, monthGrid, toIso } from '@/lib/dates'
import { hijriCell } from '@/lib/hijri'
import { tasksOnDay } from '@/lib/derive'
import { useStr, useNarrow, useNow } from '@/lib/useStr'
import { useUi } from '@/store/ui'
import { TaskChip } from '../TaskChip'
import type { Task } from '@/types'

export function MonthView({ tasks, onCreate, emptyMsg, hint }: { tasks: Task[]; onCreate?: (day: string) => void; emptyMsg: string; hint?: string }) {
  const { days, lang } = useStr()
  const narrow = useNarrow()
  const now = useNow()
  const focus = useUi((s) => s.focus)
  const weekStart = useUi((s) => s.weekStart)
  const setFocus = useUi((s) => s.setFocus)
  const setView = useUi((s) => s.setView)
  const f = fromIso(focus)
  const grid = monthGrid(f.getFullYear(), f.getMonth(), weekStart)
  const names = weekStart === 'sunday' ? [days[6], ...days.slice(0, 6)] : days
  const maxChips = narrow ? 2 : 3

  return (
    <div className="flex-1 flex flex-col min-h-0 relative rounded-md border border-border bg-card overflow-hidden">
      {tasks.length === 0 && (
        <div className="absolute inset-0 grid place-items-center z-[1] pointer-events-none">
          <div className="bg-bg border border-dashed border-fg-faint rounded-lg px-5 py-3.5 text-[13.5px] font-semibold text-fg-secondary max-w-[340px] text-center">
            {emptyMsg}
          </div>
        </div>
      )}
      <div className="grid grid-cols-7 border-b border-border">
        {names.map((n) => (
          <div key={n} className="px-2.5 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase text-fg-secondary">
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 min-h-0 no-scrollbar overflow-auto" style={{ gridAutoRows: 'minmax(0,1fr)' }}>
        {grid.map((d) => {
          const iso = toIso(d)
          const inMonth = isSameMonth(d, f)
          const today = isToday(d)
          const list = tasksOnDay(tasks, iso)
          const extra = list.length - maxChips
          return (
            <div
              key={iso}
              onClick={() => {
                // Phone: a tap opens the day; desktop: a click on an empty day creates (admin)
                if (narrow) {
                  setFocus(iso)
                  setView('day')
                } else onCreate?.(iso)
              }}
              onDoubleClick={() => {
                setFocus(iso)
                setView('day')
              }}
              className={cn(
                'relative border-b border-e border-border-soft p-1.5 flex flex-col gap-1 min-h-0 overflow-hidden',
                !inMonth && 'bg-out-month',
                inMonth && isWeekend(d) && 'bg-weekend',
                onCreate && 'cursor-crosshair',
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <span className={cn('text-[10px] font-medium text-fg-muted truncate', !inMonth && 'opacity-60')}>{hijriCell(d, lang)}</span>
                <span
                  className={cn(
                    'grid place-items-center min-w-[22px] h-[22px] px-1 rounded-full text-[12.5px] font-bold tabular-nums',
                    today ? 'bg-accent text-accent-fg' : inMonth ? 'text-fg' : 'text-fg-muted',
                  )}
                >
                  {d.getDate()}
                </span>
              </div>
              {today && (
                <div className="absolute inset-x-0 h-[2px] bg-accent z-[2] pointer-events-none" style={{ top: `${dayFraction(now) * 100}%` }}>
                  <span className="absolute top-[-3px] start-0 w-2 h-2 rounded-full bg-accent" />
                </div>
              )}
              <div className="flex flex-col gap-[3px] min-h-0">
                {list.slice(0, maxChips).map((t) => (
                  <TaskChip key={t.id} task={t} compact={narrow} />
                ))}
                {extra > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFocus(iso)
                      setView('day')
                    }}
                    className="text-[10.5px] font-semibold text-fg-secondary hover:text-fg text-start cursor-pointer"
                  >
                    {lang === 'ar' ? `+${extra} أخرى` : `+${extra} more`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {hint && !narrow && <div className="px-3 py-1.5 border-t border-border text-[11px] text-fg-muted">{hint}</div>}
    </div>
  )
}
