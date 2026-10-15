/**
 * In-memory repository seeded with the prototype's data (same names, clients,
 * tasks) so the director sees exactly what he approved — persisted to
 * localStorage so a reload does not wipe it. Replaced by Supabase later.
 */
import type { Repo, Snapshot } from './repo'
import type { ChannelId, Client, Message, Presence, Profile, Project, Task, TaskPart, User } from '@/types'
import { addIso, todayIso } from '@/lib/dates'
import { validateClientPatch, validateNewTask, validatePart, validateTaskPatch } from '@/lib/validate'

import { MOCK_DATA_KEY as KEY, MOCK_SESSION_KEY as SESSION_KEY } from './mockKeys'

const PALETTE = ['#D9B600', '#9B7BF2', '#4CB782', '#F06FA7', '#4E9BFA', '#F2994A', '#3B8EA5', '#7FA23B']

const TEAM: Array<[string, string, 'admin' | 'creative']> = [
  ['Ibrahim AlQifari', 'Producer', 'admin'],
  ['Abdulaziz Husic', 'Producer', 'admin'],
  ['Abdullah AboAlhossain', 'Motion designer', 'creative'],
  ['Youssef AboAlhossain', 'Video editor', 'creative'],
  ['Youssef Aly', 'Art director', 'creative'],
  ['Jusuf Alagic', 'UI designer', 'creative'],
  ['Muhamed Alagic', 'Developer', 'creative'],
  ['Muhammed Omara', 'Motion designer', 'creative'],
  ['Osama Wanas', 'Graphic designer', 'creative'],
  ['Seham Saleh', 'Copywriter', 'creative'],
  ['Tuhel', 'UI designer', 'creative'],
]

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')

function seed(): Snapshot {
  const users: User[] = TEAM.map(([name, title, role], i) => ({
    id: 'u' + (i + 1),
    name,
    email: slug(name) + '@hamsha.studio',
    role,
    title,
    color: PALETTE[i % PALETTE.length],
  }))

  // Empty start (Yousef, 2026-10-14): no clients, projects, tasks or messages —
  // he adds everything himself to learn the flow. Team members stay so roles can log in.
  const clients: Client[] = []
  users.push({ id: 'u90', name: 'عميل تجريبي', email: 'team@directaid.org', role: 'client', color: '#D9B600' })
  const projects: Project[] = []
  const tasks: Task[] = []
  const parts: TaskPart[] = []
  const messages: Message[] = []

  const profiles: Record<string, Profile> = {}
  for (const u of users) profiles[u.id] = { userId: u.id, city: 'riyadh', whStart: 9, whEnd: 17, notes: '', theme: 'light', lang: 'ar', weekStart: 'monday' }

  return { users, clients, projects, tasks, parts, messages, presence: {}, profiles }
}

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Snapshot>
      const ok = ['users', 'clients', 'projects', 'tasks', 'parts', 'messages'].every((k) => Array.isArray((parsed as Record<string, unknown>)[k]))
      if (ok && parsed.profiles && parsed.presence) return parsed as Snapshot
    }
  } catch {
    /* ignore */
  }
  const s = seed()
  write(s)
  return s
}
function write(s: Snapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms))

