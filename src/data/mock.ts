/**
 * In-memory repository seeded with the prototype's data (same names, clients,
 * tasks) so the director sees exactly what he approved — persisted to
 * localStorage so a reload does not wipe it. Replaced by Supabase later.
 */
import type { Repo, Snapshot } from './repo'
import type { ChannelId, Client, Message, Presence, Profile, Project, Task, TaskPart, User } from '@/types'
import { addIso, todayIso } from '@/lib/dates'

const KEY = 'hamsha.mock.v1'
const SESSION_KEY = 'hamsha.mock.session'

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
  const T = todayIso()
  const near = (n: number) => addIso(T, n)
  const users: User[] = TEAM.map(([name, title, role], i) => ({
    id: 'u' + (i + 1),
    name,
    email: slug(name.split(' ')[0]) + '@hamsha.studio',
    role,
    title,
    color: PALETTE[i % PALETTE.length],
  }))
  const byName = (n: string) => users.find((u) => u.name === n)!.id

  const clients: Client[] = [
    { id: 'directaid', name: 'DirectAid', color: '#D9B600', ownerId: byName('Ibrahim AlQifari'), start: near(-14), end: near(75), contract: 'signed' },
    { id: 'jowan', name: 'Jowan Print', color: '#9B7BF2', ownerId: byName('Abdulaziz Husic'), start: near(-7), end: near(120), contract: 'sent' },
  ]
  // A client-side login for DirectAid (phase 2 — exists in the model from day 1)
  users.push({ id: 'u90', name: 'DirectAid', email: 'team@directaid.org', role: 'client', color: '#D9B600', clientId: 'directaid' })

  const projects: Project[] = [
    { id: 'da-sm', clientId: 'directaid', name: 'Social Media', leadId: byName('Abdullah AboAlhossain'), color: '#D9B600' },
    { id: 'da-ux', clientId: 'directaid', name: 'UI & UX', leadId: byName('Tuhel'), color: '#9B7BF2' },
    { id: 'jw-dev', clientId: 'jowan', name: 'Web & App Dev', leadId: byName('Muhamed Alagic'), color: '#9B7BF2' },
    { id: 'jw-sm', clientId: 'jowan', name: 'Social Media', leadId: byName('Osama Wanas'), color: '#F06FA7' },
  ]

  let seq = 100
  const tasks: Task[] = []
  const parts: TaskPart[] = []
  const mk = (
    t: Omit<Task, 'id' | 'version' | 'approval'> & { approval?: Task['approval'] },
    chain: Array<[string, string, boolean]>,
  ) => {
    const id = 'k' + seq++
    tasks.push({ approval: 'draft', ...t, id, version: 1 })
    const days = Math.max(1, Math.round((new Date(t.end).getTime() - new Date(t.start).getTime()) / 864e5) + 1)
    chain.forEach(([label, who, done], i) => {
      parts.push({ id: 'p' + seq++, taskId: id, label, assigneeId: byName(who), hours: 4, day: addIso(t.start, Math.min(i, days - 1)), done, order: i })
    })
  }
  const thu = (k: number) => {
    const d = new Date()
    const diff = (4 - d.getDay() + 7) % 7
    return near(diff + 7 * k)
  }

  mk({ projectId: 'da-sm', clientId: 'directaid', title: 'Reel — Water wells campaign', type: 'reel', start: near(-1), end: near(1), ownerId: byName('Abdullah AboAlhossain') },
    [['Content idea', 'Seham Saleh', true], ['Design', 'Abdullah AboAlhossain', false], ['Approval', 'Youssef Aly', false]])
  mk({ projectId: 'da-sm', clientId: 'directaid', title: 'Static — Eid thank-you post', type: 'static', start: near(-6), end: near(-5), ownerId: byName('Abdullah AboAlhossain'), approval: 'approved' },
    [['Content idea', 'Seham Saleh', true], ['Design', 'Abdullah AboAlhossain', true], ['Approval', 'Youssef Aly', true]])
  mk({ projectId: 'da-sm', clientId: 'directaid', title: 'Carousel — Orphan sponsorship', type: 'carousel', start: near(2), end: near(6), ownerId: byName('Abdullah AboAlhossain') },
    [['Content idea', 'Seham Saleh', false], ['Design', 'Abdullah AboAlhossain', false], ['Approval', 'Youssef Aly', false]])
  mk({ projectId: 'da-sm', clientId: 'directaid', title: 'Logo animation — intro sting', type: 'logo', start: near(-5), end: near(-2), ownerId: byName('Muhammed Omara') },
    [['Storyboard', 'Muhammed Omara', true], ['Animation', 'Muhammed Omara', false], ['Approval', 'Youssef Aly', false]])
  mk({ projectId: 'da-ux', clientId: 'directaid', title: 'UI — Donation flow v2', type: 'ui', start: near(-1), end: near(4), ownerId: byName('Tuhel') },
    [['Wireframes', 'Tuhel', true], ['UI design', 'Tuhel', false], ['Review', 'Abdulaziz Husic', false]])
  mk({ projectId: 'da-ux', clientId: 'directaid', title: 'Sprint review — client call', type: 'call', start: thu(0), end: thu(0), ownerId: byName('Abdulaziz Husic') },
    [['Demo prep', 'Tuhel', false], ['Client call', 'Abdulaziz Husic', false]])
  mk({ projectId: 'da-ux', clientId: 'directaid', title: 'Sprint review — client call', type: 'call', start: thu(1), end: thu(1), ownerId: byName('Abdulaziz Husic') },
    [['Demo prep', 'Tuhel', false], ['Client call', 'Abdulaziz Husic', false]])
  mk({ projectId: 'jw-dev', clientId: 'jowan', title: 'App — order flow prototype', type: 'ui', start: near(1), end: near(8), ownerId: byName('Muhamed Alagic') },
    [['Flows', 'Muhamed Alagic', false], ['UI design', 'Jusuf Alagic', false], ['Approval', 'Abdulaziz Husic', false]])
  mk({ projectId: 'jw-sm', clientId: 'jowan', title: 'Launch teaser — 3 posts', type: 'static', start: near(3), end: near(5), ownerId: byName('Osama Wanas') },
    [['Copy', 'Seham Saleh', false], ['Design', 'Osama Wanas', false], ['Approval', 'Abdulaziz Husic', false]])

  const now = Date.now()
  const messages: Message[] = [
    { id: 'm1', channel: 'team', senderId: byName('Youssef Aly'), body: 'Reel for DirectAid — send me the cut before 4pm please.', at: new Date(now - 3 * 36e5).toISOString() },
    { id: 'm2', channel: 'team', senderId: byName('Seham Saleh'), body: 'Copy for the orphan carousel is in the drive.', at: new Date(now - 2 * 36e5).toISOString() },
    { id: 'm3', channel: 'team', senderId: byName('Abdulaziz Husic'), body: 'Sprint review Thursday, demo-ready by noon.', at: new Date(now - 1 * 36e5).toISOString() },
    { id: 'm4', channel: 'client:directaid', senderId: byName('Ibrahim AlQifari'), body: 'Welcome! This calendar is live — everything we promised is on it.', at: new Date(now - 5 * 36e5).toISOString() },
    { id: 'm5', channel: 'client:directaid', senderId: 'u90', body: 'Great, checking the deliveries now.', at: new Date(now - 4 * 36e5).toISOString() },
  ]

  const profiles: Record<string, Profile> = {}
  for (const u of users) profiles[u.id] = { userId: u.id, city: 'riyadh', whStart: 9, whEnd: 17, notes: '', theme: 'light', lang: 'ar', weekStart: 'monday' }

  return { users, clients, projects, tasks, parts, messages, presence: {}, profiles }
}

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Snapshot
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

    async createClient(name, ownerId) {
      const T = todayIso()
      const c: Client = { id: nid('c'), name, color: PALETTE[snap.clients.length % PALETTE.length], ownerId, start: T, end: addIso(T, 60), contract: 'draft' }
      snap.clients = [...snap.clients, c]
      snap.projects = [...snap.projects, { id: nid('p'), clientId: c.id, name: 'General', leadId: ownerId, color: c.color }]
      commit()
      return c
    },
    async createTask(input) {
      const t: Task = { ...input, id: nid('k'), approval: 'draft', version: 1 }
      snap.tasks = [...snap.tasks, t]
      snap.parts = [...snap.parts, { id: nid('p'), taskId: t.id, label: 'Design', assigneeId: t.ownerId, hours: 4, day: t.start, done: false, order: 0 }]
      commit()
      return t
    },
    async updateTask(id, patch, version) {
      const cur = snap.tasks.find((t) => t.id === id)
      if (!cur) throw new Error('not found')
      if (cur.version !== version) throw new Error('stale')
      const next = { ...cur, ...patch, version: cur.version + 1 }
      snap.tasks = snap.tasks.map((t) => (t.id === id ? next : t))
      commit()
      return next
    },
    async deleteTask(id) {
      snap.tasks = snap.tasks.filter((t) => t.id !== id)
      snap.parts = snap.parts.filter((p) => p.taskId !== id)
      commit()
    },
    async upsertPart(part) {
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
    async updateProfile(userId, patch) {
      const next = { ...snap.profiles[userId], ...patch, userId }
      snap.profiles = { ...snap.profiles, [userId]: next }
      commit()
      return next
    },
  }
}
