import { create } from 'zustand'
import { useUi } from './ui'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/useStr'
import { partsCount } from '@/lib/i18n'
import { repo } from '@/data'
import type { Snapshot } from '@/data/repo'
import type { ChannelId, Client, Presence, Profile, Project, Task, TaskPart, User } from '@/types'

interface SessionState {
  user: User | null
  booted: boolean
  data: Snapshot | null
  boot: () => Promise<void>
  signIn: (email: string, pw: string) => Promise<void>
  signOut: () => Promise<void>

  createClient: (name: string, defaultProjectName: string) => Promise<void>
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>
  deleteClient: (id: string) => Promise<void>
  createProject: (input: Omit<Project, 'id'>) => Promise<void>
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  createTask: (input: Omit<Task, 'id' | 'version' | 'approval'>, firstPartLabel: string) => Promise<Task>
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  upsertPart: (part: Omit<TaskPart, 'id'> & { id?: string }) => Promise<void>
  deletePart: (id: string) => Promise<void>
  sendMessage: (channel: ChannelId, body: string) => Promise<void>
  setPresence: (p: Presence) => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
  updateUser: (id: string, patch: Partial<User>) => Promise<void>
}

/** UI-level permission boundary (the database enforces the same rules with RLS). */
function adminOnly(get: () => SessionState): User {
  const u = get().user
  if (!u || u.role !== 'admin') throw new Error('forbidden')
  return u
}

let booting = false

const EMPTY: Snapshot = { users: [], clients: [], projects: [], tasks: [], parts: [], messages: [], presence: {}, profiles: {} }

/** Surface repository errors to the user — event handlers and async calls never reach the ErrorBoundary. */
function report(e: unknown): never {
  const ui = useUi.getState()
  ui.setToast(errorMessage(e, ui.lang))
  if (e instanceof Error) (e as Error & { reported?: boolean }).reported = true
  throw e
}
const guard = <T,>(p: Promise<T>): Promise<T> => p.catch(report)

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  booted: false,
  data: null,

  async boot() {
    if (booting) return
    booting = true
    const user = await repo.restoreSession()
    const data = await repo.load()
    repo.subscribe((data) => set({ data }))
    set({ user, data, booted: true })
  },
  async signIn(email, pw) {
    const user = await repo.signIn(email, pw)
    set({ user })
  },
  async signOut() {
    await repo.signOut()
    set({ user: null })
    useUi.getState().resetForUser()
  },

  async createClient(name, defaultProjectName) {
    const u = adminOnly(get)
    await guard(repo.createClient(name, u.id, defaultProjectName))
  },
  async updateClient(id, patch) {
    adminOnly(get)
    await guard(repo.updateClient(id, patch))
  },
  async deleteClient(id) {
    adminOnly(get)
    await guard(repo.deleteClient(id))
  },
  async createProject(input) {
    adminOnly(get)
    await guard(repo.createProject(input))
  },
  async updateProject(id, patch) {
    adminOnly(get)
    await guard(repo.updateProject(id, patch))
  },
  async deleteProject(id) {
    adminOnly(get)
    await guard(repo.deleteProject(id))
  },
  async createTask(input, firstPartLabel) {
    adminOnly(get)
    return guard(repo.createTask(input, firstPartLabel))
  },
  async updateTask(id, patch) {
    const u = get().user
    const cur = (get().data ?? EMPTY).tasks.find((t) => t.id === id)
    if (!u || !cur) return
    if (u.role === 'client') throw new Error('forbidden')
    if (u.role === 'creative') {
      // Creatives may only send a draft for approval — same rule the database enforces
      const keys = Object.keys(patch)
      const ok = keys.length === 1 && keys[0] === 'approval' && cur.approval === 'draft' && patch.approval === 'pending'
      if (!ok) throw new Error('forbidden')
    }
    const before = (get().data ?? EMPTY).parts.filter((p) => p.taskId === id)
    await guard(repo.updateTask(id, patch, cur.version))
    // Parts pulled inside the new date range are announced, never moved silently
    const after = (get().data ?? EMPTY).parts.filter((p) => p.taskId === id)
    const moved = after.filter((p) => before.find((b) => b.id === p.id)?.day !== p.day)
    if (moved.length) {
      const ui = useUi.getState()
      const day = fmtDate(moved[0].day, ui.lang)
      ui.setToast(
        ui.lang === 'ar' ? `تم نقل ${partsCount(moved.length, 'ar')} إلى ${day} لأن مدة المهمة تغيّرت — راجع توزيع الأيام والساعات.` : `${partsCount(moved.length, 'en')} moved to ${day} because the task dates changed — review days and hours.`,
        'info',
      )
    }
  },
  async deleteTask(id) {
    adminOnly(get)
    await guard(repo.deleteTask(id))
  },
  async upsertPart(part) {
    const u = get().user
    if (!u) return
    if (u.role === 'client') throw new Error('forbidden')
    if (u.role === 'creative') {
      const cur = part.id ? (get().data ?? EMPTY).parts.find((p) => p.id === part.id) : undefined
      // Creatives: only toggling `done` on their own existing part
      if (!cur || cur.assigneeId !== u.id) throw new Error('forbidden')
      const same = cur.label === part.label && cur.assigneeId === part.assigneeId && cur.hours === part.hours && cur.day === part.day && (cur.time ?? '') === (part.time ?? '') && cur.order === part.order
      if (!same) throw new Error('forbidden')
    }
    await guard(repo.upsertPart(part))
  },
  async deletePart(id) {
    adminOnly(get)
    await guard(repo.deletePart(id))
  },
  async sendMessage(channel, body) {
    const u = get().user
    if (!u || !body.trim()) return
    const allowed =
      channel === 'team' ? u.role !== 'client' : channel.startsWith('client:') ? u.role === 'admin' || (u.role === 'client' && channel === `client:${u.clientId}`) : true
    if (!allowed) throw new Error('forbidden')
    await guard(repo.sendMessage(channel, u.id, body.trim()))
  },
  async setPresence(p) {
    const u = get().user
    if (!u) return
    await guard(repo.setPresence(u.id, p))
  },
  async updateUser(id, patch) {
    adminOnly(get)
    await guard(repo.updateUser(id, patch))
  },
  async updateProfile(patch) {
    const u = get().user
    if (!u) return
    await guard(repo.updateProfile(u.id, patch))
  },
}))

export const useData = () => useSession((s) => s.data ?? EMPTY)
export const useUser = () => useSession((s) => (s.user && s.data?.users.find((u) => u.id === s.user!.id)) ?? s.user)
