import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IsoDate } from '@/lib/dates'
import { useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { TASK_TYPES, type TaskType } from '@/types'
import { Avatar, Button, Input, SectionTitle } from './ui'

/**
 * "New task" sheet — opened by clicking a day (admin). Gathers everything the
 * task card shows so the task lands complete on the calendar in one step.
 */
export function NewTaskDialog({ day, clientId, onClose }: { day: IsoDate; clientId: string | null; onClose: () => void }) {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const sess = useSession()
  const openTask = useUi((u) => u.openTask)

  const [title, setTitle] = useState('')
  const [client, setClientState] = useState(clientId ?? s.clients[0]?.id ?? '')
  const projects = s.projects.filter((p) => p.clientId === client)
  const [projectChoice, setProject] = useState<string | null>(null)
  // Fall back to the client's first project whenever the chosen one no longer belongs to it
  const project = projectChoice && projects.some((p) => p.id === projectChoice) ? projectChoice : (projects[0]?.id ?? '')
  const setClient = (id: string) => {
    setClientState(id)
    setProject(null)
  }
  const [type, setType] = useState<TaskType>('static')
  const [owner, setOwner] = useState(me.id)
  const [start, setStart] = useState(day)
  const [end, setEnd] = useState(day)
  const [part, setPart] = useState('')
  const team = s.users.filter((u) => u.role !== 'client')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !client || !project) return
    const task = await sess.createTask(
      { projectId: project, clientId: client, title: title.trim(), type, start, end: end < start ? start : end, ownerId: owner },
      part.trim() || t('defaultPart'),
    )
    onClose()
    openTask(task.id)
  }

  const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'

  return (
    <div className="fixed inset-0 z-[80] bg-black/35 grid place-items-center p-4 anim-fade" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-[min(560px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet max-h-[92dvh] overflow-y-auto no-scrollbar" role="dialog">
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">{t('newTask')}</div>
          <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label={t('cancel')}>
            <X size={16} />
          </Button>
        </div>

        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('taskTitle')} dir="auto" required />

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <SectionTitle>{t('client')}</SectionTitle>
            <select value={client} onChange={(e) => setClient(e.target.value)} className={field} disabled={!!clientId}>
              {s.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <SectionTitle>{t('project')}</SectionTitle>
            <select value={project} onChange={(e) => setProject(e.target.value)} className={field}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t('taskType')}</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TASK_TYPES) as TaskType[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                className={cn('text-[12px] font-semibold rounded-md px-2.5 py-1.5 border cursor-pointer', type === k ? 'bg-fg text-bg border-fg' : 'bg-card text-fg-secondary border-border hover:text-fg')}
              >
                {TASK_TYPES[k][lang]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t('ownerLabel')}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {team.map((u) => (
              <button key={u.id} type="button" onClick={() => setOwner(u.id)} title={u.name} className="cursor-pointer">
                <Avatar name={u.name} color={u.color} size={32} className={cn('transition-opacity', owner === u.id ? 'ring-2 ring-fg ring-offset-2 ring-offset-card' : 'opacity-50 hover:opacity-90')} />
              </button>
            ))}
          </div>
          <div className="text-[12px] text-fg-secondary">{team.find((u) => u.id === owner)?.name}</div>
        </div>

        <div className="grid grid-cols-2 gap-3" dir="ltr">
          <label className="flex flex-col gap-1.5">
            <SectionTitle>{t('startDate')}</SectionTitle>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <SectionTitle>{t('deliveryDate')}</SectionTitle>
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={field} required />
          </label>
        </div>

        <Input value={part} onChange={(e) => setPart(e.target.value)} placeholder={t('firstPart')} dir="auto" className="py-2.5 text-[13px]" />

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim() || !client || !project}>
            {t('createTask')}
          </Button>
        </div>
      </form>
    </div>
  )
}
