/**
 * One validation layer at the repository boundary — shared by the mock and,
 * later, the Supabase repo. Throws on bad input so nothing invalid is ever stored.
 */
import type { Client, Task, TaskPart } from '@/types'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Strict YYYY-MM-DD that exists on the calendar (rejects 2026-02-30 — Chrome's Date.parse would roll it to March). */
export const isIsoDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !ISO.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function assertIsoDate(v: unknown, field: string): asserts v is string {
  if (!isIsoDate(v)) throw new Error(`invalid date for ${field}`)
}

export function validateTaskPatch(patch: Partial<Task>, cur: Task) {
  if (patch.start !== undefined) assertIsoDate(patch.start, 'start')
  if (patch.end !== undefined) assertIsoDate(patch.end, 'end')
  const start = patch.start ?? cur.start
  const end = patch.end ?? cur.end
  if (end < start) throw new Error('end before start')
  if (patch.title !== undefined && !patch.title.trim()) throw new Error('empty title')
}

export function validateNewTask(t: { start: string; end: string; title: string }) {
  assertIsoDate(t.start, 'start')
  assertIsoDate(t.end, 'end')
  if (t.end < t.start) throw new Error('end before start')
  if (!t.title.trim()) throw new Error('empty title')
}

export function validatePart(p: Omit<TaskPart, 'id'> & { id?: string }, task?: Task) {
  assertIsoDate(p.day, 'day')
  if (!(p.hours >= 0.5 && p.hours <= 999)) throw new Error('invalid hours')
  if (p.time !== undefined && p.time !== '' && !HHMM.test(p.time)) throw new Error('invalid time')
  if (!p.label.trim()) throw new Error('empty label')
  if (task && (p.day < task.start || p.day > task.end)) throw new Error('part day outside task range')
}

export function validateClientPatch(patch: Partial<Client>, cur: Client) {
  if (patch.start !== undefined) assertIsoDate(patch.start, 'start')
  if (patch.end !== undefined) assertIsoDate(patch.end, 'end')
  if ((patch.end ?? cur.end) < (patch.start ?? cur.start)) throw new Error('end before start')
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('empty name')
}
