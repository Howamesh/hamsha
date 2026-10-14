import { AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { alerts, visibleTasks } from '@/lib/derive'
import { fmtDate, useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'

export function useAlerts() {
  const s = useData()
  const user = useUser()
  const calId = useUi((u) => u.calId)
  if (!user) return []
  return alerts(s, visibleTasks(s, user, calId))
}

export function AlertsList() {
  const { t, lang } = useStr()
  const list = useAlerts()
  const openTask = useUi((u) => u.openTask)
  const setFocus = useUi((u) => u.setFocus)
  if (!list.length) {
    return <div className="rounded-md border border-dashed border-fg-faint p-4 text-[13px] text-fg-secondary text-center">{t('allClearAlerts')}</div>
  }
  return (
    <div className="flex flex-col gap-2">
      {list.map((a) => (
        <button
          key={a.task.id}
          type="button"
          onClick={() => {
            setFocus(a.task.start)
            openTask(a.task.id)
          }}
          className={cn(
            'flex items-start gap-2.5 rounded-md border p-3 text-start cursor-pointer',
            a.kind === 'late' ? 'bg-danger-tint border-danger-dark/20 text-danger-dark' : 'bg-warning-tint border-warning-dark/20 text-warning-dark',
          )}
        >
          {a.kind === 'late' ? <AlertTriangle size={16} className="shrink-0 mt-0.5" /> : <Clock size={16} className="shrink-0 mt-0.5" />}
          <span className="text-[12.5px] font-semibold leading-snug">
            {t(a.kind === 'late' ? 'alertLate' : 'alertDue', { task: a.task.title, who: a.who?.name ?? '', date: fmtDate(a.date, lang) })}
          </span>
        </button>
      ))}
    </div>
  )
}
