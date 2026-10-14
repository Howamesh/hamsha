import { create } from 'zustand'
import { repo } from '@/data'
import type { Snapshot } from '@/data/repo'
import type { ChannelId, Presence, Profile, Task, TaskPart, User } from '@/types'

interface SessionState {
  user: User | null
  booted: boolean
  data: Snapshot | null
  boot: () => Promise<void>
  signIn: (email: string, pw: string) => Promise<void>
  signOut: () => Promise<void>

  createClient: (name: string) => Promise<void>
  createTask: (input: Omit<Task, 'id' | 'version' | 'approval'>) => Promise<Task>
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  upsertPart: (part: Omit<TaskPart, 'id'> & { id?: string }) => Promise<void>
  deletePart: (id: string) => Promise<void>
  sendMessage: (channel: ChannelId, body: string) => Promise<void>
  setPresence: (p: Presence) => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
}

const EMPTY: Snapshot = { users: [], clients: [], projects: [], tasks: [], parts: [], messages: [], presence: {}, profiles: {} }

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  booted: false,
  data: null,

  async boot() {
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
  },

  async createClient(name) {
    const u = get().user
    if (!u) return
    await repo.createClient(name, u.id)
  },
  async createTask(input) {
    return repo.createTask(input)
  },
  async updateTask(id, patch) {
    const cur = (get().data ?? EMPTY).tasks.find((t) => t.id === id)
    if (!cur) return
    await repo.updateTask(id, patch, cur.version)
  },
  async deleteTask(id) {
    await repo.deleteTask(id)
  },
  async upsertPart(part) {
    await repo.upsertPart(part)
  },
  async deletePart(id) {
    await repo.deletePart(id)
  },
  async sendMessage(channel, body) {
    const u = get().user
    if (!u || !body.trim()) return
    await repo.sendMessage(channel, u.id, body.trim())
  },
  async setPresence(p) {
    const u = get().user
    if (!u) return
    await repo.setPresence(u.id, p)
  },
  async updateProfile(patch) {
    const u = get().user
    if (!u) return
    await repo.updateProfile(u.id, patch)
  },
}))

export const useData = () => useSession((s) => s.data ?? EMPTY)
export const useUser = () => useSession((s) => s.user)
