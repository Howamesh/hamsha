/**
 * Supabase repository — the real backend behind the same `Repo` contract as the mock.
 *
 * Security lives in the database (supabase/migrations/0002_policies.sql); this file only maps
 * rows ⇄ domain types and chooses WHICH tables each role may read:
 *   admin / creative → tasks + task_parts (RLS filters rows) + Realtime postgres_changes
 *   client           → client_tasks + client_task_parts views (no people, hours or briefs) — views have
 *                      no Realtime, so the client snapshot is refetched on an interval instead.
 * Multi-row operations go through the transactional RPCs of 0004_rpc.sql (create_client, create_task);
 * chat channels are removed by database triggers when a task/client is deleted.
 * Every write returns as soon as the database confirms it: the confirmed row is merged into the local
 * snapshot (one round-trip to the screen) and a full reload reconciles in the background.
 * Optimistic concurrency on tasks: `version` must match or the update is stale.
 *
 * Written 2026-10-27 before the Supabase project existed, reviewed by Codex the same night, type-checked
 * only: the first live run follows supabase/README.md «أول تشغيل حي».
 */
import { createClient as createSupabaseClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { Repo, Snapshot } from './repo'
import type { PendingInvite, InviteInput, InviteResult, ChannelId, Client, ClientAccount, ClientAccountInput, Message, NewPostInput, NewVersionInput, Post, PostDecision, PostVersion, Presence, Profile, Project, Role, Task, TaskPart, User } from '@/types'
import { validateClientPatch, validateNewTask, validatePart, validateTaskPatch } from '@/lib/validate'

// ---------- row shapes (snake_case, exactly the columns in 0001/0002) ----------
interface ProfileRow { id: string; org_id: string; role: Role; name: string; email: string; title: string | null; color: string; client_id: string | null; presence: Presence }
interface SettingsRow { user_id: string; city: string; wh_start: number; wh_end: number; notes: string; theme: 'light' | 'dark'; lang: 'ar' | 'en'; week_start: 'monday' | 'sunday' }
interface ClientRow { id: string; name: string; color: string; logo_path: string | null; owner_id: string | null; start_date: string; end_date: string; contract: Client['contract'] }
interface ProjectRow { id: string; client_id: string; name: string; lead_id: string | null; color: string }
interface TaskRow { id: string; client_id: string; project_id: string; title: string; type: Task['type']; start_date: string; end_date: string; owner_id: string | null; description: string | null; reference: string | null; milestone: Task['milestone'] | null; approval: Task['approval']; version: number }
interface ClientTaskRow { id: string; client_id: string; project_id: string; title: string; type: Task['type']; start_date: string; end_date: string; approval: Task['approval']; version: number }
interface PartRow { id: string; task_id: string; label: string; assignee_id: string | null; hours: number; day: string; hand_off: string | null; done: boolean; position: number }
interface ClientPartRow { id: string; task_id: string; label: string; done: boolean; position: number }
interface MessageRow { id: string; channel: string; sender_id: string; body: string; created_at: string }
interface PostRow { id: string; client_id: string; task_id: string | null; account_id: string | null; title: string; platform: Post['platform']; format: Post['format']; status: Post['status']; current_version: number; sent_at: string | null; published_url: string | null; published_at: string | null; created_by?: string | null; created_at: string; updated_at: string }
interface AccountRow { id: string; client_id: string; platform: Post['platform']; handle: string; display_name: string; avatar_path: string | null; bio: string | null }
interface VersionRow { id: string; post_id: string; number: number; image_paths: string[]; caption: string; note: string | null; sent_at: string | null; decision: PostVersion['decision'] | null; decision_note: string | null; decided_at: string | null; created_by?: string | null; created_at: string }

const PALETTE = ['#D9B600', '#9B7BF2', '#4CB782', '#F06FA7', '#4E9BFA', '#F2994A', '#3B8EA5', '#7FA23B']
const CLIENT_REFRESH_MS = 60_000
const MESSAGE_LIMIT = 2000
const EMPTY: Snapshot = { users: [], clients: [], projects: [], tasks: [], parts: [], messages: [], posts: [], postVersions: [], clientAccounts: [], presence: {}, profiles: {} }
const POST_MEDIA_BUCKET = 'post-media'
const AVATAR_BUCKET = 'client-logos' // public bucket (0006): avatars live under <org>/<client>/accounts/
const SIGNED_URL_TTL_S = 60 * 60

// ---------- row → domain ----------
const toUser = (r: ProfileRow): User => ({ id: r.id, name: r.name, email: r.email, role: r.role, title: r.title ?? undefined, color: r.color, clientId: r.client_id ?? undefined })
const toProfile = (r: SettingsRow): Profile => ({ userId: r.user_id, city: r.city, whStart: r.wh_start, whEnd: r.wh_end, notes: r.notes, theme: r.theme, lang: r.lang, weekStart: r.week_start })
const toClient = (r: ClientRow): Client => ({ id: r.id, name: r.name, color: r.color, ownerId: r.owner_id ?? '', logo: r.logo_path ?? undefined, start: r.start_date, end: r.end_date, contract: r.contract })
const toProject = (r: ProjectRow): Project => ({ id: r.id, clientId: r.client_id, name: r.name, leadId: r.lead_id ?? '', color: r.color })
const toTask = (r: TaskRow | ClientTaskRow): Task => ({
  id: r.id, projectId: r.project_id, clientId: r.client_id, title: r.title, type: r.type, start: r.start_date, end: r.end_date,
  ownerId: 'owner_id' in r ? (r.owner_id ?? '') : '',
  description: 'description' in r ? (r.description ?? undefined) : undefined,
  reference: 'reference' in r ? (r.reference ?? undefined) : undefined,
  milestone: 'milestone' in r ? (r.milestone ?? undefined) : undefined,
  approval: r.approval, version: r.version,
})
/** Client view rows carry no hours/people: hours = 0 keeps the type honest without inventing data (progress is by count). */
const toPart = (r: PartRow | ClientPartRow): TaskPart => ({
  id: r.id, taskId: r.task_id, label: r.label,
  assigneeId: 'assignee_id' in r ? (r.assignee_id ?? '') : '',
  hours: 'hours' in r ? Number(r.hours) : 0,
  day: 'day' in r ? r.day : '',
  time: 'hand_off' in r && r.hand_off ? r.hand_off.slice(0, 5) : undefined,
  done: r.done, order: r.position,
})
const toMessage = (r: MessageRow): Message => ({ id: r.id, channel: r.channel as ChannelId, senderId: r.sender_id, body: r.body, at: r.created_at })
const toPost = (r: PostRow): Post => ({
  id: r.id, clientId: r.client_id, taskId: r.task_id ?? undefined, accountId: r.account_id ?? undefined, title: r.title, platform: r.platform, format: r.format, status: r.status, currentVersion: r.current_version,
  sentAt: r.sent_at ?? undefined, publishedUrl: r.published_url ?? undefined, publishedAt: r.published_at ?? undefined, createdBy: r.created_by ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at,
})
const toVersion = (r: VersionRow): PostVersion => ({
  id: r.id, postId: r.post_id, number: r.number, imagePaths: r.image_paths ?? [], caption: r.caption, note: r.note ?? undefined, sentAt: r.sent_at ?? undefined,
  decision: r.decision ?? undefined, decisionNote: r.decision_note ?? undefined, decidedAt: r.decided_at ?? undefined, createdBy: r.created_by ?? undefined, createdAt: r.created_at,
})
const postPatch = (p: Partial<Post>) => strip({ title: p.title, platform: p.platform, format: p.format, status: p.status, published_url: p.publishedUrl, task_id: 'taskId' in p ? (p.taskId ?? null) : undefined, account_id: 'accountId' in p ? (p.accountId ?? null) : undefined })
const toAccount = (r: AccountRow): ClientAccount => ({ id: r.id, clientId: r.client_id, platform: r.platform, handle: r.handle, displayName: r.display_name, avatarPath: r.avatar_path ?? undefined, bio: r.bio ?? undefined })

// ---------- domain → row (patches): `undefined` = leave unchanged; an explicit key with undefined clientId = unlink ----------
const clientPatch = (p: Partial<Client>) => strip({ name: p.name, color: p.color, logo_path: p.logo, owner_id: p.ownerId, start_date: p.start, end_date: p.end, contract: p.contract })
const projectPatch = (p: Partial<Project>) => strip({ name: p.name, color: p.color, lead_id: p.leadId, client_id: p.clientId })
const taskPatch = (p: Partial<Task>) => strip({ title: p.title, type: p.type, start_date: p.start, end_date: p.end, owner_id: p.ownerId, project_id: p.projectId, client_id: p.clientId, description: p.description, reference: p.reference, milestone: p.milestone, approval: p.approval })
const userPatch = (p: Partial<User>) => strip({ name: p.name, title: p.title, color: p.color, role: p.role, client_id: 'clientId' in p ? (p.clientId ?? null) : undefined })
const settingsPatch = (p: Partial<Profile>) => strip({ city: p.city, wh_start: p.whStart, wh_end: p.whEnd, notes: p.notes, theme: p.theme, lang: p.lang, week_start: p.weekStart })
function strip<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k in o) if (o[k] !== undefined) out[k] = o[k]
  return out
}

