/**
 * Domain model — mirrors the planned Supabase schema 1:1 so the mock
 * repository and the real one return identical shapes.
 */
import type { IsoDate } from '@/lib/dates'

export type Role = 'admin' | 'creative' | 'client'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** Job title shown as small text under a creative's name */
  title?: string
  color: string
  /** For client users: which client they belong to */
  clientId?: string
}

export interface Client {
  id: string
  name: string
  color: string
  /** Project owner (the producer in charge) */
  ownerId: string
  /** Path/URL of the client's logo (shown on calendar cards) */
  logo?: string
  start: IsoDate
  end: IsoDate
  contract: 'draft' | 'sent' | 'signed'
}

export interface Project {
  id: string
  clientId: string
  name: string
  leadId: string
  color: string
}

export type TaskType = 'reel' | 'static' | 'carousel' | 'logo' | 'ui' | 'call'
export type ApprovalStatus = 'draft' | 'pending' | 'approved'

export interface Task {
  id: string
  projectId: string
  clientId: string
  title: string
  type: TaskType
  /** Inclusive all-day range. Client delivery = `end`; creative deadline = end − 1 day. */
  start: IsoDate
  end: IsoDate
  ownerId: string
  description?: string
  reference?: string
  milestone?: 'kickoff' | 'production' | 'delivery'
  approval: ApprovalStatus
  /** Optimistic-concurrency version (Codex's suggestion) */
  version: number
}

export interface TaskPart {
  id: string
  taskId: string
  label: string
  assigneeId: string
  hours: number
  day: IsoDate
  /** Optional hand-off time within the day, 'HH:MM' (e.g. content by 14:00, design by 17:00) */
  time?: string
  done: boolean
  order: number
}

export interface Attachment {
  id: string
  taskId: string
  name: string
  url?: string
}

export type ChannelId = 'team' | `client:${string}` | `task:${string}`

export interface Message {
  id: string
  channel: ChannelId
  senderId: string
  body: string
  at: string // ISO datetime
}

/** «ادعُ عضواً» — input of the admin invitation and the honest result (row written? e-mail sent?). */
export interface InviteInput {
  email: string
  role: Role
  name?: string
  /** required when role = 'client', forbidden otherwise */
  clientId?: string
}
export interface InviteResult {
  sent: boolean
  /** set when sent = false: 'already_registered' (an account with this e-mail exists) or 'send_failed' */
  reason?: 'already_registered' | 'send_failed'
  error?: string
}

export type Presence = 'live' | 'away'

export interface Profile {
  userId: string
  city: string
  whStart: number
  whEnd: number
  notes: string
  theme: 'light' | 'dark'
  lang: 'ar' | 'en'
  weekStart: 'monday' | 'sunday'
}

/** Derived helpers (never stored — progress is computed from parts). */
export interface TaskProgress {
  done: number
  total: number
  hours: number
  pct: number
}

export const TASK_TYPES: Record<TaskType, { en: string; ar: string }> = {
  reel: { en: 'Reel / video', ar: 'ريل / فيديو' },
  static: { en: 'Static post', ar: 'منشور ثابت' },
  carousel: { en: 'Carousel', ar: 'كاروسيل' },
  logo: { en: 'Logo / animation', ar: 'شعار / موشن' },
  ui: { en: 'UI / product', ar: 'واجهة / منتج' },
  call: { en: 'Call / review', ar: 'اجتماع / مراجعة' },
}
