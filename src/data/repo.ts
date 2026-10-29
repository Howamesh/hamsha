/**
 * Repository contract. The mock (in-memory) implementation is used until the
 * Supabase project exists; the Supabase implementation will satisfy the same
 * interface so no screen has to change.
 */
import type { ChannelId, Client, ClientAccount, ClientAccountInput, InviteInput, InviteResult, Message, NewPostInput, NewVersionInput, PendingInvite, Post, PostDecision, PostVersion, Presence, Profile, Project, Task, TaskPart, User } from '@/types'

export interface Snapshot {
  users: User[]
  clients: Client[]
  projects: Project[]
  tasks: Task[]
  parts: TaskPart[]
  messages: Message[]
  posts: Post[]
  postVersions: PostVersion[]
  clientAccounts: ClientAccount[]
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

  // ---------- «السوشل» (team: admin + creatives who work with the client; client: decide only) ----------
  /** Team: a new post is born as an empty draft; upload its first version right after. */
  createPost(input: NewPostInput): Promise<Post>
  /** Team: uploads the new images (kept paths are reused as-is), inserts a frozen version; the post returns to draft at that version. */
  addPostVersion(input: NewVersionInput): Promise<PostVersion>
  /** Admin: send (draft→sent), withdraw (sent→draft), publish (approved→published + url), rename/retarget. */
  updatePost(id: string, patch: Partial<Pick<Post, 'status' | 'publishedUrl' | 'title' | 'platform' | 'format' | 'taskId' | 'accountId'>>): Promise<Post>
  /** Admin: create (no id) or edit a client's platform account; uploads the avatar when given. */
  saveClientAccount(input: ClientAccountInput): Promise<ClientAccount>
  /** Admin only; posts using it keep living without an account. */
  deleteClientAccount(id: string): Promise<void>
  /** Resolves a public-bucket path (avatars) to a URL — synchronous, no signing needed. */
  publicUrl(path: string): string
  /** Admin only. */
  deletePost(id: string): Promise<void>
  /** Client: «موافق» / «يبي تعديل» (+ note) on the CURRENT version of a post that was sent. */
  decidePost(versionId: string, decision: PostDecision, note?: string): Promise<void>
  /** Resolves one of a version's imagePaths to something an <img> can show (signed URL on Supabase, as-is on the demo store). */
  mediaUrl(path: string): Promise<string>
}
