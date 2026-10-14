import { Check } from 'lucide-react'
import { cn, initials, prefix } from '@/lib/utils'
import { clientById, projectById, taskProgress, urgency } from '@/lib/derive'
import { useData } from '@/store/session'
import { useUi } from '@/store/ui'
import { useStr } from '@/lib/useStr'
import type { Task } from '@/types'

const dot: Record<string, string> = { late: 'var(--accent)', soon: 'var(--warning)', done: 'var(--success)', ok: 'transparent' }

/** Rich task card used in month cells (the director's "rich" card style). */
export function TaskChip({ task, compact = false }: { task: Task; compact?: boolean }) {
  const s = useData()
  const openTask = useUi((u) => u.openTask)
  const { lang } = useStr()
  const client = clientById(s, task.clientId)
  const project = projectById(s, task.projectId)
  const pr = taskProgress(s, task)
  const u = urgency(s, task)
  const done = u === 'done'
  const color = project?.color ?? client?.color ?? '#D9B600'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openTask(task.id)
      }}
      className={cn(
        'w-full text-start rounded-[5px] overflow-hidden cursor-pointer transition-opacity hover:opacity-90 border border-transparent',
        done && 'opacity-75',
      )}
      style={{ background: color + '22', borderInlineStartColor: color, borderInlineStartWidth: 3 }}
      title={task.title}
    >
      <div className={cn('flex items-center gap-1.5 px-1.5', compact ? 'py-[3px]' : 'pt-1')}>
        <span
          className="grid place-items-center rounded-[4px] text-[9px] font-bold text-white shrink-0"
          style={{ width: 16, height: 16, background: client?.color ?? color }}
        >
          {initials(client?.name ?? '?', 1)}
        </span>
        {!compact && project && (
          <span className="text-[9px] font-bold px-1 rounded bg-card/70 text-fg-secondary shrink-0">{prefix(project.name)}</span>
        )}
        <span dir="auto" className={cn('text-[11.5px] font-semibold truncate min-w-0 flex-1', done && 'line-through')}>{task.title}</span>
        {done ? (
          <Check size={11} className="text-success-dark shrink-0" />
        ) : (
          <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: dot[u] }} />
        )}
      </div>
      {!compact && (
        <div className="px-1.5 pb-1 flex items-center gap-1.5">
          <div className="flex-1 h-[3px] rounded-full bg-card/80 overflow-hidden">
            <div className="h-full" style={{ width: `${pr.pct}%`, background: color }} />
          </div>
          <span className="text-[9.5px] font-semibold text-fg-secondary tabular-nums">
            {pr.done}/{pr.total}
          </span>
          <span className="text-[9.5px] text-fg-muted tabular-nums" dir="ltr">
            {new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short' }).format(
              new Date(task.end + 'T12:00:00'),
            )}
          </span>
        </div>
      )}
    </button>
  )
}
