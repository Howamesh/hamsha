/**
 * Repository contract. The mock (in-memory) implementation is used until the
 * Supabase project exists; the Supabase implementation will satisfy the same
 * interface so no screen has to change.
 */
import type { ChannelId, Client, Message, Presence, Profile, Project, Task, TaskPart, User } from '@/types'

export interface Snapshot {
  users: User[]
  clients: Client[]
  projects: Project[]
  tasks: Task[]
  parts: TaskPart[]
  messages: Message[]
  presence: Record<string, Presence>
  profiles: Record<string, Profile>
}

export interface Repo {
  signIn(email: string, password: string): Promise<User>
  signOut(): Promise<void>
  restoreSession(): Promise<User | null>
  load(): Promise<Snapshot>
  /** Subscribe to live changes (chat/presence). Returns unsubscribe. */
  subscribe(cb: (s: Snapshot) => void): () => void

  createClient(name: string, ownerId: string): Promise<Client>
  updateClient(id: string, patch: Partial<Client>): Promise<Client>
  deleteClient(id: string): Promise<void>
  createProject(input: Omit<Project, 'id'>): Promise<Project>
  updateProject(id: string, patch: Partial<Project>): Promise<Project>
  deleteProject(id: string): Promise<void>
  createTask(input: Omit<Task, 'id' | 'version' | 'approval'>): Promise<Task>
  updateTask(id: string, patch: Partial<Task>, version: number): Promise<Task>
  deleteTask(id: string): Promise<void>
  upsertPart(part: Omit<TaskPart, 'id'> & { id?: string }): Promise<TaskPart>
  deletePart(id: string): Promise<void>

  sendMessage(channel: ChannelId, senderId: string, body: string): Promise<Message>
  setPresence(userId: string, p: Presence): Promise<void>
  updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile>
  updateUser(id: string, patch: Partial<User>): Promise<User>
}
