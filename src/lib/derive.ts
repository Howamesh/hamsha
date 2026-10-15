/**
 * Everything the UI shows that is *computed* from stored data lives here —
 * progress, deadlines, alerts, focus. Nothing in this file is stored.
 */
import type { Snapshot } from '@/data/repo'
import type { Client, Task, TaskPart, TaskProgress, User } from '@/types'
import { addIso, daysBetween, todayIso, type IsoDate } from './dates'

export const partsOf = (s: Snapshot, taskId: string): TaskPart[] =>
  s.parts.filter((p) => p.taskId === taskId).sort((a, b) => a.order - b.order)

export function progressOf(parts: TaskPart[]): TaskProgress {
  const total = parts.length
  const done = parts.filter((p) => p.done).length
  const hours = parts.reduce((a, p) => a + (p.hours || 0), 0)
  return { done, total, hours, pct: total ? Math.round((done / total) * 100) : 0 }
}

export const taskProgress = (s: Snapshot, t: Task) => progressOf(partsOf(s, t.id))
export const isDone = (s: Snapshot, t: Task) => {
  const p = taskProgress(s, t)
  return p.total > 0 && p.done === p.total
}

/** Creative deadline = client delivery − 1 day (buffer for review), never before the start (same-day tasks). */
export const dueDate = (t: Task): IsoDate => {
  const d = addIso(t.end, -1)
  return d < t.start ? t.start : d
}

export type Urgency = 'done' | 'late' | 'soon' | 'ok'
export function urgency(s: Snapshot, t: Task, today = todayIso()): Urgency {
  if (isDone(s, t)) return 'done'
  const d = daysBetween(today, dueDate(t))
  if (d < 0) return 'late'
  if (d <= 1) return 'soon'
  return 'ok'
}

/** Tasks visible to a user, by role. */
export function visibleTasks(s: Snapshot, user: User, calId: string | null): Task[] {
  if (user.role === 'admin') return calId ? s.tasks.filter((t) => t.clientId === calId) : s.tasks
  if (user.role === 'client') return s.tasks.filter((t) => t.clientId === user.clientId)
  const mine = new Set(s.parts.filter((p) => p.assigneeId === user.id).map((p) => p.taskId))
  return s.tasks.filter((t) => t.ownerId === user.id || mine.has(t.id))
}

export function clientProgress(s: Snapshot, c: Client) {
  const tasks = s.tasks.filter((t) => t.clientId === c.id)
  const parts = s.parts.filter((p) => tasks.some((t) => t.id === p.taskId))
  const pr = progressOf(parts)
  const projects = s.projects.filter((p) => p.clientId === c.id).length
  return { tasks: tasks.length, projects, ...pr }
}

/** Open parts per member — for the admin "team workload" bars. */
export function workload(s: Snapshot): Array<{ user: User; open: number }> {
  return s.users
    .filter((u) => u.role !== 'client')
    .map((user) => ({ user, open: s.parts.filter((p) => p.assigneeId === user.id && !p.done).length }))
    .filter((w) => w.open > 0)
    .sort((a, b) => b.open - a.open)
}

export interface Alert {
  kind: 'late' | 'soon'
  task: Task
  who: User | undefined
  date: IsoDate
}
export function alerts(s: Snapshot, tasks: Task[]): Alert[] {
  const out: Alert[] = []
  for (const t of tasks) {
    const u = urgency(s, t)
    if (u === 'late' || u === 'soon') out.push({ kind: u, task: t, who: s.users.find((x) => x.id === t.ownerId), date: dueDate(t) })
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.date.localeCompare(b.date) : a.kind === 'late' ? -1 : 1))
}

/** The creative's "focus on this first": late first, then nearest deadline. */
export function focusTask(s: Snapshot, user: User): Task | null {
  const myOpen = new Set(s.parts.filter((p) => p.assigneeId === user.id && !p.done).map((p) => p.taskId))
  const mine = visibleTasks(s, user, null).filter((t) => !isDone(s, t) && (myOpen.size === 0 || myOpen.has(t.id)))
  if (!mine.length) return null
  return [...mine].sort((a, b) => {
    const ua = urgency(s, a) === 'late' ? 0 : 1
    const ub = urgency(s, b) === 'late' ? 0 : 1
    return ua - ub || dueDate(a).localeCompare(dueDate(b))
  })[0]
}

export const tasksOnDay = (tasks: Task[], day: IsoDate) => tasks.filter((t) => t.start <= day && day <= t.end)
export const userById = (s: Snapshot, id: string) => s.users.find((u) => u.id === id)
export const clientById = (s: Snapshot, id: string) => s.clients.find((c) => c.id === id)
export const projectById = (s: Snapshot, id: string) => s.projects.find((p) => p.id === id)
