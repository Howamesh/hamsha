/**
 * Repository contract. The mock (in-memory) implementation is used until the
 * Supabase project exists; the Supabase implementation will satisfy the same
 * interface so no screen has to change.
 */
import type { ChannelId, Client, InviteInput, InviteResult, Message, PendingInvite, Presence, Profile, Project, Task, TaskPart, User } from '@/types'

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
  /** E-mails a password-reset link (no-op on the mock). */
  requestPasswordReset(email: string): Promise<void>
  /** Sets the password of the session opened by an invite / reset link, then returns the user. */
  setPassword(password: string): Promise<User>
  load(): Promise<Snapshot>
  /** Subscribe to live changes (chat/presence). Returns unsubscribe. */
  subscribe(cb: (s: Snapshot) => void): () => void

  createClient(name: string, ownerId: string, defaultProjectName: string): Promise<Client>
  updateClient(id: string, patch: Partial<Client>): Promise<Client>
  deleteClient(id: string): Promise<void>
  createProject(input: Omit<Project, 'id'>): Promise<Project>
  updateProject(id: string, patch: Partial<Project>): Promise<Project>
  deleteProject(id: string): Promise<void>
  createTask(input: Omit<Task, 'id' | 'version' | 'approval'>, firstPart: { label: string; time?: string; hours?: number }): Promise<Task>
  updateTask(id: string, patch: Partial<Task>, version: number): Promise<Task>
  deleteTask(id: string): Promise<void>
  upsertPart(part: Omit<TaskPart, 'id'> & { id?: string }): Promise<TaskPart>
  deletePart(id: string): Promise<void>

  sendMessage(channel: ChannelId, senderId: string, body: string): Promise<Message>
  setPresence(userId: string, p: Presence): Promise<void>
  updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile>
  updateUser(id: string, patch: Partial<User>): Promise<User>
  /** Admin only: records an invitation and e-mails it (Supabase: Edge Function «invite-member»). */
  inviteMember(input: InviteInput): Promise<InviteResult>
  /** Admin only: members invited but without a password yet. */
  listPendingInvites(): Promise<PendingInvite[]>
  /** Admin only: re-sends the invitation e-mail of a pending member. */
  resendInvite(email: string): Promise<InviteResult>
}