function fail(e: { message: string } | null, what: string): asserts e is null {
  if (e) throw new Error(`${what}: ${e.message}`)
}

export function createSupabaseRepo(): Repo {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.')
  // detectSessionInUrl (default) turns an invite / reset link (#access_token…) into a session for /welcome
  const sb: SupabaseClient = createSupabaseClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })

  let me: User | null = null
  let orgId: string | null = null
  let snap: Snapshot | null = null
  /** Bumped on every sign-in/out: a load that started under an older identity is discarded, never published. */
  let gen = 0
  const subs = new Set<(s: Snapshot) => void>()
  let channel: RealtimeChannel | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  /** signed URLs of post media, per path (private bucket) */
  const urlCache = new Map<string, { url: string; exp: number }>()

  const publish = (s: Snapshot) => {
    snap = s
    subs.forEach((cb) => cb(s))
  }
  /** Realtime fires per row; coalesce bursts into one reload. */
  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer)
    const g = gen
    reloadTimer = setTimeout(() => {
      void load()
        .then((s) => {
          if (g === gen) publish(s)
        })
        .catch((e) => console.warn('hamsha: live reload failed', e))
    }, 150)
  }

  async function currentUser(): Promise<User | null> {
    const { data: auth } = await sb.auth.getUser()
    if (!auth.user) {
      me = null
      orgId = null
      return null
    }
    const { data, error } = await sb.from('profiles').select('*').eq('id', auth.user.id).maybeSingle<ProfileRow>()
    fail(error, 'profile')
    // An auth user without a profile was never invited (handle_new_user refuses them) — treat as signed out.
    if (!data) {
      await sb.auth.signOut()
      me = null
      orgId = null
      return null
    }
    me = toUser(data)
    orgId = data.org_id
    return me
  }

  async function load(): Promise<Snapshot> {
    if (!me) await currentUser()
    if (!me) return EMPTY // no session: nothing to ask the database (anon has no grants anyway)
    const isClient = me.role === 'client'
    const [users, settings, clients, projects, tasks, parts, messages, posts, versions, accounts] = await Promise.all([
      sb.from('profiles').select('*').returns<ProfileRow[]>(),
      sb.from('user_settings').select('*').returns<SettingsRow[]>(),
      sb.from('clients').select('*').returns<ClientRow[]>(),
      sb.from('projects').select('*').returns<ProjectRow[]>(),
      isClient ? sb.from('client_tasks').select('*').returns<ClientTaskRow[]>() : sb.from('tasks').select('*').returns<TaskRow[]>(),
      isClient ? sb.from('client_task_parts').select('*').returns<ClientPartRow[]>() : sb.from('task_parts').select('*').returns<PartRow[]>(),
      // newest first so a long history never hides today's messages; shown oldest → newest
      sb.from('messages').select('*').order('created_at', { ascending: false }).limit(MESSAGE_LIMIT).returns<MessageRow[]>(),
      sb.from(isClient ? 'client_posts' : 'posts').select('*').returns<PostRow[]>(),
      sb.from(isClient ? 'client_post_versions' : 'post_versions').select('*').returns<VersionRow[]>(),
      sb.from('client_accounts').select('*').returns<AccountRow[]>(),
    ])
    for (const [r, what] of [[users, 'profiles'], [settings, 'settings'], [clients, 'clients'], [projects, 'projects'], [tasks, 'tasks'], [parts, 'parts'], [messages, 'messages'], [posts, 'posts'], [versions, 'post_versions'], [accounts, 'client_accounts']] as const) fail(r.error, what)
    const presence: Record<string, Presence> = {}
    for (const u of users.data ?? []) presence[u.id] = u.presence
    const profiles: Record<string, Profile> = {}
    for (const s of settings.data ?? []) profiles[s.user_id] = toProfile(s)
    return {
      users: (users.data ?? []).map(toUser),
      clients: (clients.data ?? []).map(toClient),
      projects: (projects.data ?? []).map(toProject),
      tasks: (tasks.data ?? []).map(toTask),
      parts: (parts.data ?? []).map(toPart),
      messages: (messages.data ?? []).map(toMessage).reverse(),
      posts: (posts.data ?? []).map(toPost),
      postVersions: (versions.data ?? []).map(toVersion),
      clientAccounts: (accounts.data ?? []).map(toAccount),
      presence,
      profiles,
    }
  }

  function startLive() {
    stopLive()
    if (!me) return
    if (me.role === 'client') {
      // Views are not published to Realtime (and the client must not subscribe to the raw tables).
      timer = setInterval(scheduleReload, CLIENT_REFRESH_MS)
      channel = sb.channel('client-live').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleReload).subscribe()
      return
    }
    channel = sb.channel('team-live')
    for (const table of ['messages', 'tasks', 'task_parts', 'profiles', 'clients', 'projects', 'posts', 'post_versions', 'client_accounts']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload)
    }
    channel.subscribe()
  }
  function stopLive() {
    if (channel) void sb.removeChannel(channel)
    channel = null
    if (timer) clearInterval(timer)
    timer = null
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = null
  }
  function newIdentity() {
    gen++
    stopLive()
    snap = null
  }

  /**
   * After a CONFIRMED write: patch the local snapshot right away (the screen updates in one round-trip)
   * and reconcile with a full reload in the background. Nothing is shown before the database said yes,
   * so there is never anything to roll back; a failed write throws before the screen changes.
   */
  const commit = <T,>(v: T, patch: (s: Snapshot) => Snapshot): T => {
    if (snap) publish(patch(snap))
    scheduleReload()
    return v
  }
  const without = <T extends { id: string }>(xs: T[], id: string) => xs.filter((x) => x.id !== id)
  const upsert = <T extends { id: string }>(xs: T[], x: T) => (xs.some((y) => y.id === x.id) ? xs.map((y) => (y.id === x.id ? x : y)) : [...xs, x])
  const dropTasks = (s: Snapshot, ids: Set<string>): Snapshot => ({
    ...s,
    tasks: s.tasks.filter((t) => !ids.has(t.id)),
    parts: s.parts.filter((p) => !ids.has(p.taskId)),
    messages: s.messages.filter((m) => !(m.channel.startsWith('task:') && ids.has(m.channel.slice(5)))),
  })

  return {
    async signIn(email, password) {
      newIdentity()
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error('invalid')
      const u = await currentUser()
      if (!u) throw new Error('invalid')
      startLive()
      return u
    },
    async signOut() {
      newIdentity()
      me = null
      orgId = null
      await sb.auth.signOut()
    },
    async restoreSession() {
      const u = await currentUser()
      if (u) startLive()
      return u
    },
    async requestPasswordReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/welcome` })
      fail(error, 'requestPasswordReset')
    },
    async setPassword(password) {
      const { error } = await sb.auth.updateUser({ password })
      fail(error, 'setPassword')
      newIdentity()
      const u = await currentUser()
      if (!u) throw new Error('no session')
      startLive()
      return u
    },
    async load() {
      const s = await load()
      snap = s
      return s
    },
    subscribe(cb) {
      subs.add(cb)
      if (snap) cb(snap)
      return () => subs.delete(cb)
    },

    async createClient(name, _ownerId, defaultProjectName) {
      const color = PALETTE[(snap?.clients.length ?? 0) % PALETTE.length]
      const { data, error } = await sb.rpc('create_client', { p_name: name, p_project_name: defaultProjectName, p_color: color }).single<ClientRow>()
      fail(error, 'createClient')
      const c = toClient(data)
      return commit(c, (s) => ({ ...s, clients: upsert(s.clients, c) })) // its first project arrives with the background reload
    },
    async updateClient(id, patch) {
      const cur = snap?.clients.find((c) => c.id === id)
      if (cur) validateClientPatch(patch, cur)
      const { data, error } = await sb.from('clients').update(clientPatch(patch)).eq('id', id).select('*').single<ClientRow>()
      fail(error, 'updateClient')
      const c = toClient(data)
      return commit(c, (s) => ({ ...s, clients: upsert(s.clients, c) }))
    },
    async deleteClient(id) {
      // projects/tasks/parts cascade in the database; chat channels are removed by triggers (0004)
      const { error } = await sb.from('clients').delete().eq('id', id)
      fail(error, 'deleteClient')
      commit(undefined, (s) => {
        const gone = new Set(s.tasks.filter((t) => t.clientId === id).map((t) => t.id))
        const d = dropTasks(s, gone)
        const goneP = new Set(d.posts.filter((p) => p.clientId === id).map((p) => p.id))
        return { ...d, clients: without(d.clients, id), projects: d.projects.filter((p) => p.clientId !== id), messages: d.messages.filter((m) => m.channel !== `client:${id}`), posts: d.posts.filter((p) => !goneP.has(p.id)), postVersions: d.postVersions.filter((v) => !goneP.has(v.postId)) }
      })
    },
    async createProject(input) {
      if (!orgId) throw new Error('no session')
      const { data, error } = await sb.from('projects').insert({ org_id: orgId, client_id: input.clientId, name: input.name, lead_id: input.leadId || null, color: input.color }).select('*').single<ProjectRow>()
      fail(error, 'createProject')
      const pr = toProject(data)
      return commit(pr, (s) => ({ ...s, projects: upsert(s.projects, pr) }))
    },
    async updateProject(id, patch) {
      const { data, error } = await sb.from('projects').update(projectPatch(patch)).eq('id', id).select('*').single<ProjectRow>()
      fail(error, 'updateProject')
      const pr = toProject(data)
      return commit(pr, (s) => ({ ...s, projects: upsert(s.projects, pr) }))
    },
    async deleteProject(id) {
      const { error } = await sb.from('projects').delete().eq('id', id)
      fail(error, 'deleteProject')
      commit(undefined, (s) => {
        const d = dropTasks(s, new Set(s.tasks.filter((t) => t.projectId === id).map((t) => t.id)))
        return { ...d, projects: without(d.projects, id) }
      })
    },
    async createTask(input, firstPart) {
      validateNewTask(input)
      validatePart({ taskId: '', label: firstPart.label, assigneeId: input.ownerId, hours: firstPart.hours ?? 4, day: input.start, time: firstPart.time, done: false, order: 0 })
      const { data, error } = await sb
        .rpc('create_task', {
          p_client_id: input.clientId, p_project_id: input.projectId, p_title: input.title, p_type: input.type, p_start: input.start, p_end: input.end,
          p_owner_id: input.ownerId || null, p_description: input.description ?? null, p_reference: input.reference ?? null, p_milestone: input.milestone ?? null,
          p_part_label: firstPart.label, p_part_hours: firstPart.hours ?? 4, p_part_time: firstPart.time || null,
        })
        .single<TaskRow>()
      fail(error, 'createTask')
      const t = toTask(data)
      // the RPC made the first part too: fetch it so the sheet opens complete (one small query)
      const { data: parts } = await sb.from('task_parts').select('*').eq('task_id', t.id).returns<PartRow[]>()
      return commit(t, (s) => ({ ...s, tasks: upsert(s.tasks, t), parts: [...s.parts.filter((p) => p.taskId !== t.id), ...(parts ?? []).map(toPart)] }))
    },
    async updateTask(id, patch, version) {
      const cur = snap?.tasks.find((t) => t.id === id)
      if (cur) validateTaskPatch(patch, cur)
      // optimistic concurrency: the row must still be at the version the screen saw (tasks_touch bumps it)
      const { data, error } = await sb.from('tasks').update(taskPatch(patch)).eq('id', id).eq('version', version).select('*').maybeSingle<TaskRow>()
      fail(error, 'updateTask')
      if (!data) {
        scheduleReload()
        throw new Error('stale') // changed by someone else, deleted, or no longer visible — the reload shows which
      }
      const t = toTask(data)
      // the database clamps parts into the new date range (tasks_clamp_parts); mirror it until the reload
      return commit(t, (s) => ({ ...s, tasks: upsert(s.tasks, t), parts: s.parts.map((p) => (p.taskId === id ? { ...p, day: p.day < t.start ? t.start : p.day > t.end ? t.end : p.day } : p)) }))
    },
    async deleteTask(id) {
      const { error } = await sb.from('tasks').delete().eq('id', id)
      fail(error, 'deleteTask')
      commit(undefined, (s) => dropTasks(s, new Set([id])))
    },
    async upsertPart(part) {
      if (!orgId) throw new Error('no session')
      validatePart(part, snap?.tasks.find((t) => t.id === part.taskId))
      const row = { org_id: orgId, task_id: part.taskId, label: part.label, assignee_id: part.assigneeId || null, hours: part.hours, day: part.day, hand_off: part.time || null, done: part.done, position: part.order }
      const q = part.id
        ? me?.role === 'creative'
          ? sb.from('task_parts').update({ done: part.done }).eq('id', part.id) // the DB allows creatives nothing but `done`
          : sb.from('task_parts').update(row).eq('id', part.id)
        : sb.from('task_parts').insert(row)
      const { data, error } = await q.select('*').single<PartRow>()
      fail(error, 'upsertPart')
      const p = toPart(data)
      return commit(p, (s) => ({ ...s, parts: upsert(s.parts, p) }))
    },
    async deletePart(id) {
      const { error } = await sb.from('task_parts').delete().eq('id', id)
      fail(error, 'deletePart')
      commit(undefined, (s) => ({ ...s, parts: without(s.parts, id) }))
    },

    async sendMessage(channel, senderId, body) {
      if (!orgId) throw new Error('no session')
      const { data, error } = await sb.from('messages').insert({ org_id: orgId, channel, sender_id: senderId, body }).select('*').single<MessageRow>()
      fail(error, 'sendMessage')
      const m = toMessage(data)
      return commit(m, (s) => ({ ...s, messages: upsert(s.messages, m) }))
    },
    async setPresence(userId, p) {
      const { error } = await sb.from('profiles').update({ presence: p, last_seen: new Date().toISOString() }).eq('id', userId)
      fail(error, 'setPresence')
      commit(undefined, (s) => ({ ...s, presence: { ...s.presence, [userId]: p } }))
    },
    async updateUser(id, patch) {
      const { data, error } = await sb.from('profiles').update(userPatch(patch)).eq('id', id).select('*').single<ProfileRow>()
      fail(error, 'updateUser')
      const u = toUser(data)
      return commit(u, (s) => ({ ...s, users: upsert(s.users, u) }))
    },
    async inviteMember(input: InviteInput): Promise<InviteResult> {
      // The Edge Function calls invite_user() with THIS user's JWT (the database decides who is admin),
      // then sends the Auth e-mail with the service key that never reaches the browser.
      const { data, error } = await sb.functions.invoke<{ ok: boolean; sent: boolean; reason?: InviteResult['reason']; error?: string }>('invite-member', {
        body: { email: input.email.trim().toLowerCase(), role: input.role, name: input.name?.trim() || undefined, clientId: input.role === 'client' ? input.clientId : undefined },
      })
      if (error) {
        // FunctionsHttpError carries the JSON body with the real reason (403 only admins, 400 validation…)
        const ctx = (error as { context?: Response }).context
        let msg = error.message
        try {
          const j = ctx ? ((await ctx.json()) as { error?: string }) : null
          if (j?.error) msg = j.error
        } catch {
          /* keep msg */
        }
        if (/only admins|403|permission denied/i.test(msg)) throw new Error('forbidden')
        if (/already a member/i.test(msg)) throw new Error('already a member')
        throw new Error(`inviteMember: ${msg}`)
      }
      if (!data?.ok) throw new Error('inviteMember: unexpected response')
      return { sent: data.sent, reason: data.reason, error: data.error }
    },
    async listPendingInvites() {
      const { data, error } = await sb.rpc('pending_members')
      fail(error, 'listPendingInvites')
      return ((data ?? []) as Array<{ id: string; email: string; name: string; role: PendingInvite['role']; client_id: string | null; invited_at: string | null }>).map((r) => ({
        id: r.id, email: r.email, name: r.name, role: r.role, clientId: r.client_id ?? undefined, invitedAt: r.invited_at ?? undefined,
      }))
    },
    async resendInvite(email) {
      const { data, error } = await sb.functions.invoke<{ ok: boolean; sent: boolean; reason?: InviteResult['reason']; error?: string }>('invite-member', {
        body: { action: 'resend', email: email.trim().toLowerCase() },
      })
      if (error) {
        const ctx = (error as { context?: Response }).context
        let msg = error.message
        try {
          const j = ctx ? ((await ctx.json()) as { error?: string }) : null
          if (j?.error) msg = j.error
        } catch {
          /* keep msg */
        }
        if (/403|permission denied/i.test(msg)) throw new Error('forbidden')
        if (/not pending|404/i.test(msg)) throw new Error('not found')
        throw new Error(`resendInvite: ${msg}`)
      }
      if (!data?.ok) throw new Error('resendInvite: unexpected response')
      return { sent: data.sent, reason: data.reason, error: data.error }
    },
    // ---------- «السوشل» (0007): the database owns the state machine; this only maps rows and uploads files ----------
    async createPost(input: NewPostInput) {
      if (!orgId) throw new Error('no session')
      const { data, error } = await sb.from('posts').insert({ org_id: orgId, client_id: input.clientId, task_id: input.taskId ?? null, account_id: input.accountId ?? null, title: input.title.trim(), platform: input.platform, format: input.format }).select('*').single<PostRow>()
      fail(error, 'createPost')
      const p = toPost(data)
      return commit(p, (s) => ({ ...s, posts: upsert(s.posts, p) }))
    },
    async addPostVersion(input: NewVersionInput) {
      if (!orgId) throw new Error('no session')
      const post = snap?.posts.find((p) => p.id === input.postId)
      if (!post) throw new Error('not found')
      if (input.media.length === 0) throw new Error('no media')
      // kept paths are reused as-is (files are never overwritten); new files get fresh paths
      // <org>/<client>/<post>/<n>-<i>-<random>.<ext>: the storage policy reads org + client from the path
      const uploaded: string[] = []
      const paths: string[] = []
      try {
        for (const [i, m] of input.media.entries()) {
          if (!(m instanceof File)) {
            paths.push(m.path)
            continue
          }
          const ext = (m.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
          const path = `${orgId}/${post.clientId}/${post.id}/${post.currentVersion + 1}-${i + 1}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          const up = await sb.storage.from(POST_MEDIA_BUCKET).upload(path, m, { contentType: m.type, upsert: false })
          fail(up.error, 'upload')
          uploaded.push(path)
          paths.push(path)
        }
        const { data, error } = await sb.from('post_versions').insert({ org_id: orgId, post_id: post.id, number: 0, image_paths: paths, caption: input.caption, note: input.note?.trim() || null }).select('*').single<VersionRow>()
        fail(error, 'addPostVersion')
        const v = toVersion(data!)
        return commit(v, (s) => ({ ...s, postVersions: upsert(s.postVersions, v), posts: s.posts.map((p) => (p.id === v.postId ? { ...p, currentVersion: v.number, status: 'draft', sentAt: undefined, updatedAt: v.createdAt } : p)) }))
      } catch (e) {
        if (uploaded.length) await sb.storage.from(POST_MEDIA_BUCKET).remove(uploaded).catch(() => undefined) // never leave orphan files behind a failed insert
        throw e
      }
    },
    async updatePost(id, patch) {
      const { data, error } = await sb.from('posts').update(postPatch(patch)).eq('id', id).select('*').maybeSingle<PostRow>()
      fail(error, 'updatePost')
      if (!data) {
        scheduleReload()
        throw new Error('stale')
      }
      const p = toPost(data)
      return commit(p, (s) => ({ ...s, posts: upsert(s.posts, p) }))
    },
    async deletePost(id) {
      const paths = [...new Set((snap?.postVersions ?? []).filter((v) => v.postId === id).flatMap((v) => v.imagePaths))]
      const { error } = await sb.from('posts').delete().eq('id', id)
      fail(error, 'deletePost')
      if (paths.length) void sb.storage.from(POST_MEDIA_BUCKET).remove(paths).catch(() => undefined)
      commit(undefined, (s) => ({ ...s, posts: without(s.posts, id), postVersions: s.postVersions.filter((v) => v.postId !== id) }))
    },
    async decidePost(versionId, decision: PostDecision, note) {
      const { error } = await sb.rpc('decide_post', { p_version: versionId, p_decision: decision, p_note: note?.trim() || null })
      fail(error, 'decidePost')
      const at = new Date().toISOString()
      commit(undefined, (s) => {
        const v = s.postVersions.find((x) => x.id === versionId)
        return {
          ...s,
          postVersions: s.postVersions.map((x) => (x.id === versionId ? { ...x, decision, decisionNote: note?.trim() || undefined, decidedAt: at } : x)),
          posts: v ? s.posts.map((p) => (p.id === v.postId ? { ...p, status: decision, updatedAt: at } : p)) : s.posts,
        }
      })
    },
    async mediaUrl(path) {
      const hit = urlCache.get(path)
      if (hit && hit.exp > Date.now()) return hit.url
      const { data, error } = await sb.storage.from(POST_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S)
      fail(error, 'mediaUrl')
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + (SIGNED_URL_TTL_S - 60) * 1000 })
      return data.signedUrl
    },
    publicUrl(path) {
      return /^(https?:|data:|blob:)/.test(path) ? path : sb.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
    },
    // ---------- client accounts (0008): the real account behind the preview ----------
    async saveClientAccount(input: ClientAccountInput) {
      if (!orgId) throw new Error('no session')
      const cur = input.id ? snap?.clientAccounts.find((a) => a.id === input.id) : undefined
      let avatar_path: string | null | undefined = undefined
      if (input.avatar === null) avatar_path = null
      else if (input.avatar) {
        const ext = (input.avatar.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')
        const path = `${orgId}/${input.clientId}/accounts/${Math.random().toString(36).slice(2, 10)}.${ext}`
        const up = await sb.storage.from(AVATAR_BUCKET).upload(path, input.avatar, { contentType: input.avatar.type, upsert: false })
        fail(up.error, 'upload')
        avatar_path = path
      }
      const row = strip({ org_id: orgId, client_id: input.clientId, platform: input.platform, handle: input.handle.trim().replace(/^@/, ''), display_name: input.displayName.trim(), bio: input.bio?.trim() || null, avatar_path })
      const q = input.id ? sb.from('client_accounts').update(row).eq('id', input.id) : sb.from('client_accounts').insert(row)
      const { data, error } = await q.select('*').single<AccountRow>()
      if (error && typeof avatar_path === 'string') await sb.storage.from(AVATAR_BUCKET).remove([avatar_path]).catch(() => undefined)
      fail(error, 'saveClientAccount')
      if (cur?.avatarPath && avatar_path !== undefined && cur.avatarPath !== avatar_path) void sb.storage.from(AVATAR_BUCKET).remove([cur.avatarPath]).catch(() => undefined)
      const a = toAccount(data!)
      return commit(a, (s) => ({ ...s, clientAccounts: upsert(s.clientAccounts, a) }))
    },
    async deleteClientAccount(id) {
      const cur = snap?.clientAccounts.find((a) => a.id === id)
      const { error } = await sb.from('client_accounts').delete().eq('id', id)
      fail(error, 'deleteClientAccount')
      if (cur?.avatarPath) void sb.storage.from(AVATAR_BUCKET).remove([cur.avatarPath]).catch(() => undefined)
      commit(undefined, (s) => ({ ...s, clientAccounts: without(s.clientAccounts, id), posts: s.posts.map((p) => (p.accountId === id ? { ...p, accountId: undefined } : p)) }))
    },
    async updateProfile(userId, patch) {
      const { data, error } = await sb.from('user_settings').upsert({ user_id: userId, ...settingsPatch(patch) }).select('*').single<SettingsRow>()
      fail(error, 'updateProfile')
      const pr = toProfile(data)
      return commit(pr, (s) => ({ ...s, profiles: { ...s.profiles, [userId]: pr } }))
    },
  }
}