export function createMockRepo(): Repo {
  let snap = read()
  const subs = new Set<(s: Snapshot) => void>()
  const commit = () => {
    snap = { ...snap }
    write(snap)
    subs.forEach((cb) => cb(snap))
  }
  // Another tab wrote → adopt its snapshot so we never overwrite it with a stale copy
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY && e.newValue) {
        try {
          snap = JSON.parse(e.newValue) as Snapshot
          subs.forEach((cb) => cb(snap))
        } catch {
          /* ignore */
        }
      }
    })
  }
  let seq = 1000
  const nid = (p: string) => p + seq++ + Math.random().toString(36).slice(2, 6)

  return {
    async signIn(email, password) {
      await delay(300)
      const u = snap.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
      // Mock rule: any non-empty password. Real auth arrives with Supabase.
      if (!u || !password) throw new Error('invalid')
      localStorage.setItem(SESSION_KEY, u.id)
      return u
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY)
    },
    async restoreSession() {
      const id = localStorage.getItem(SESSION_KEY)
      return snap.users.find((u) => u.id === id) ?? null
    },
    async load() {
      await delay(50)
      return snap
    },
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },

    async createClient(name, ownerId, defaultProjectName) {
      const T = todayIso()
      const c: Client = { id: nid('c'), name, color: PALETTE[snap.clients.length % PALETTE.length], ownerId, start: T, end: addIso(T, 60), contract: 'draft' }
      snap.clients = [...snap.clients, c]
      snap.projects = [...snap.projects, { id: nid('p'), clientId: c.id, name: defaultProjectName, leadId: ownerId, color: c.color }]
      commit()
      return c
    },
    async updateClient(id, patch) {
      const cur = snap.clients.find((c) => c.id === id)
      if (!cur) throw new Error('not found')
      validateClientPatch(patch, cur)
      const next = { ...cur, ...patch, id }
      snap.clients = snap.clients.map((c) => (c.id === id ? next : c))
      commit()
      return next
    },
    async deleteClient(id) {
      snap.messages = snap.messages.filter((m) => m.channel !== `client:${id}`)
      snap.clients = snap.clients.filter((c) => c.id !== id)
      snap.projects = snap.projects.filter((p) => p.clientId !== id)
      const gone = new Set(snap.tasks.filter((t) => t.clientId === id).map((t) => t.id))
      snap.messages = snap.messages.filter((m) => !(m.channel.startsWith('task:') && gone.has(m.channel.slice(5))))
      snap.tasks = snap.tasks.filter((t) => !gone.has(t.id))
      snap.parts = snap.parts.filter((p) => !gone.has(p.taskId))
      commit()
    },
    async createProject(input) {
      const p: Project = { ...input, id: nid('p') }
      snap.projects = [...snap.projects, p]
      commit()
      return p
    },
    async updateProject(id, patch) {
      const cur = snap.projects.find((c) => c.id === id)
      if (!cur) throw new Error('not found')
      const next = { ...cur, ...patch, id }
      snap.projects = snap.projects.map((c) => (c.id === id ? next : c))
      commit()
      return next
    },
    async deleteProject(id) {
      snap.projects = snap.projects.filter((p) => p.id !== id)
      const gone = new Set(snap.tasks.filter((t) => t.projectId === id).map((t) => t.id))
      snap.messages = snap.messages.filter((m) => !(m.channel.startsWith('task:') && gone.has(m.channel.slice(5))))
      snap.tasks = snap.tasks.filter((t) => !gone.has(t.id))
      snap.parts = snap.parts.filter((p) => !gone.has(p.taskId))
      commit()
    },
    async createTask(input, firstPartLabel) {
      validateNewTask(input)
      const t: Task = { ...input, id: nid('k'), approval: 'draft', version: 1 }
      snap.tasks = [...snap.tasks, t]
      snap.parts = [...snap.parts, { id: nid('p'), taskId: t.id, label: firstPartLabel, assigneeId: t.ownerId, hours: 4, day: t.start, done: false, order: 0 }]
      commit()
      return t
    },
    async updateTask(id, patch, version) {
      const cur = snap.tasks.find((t) => t.id === id)
      if (!cur) throw new Error('not found')
      if (cur.version !== version) throw new Error('stale')
      validateTaskPatch(patch, cur)
      const next = { ...cur, ...patch, version: cur.version + 1 }
      snap.tasks = snap.tasks.map((t) => (t.id === id ? next : t))
      // parts always stay inside the task's date range
      snap.parts = snap.parts.map((p) => (p.taskId === id ? { ...p, day: p.day < next.start ? next.start : p.day > next.end ? next.end : p.day } : p))
      commit()
      return next
    },
    async deleteTask(id) {
      snap.messages = snap.messages.filter((m) => m.channel !== `task:${id}`)
      snap.tasks = snap.tasks.filter((t) => t.id !== id)
      snap.parts = snap.parts.filter((p) => p.taskId !== id)
      commit()
    },
    async upsertPart(part) {
      validatePart(part, snap.tasks.find((t) => t.id === part.taskId))
      const p: TaskPart = { ...part, id: part.id ?? nid('p') }
      const exists = snap.parts.some((x) => x.id === p.id)
      snap.parts = exists ? snap.parts.map((x) => (x.id === p.id ? p : x)) : [...snap.parts, p]
      commit()
      return p
    },
    async deletePart(id) {
      snap.parts = snap.parts.filter((p) => p.id !== id)
      commit()
    },

    async sendMessage(channel: ChannelId, senderId, body) {
      const m: Message = { id: nid('m'), channel, senderId, body, at: new Date().toISOString() }
      snap.messages = [...snap.messages, m]
      commit()
      return m
    },
    async setPresence(userId, p: Presence) {
      snap.presence = { ...snap.presence, [userId]: p }
      commit()
    },
    async updateUser(id, patch) {
      const cur = snap.users.find((u) => u.id === id)
      if (!cur) throw new Error('not found')
      const next = { ...cur, ...patch, id }
      snap.users = snap.users.map((u) => (u.id === id ? next : u))
      commit()
      return next
    },
    async updateProfile(userId, patch) {
      const next = { ...snap.profiles[userId], ...patch, userId }
      snap.profiles = { ...snap.profiles, [userId]: next }
      commit()
      return next
    },
  }
}
