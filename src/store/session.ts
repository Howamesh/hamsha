import { create } from 'zustand'
import { useUi } from './ui'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/useStr'
import { partsCount } from '@/lib/i18n'
import { repo } from '@/data'
import type { Snapshot } from '@/data/repo'
import type { PendingInvite, InviteInput, InviteResult, ChannelId, Client, ClientAccountInput, NewPostInput, NewVersionInput, Post, PostDecision, Presence, Profile, Project, Task, TaskPart, User } from '@/types'

interface SessionState {
  user: User | null
  booted: boolean
  bootError: string | null
  data: Snapshot | null
  boot: () => Promise<void>
  signIn: (email: string, pw: string) => Promise<void>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  /** Invite / reset link opened → the person sets a password and lands signed in. */
  completeInvite: (password: string) => Promise<void>

  createClient: (name: string, defaultProjectName: string) => Promise<void>
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>
  deleteClient: (id: string) => Promise<void>
  createProject: (input: Omit<Project, 'id'>) => Promise<void>
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  createTask: (input: Omit<Task, 'id' | 'version' | 'approval'>, firstPart: { label: string; time?: string; hours?: number }) => Promise<Task>
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  upsertPart: (part: Omit<TaskPart, 'id'> & { id?: string }) => Promise<void>
  deletePart: (id: string) => Promise<void>
  sendMessage: (channel: ChannelId, body: string) => Promise<void>
  setPresence: (p: Presence) => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
  updateUser: (id: string, patch: Partial<User>) => Promise<void>
  inviteMember: (input: InviteInput) => Promise<InviteResult>
  listPendingInvites: () => Promise<PendingInvite[]>
  resendInvite: (email: string) => Promise<InviteResult>

  createPost: (input: NewPostInput) => Promise<Post>
  addPostVersion: (input: NewVersionInput) => Promise<void>
  updatePost: (id: string, patch: Partial<Pick<Post, 'status' | 'publishedUrl' | 'title' | 'platform' | 'format' | 'taskId' | 'accountId'>>) => Promise<void>
  deletePost: (id: string) => Promise<void>
  decidePost: (versionId: string, decision: PostDecision, note?: string) => Promise<void>
  saveClientAccount: (input: ClientAccountInput) => Promise<void>
  deleteClientAccount: (id: string) => Promise<void>
}

/** UI-level permission boundary (the database enforces the same rules with RLS). */
function adminOnly(get: () => SessionState): User {
  const u = get().user
  if (!u || u.role !== 'admin') throw new Error('forbidden')
  return u
}

let booting = false
let unsubscribe: (() => void) | null = null

const EMPTY: Snapshot = { users: [], clients: [], projects: [], tasks: [], parts: [], messages: [], posts: [], postVersions: [], clientAccounts: [], presence: {}, profiles: {} }

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
  bootError: null,
  data: null,

  async boot() {
    if (booting) return
    booting = true
    try {
      const user = await repo.restoreSession()
      const data = await repo.load()
      if (!unsubscribe) unsubscribe = repo.subscribe((data) => set({ data }))
      set({ user, data, booted: true, bootError: null })
    } catch (e) {
      set({ booted: true, bootError: e instanceof Error ? e.message : String(e) })
    } finally {
      booting = false
    }
  },
  async signIn(email, pw) {
    const user = await repo.signIn(email, pw)
    // Reload for the new identity: never keep the previous account's snapshot in memory.
    const data = await repo.load()
    set({ user, data })
  },
  async signOut() {
    await repo.signOut()
    set({ user: null, data: null })
    useUi.getState().resetForUser()
  },
  async requestPasswordReset(email) {
    await repo.requestPasswordReset(email.trim())
  },
  async completeInvite(password) {
    const user = await repo.setPassword(password)
    const data = await repo.load()
    set({ user, data })
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
  async createTask(input, firstPart) {
    adminOnly(get)
    return guard(repo.createTask(input, firstPart))
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
    // Mirrors can_access_channel() in supabase/migrations/0002_policies.sql: task chat is internal (never a client).
    const allowed =
      channel === 'team' ? u.role !== 'client' : channel.startsWith('client:') ? u.role === 'admin' || (u.role === 'client' && channel === `client:${u.clientId}`) : u.role !== 'client'
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
  async inviteMember(input) {
    adminOnly(get)
    return guard(repo.inviteMember(input))
  },
  async listPendingInvites() {
    adminOnly(get)
    return guard(repo.listPendingInvites())
  },
  async resendInvite(email) {
    adminOnly(get)
    return guard(repo.resendInvite(email))
  },
  async updateProfile(patch) {
    const u = get().user
    if (!u) return
    await guard(repo.updateProfile(u.id, patch))
  },

  // ---------- «السوشل»: same boundaries the database enforces (0007_social.sql) ----------
  async createPost(input) {
    const u = get().user
    if (!u || u.role === 'client') throw new Error('forbidden')
    if (u.role === 'creative') {
      const s = get().data ?? EMPTY
      const works = s.tasks.some((t) => t.clientId === input.clientId && (t.ownerId === u.id || s.parts.some((p) => p.taskId === t.id && p.assigneeId === u.id)))
      if (!works) throw new Error('forbidden')
    }
    return guard(repo.createPost(input))
  },
  async addPostVersion(input) {
    const u = get().user
    if (!u || u.role === 'client') throw new Error('forbidden')
    await guard(repo.addPostVersion(input))
  },
  async updatePost(id, patch) {
    adminOnly(get)
    await guard(repo.updatePost(id, patch))
  },
  async deletePost(id) {
    adminOnly(get)
    await guard(repo.deletePost(id))
  },
  async decidePost(versionId, decision, note) {
    const u = get().user
    if (!u || u.role !== 'client') throw new Error('forbidden')
    await guard(repo.decidePost(versionId, decision, note))
  },
  async saveClientAccount(input) {
    adminOnly(get)
    await guard(repo.saveClientAccount(input))
  },
  async deleteClientAccount(id) {
    adminOnly(get)
    await guard(repo.deleteClientAccount(id))
  },
}))

export const useData = () => useSession((s) => s.data ?? EMPTY)
export const useUser = () => useSession((s) => (s.user && s.data?.users.find((u) => u.id === s.user!.id)) ?? s.user)
