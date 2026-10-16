import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clientById, dueDate, isDone, partsOf, progressOf, projectById, urgency } from '@/lib/derive'
import { fmtDate, useNarrow, useStr } from '@/lib/useStr'
import { useData } from '@/store/session'
import { useUi } from '@/store/ui'
import { TASK_TYPES } from '@/types'
import { Bar, Button, SectionTitle } from './ui'

/**
 * What a CLIENT sees when opening a task (design S12): title, project, delivery date,
 * progress and the parts as done/not-done steps — no people, hours, briefs or internals.
 */
export function ClientTaskSummary() {
  const { t, lang } = useStr()
  const s = useData()
  const ui = useUi()
  const narrow = useNarrow()
  const task = s.tasks.find((x) => x.id === ui.taskId)
  if (!task) return null
  const client = clientById(s, task.clientId)
  const project = projectById(s, task.projectId)
  const parts = partsOf(s, task.id)
  const pr = progressOf(parts)
  const done = isDone(s, task)
  const u = urgency(s, task)
  const color = project?.color ?? client?.color ?? '#D9B600'
  const status = done ? t('statusDelivered') : u === 'late' ? t('statusLate') : pr.done > 0 ? t('statusInProgress') : t('statusPlanned')

  return (
    <div className="fixed inset-0 z-[70] bg-black/25 grid place-items-center p-4 anim-fade" onClick={() => ui.openTask(null)}>
      <div
        className={cn('rounded-lg bg-card border border-border shadow-[0_24px_60px_rgba(0,0,0,0.18)] anim-sheet flex flex-col gap-4 p-5', narrow ? 'w-full' : 'w-[min(520px,100%)]')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <span className="w-[10px] h-[10px] rounded-full shrink-0 mt-2" style={{ background: color }} />
          <div className="min-w-0 flex-1">
            <div dir="auto" className="text-[17px] font-semibold leading-snug">
              {task.title}
            </div>
            <div className="text-[12px] text-fg-secondary mt-0.5">
              {project?.name} · {TASK_TYPES[task.type][lang]}
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => ui.openTask(null)} aria-label={t('cancel')}>
            <X size={16} />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className={cn('rounded-md p-3', done ? 'bg-success-tint text-success-dark' : u === 'late' ? 'bg-danger-tint text-danger-dark' : 'bg-muted-bg text-fg')}>
            <div className="text-[10.5px] font-bold tracking-[0.06em] uppercase opacity-80">{t('status')}</div>
            <div className="text-[15px] font-semibold mt-1 flex items-center gap-1.5">
              {done && <Check size={16} />} {status}
            </div>
          </div>
          <div className="rounded-md p-3 bg-muted-bg">
            <div className="text-[10.5px] font-bold tracking-[0.06em] uppercase text-fg-secondary">{t('deliveryDate')}</div>
            <div className="text-[15px] font-semibold mt-1">{fmtDate(task.end, lang)}</div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <SectionTitle>{t('progressLabel')}</SectionTitle>
            <span className="text-[12.5px] font-bold tabular-nums">{pr.pct}%</span>
          </div>
          <Bar pct={pr.pct} color={color} className="mt-2" />
        </div>

        {parts.length > 0 && (
          <div>
            <SectionTitle>{t('stepsLabel')}</SectionTitle>
            <ol className="mt-2 flex flex-col gap-1.5">
              {parts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2.5 text-[13px]">
                  <span className={cn('w-[18px] h-[18px] rounded-full grid place-items-center text-[10px] font-bold shrink-0', p.done ? 'bg-success text-white' : 'bg-muted-bg text-fg-secondary')}>
                    {p.done ? <Check size={11} /> : i + 1}
                  </span>
                  <span dir="auto" className={cn('font-semibold', p.done && 'line-through text-fg-secondary')}>
                    {p.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="text-[11px] text-fg-muted">{t('clientSummaryNote', { date: fmtDate(dueDate(task), lang) })}</div>
      </div>
    </div>
  )
}
