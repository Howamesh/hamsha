// «الرسائل» as an inbox (2 Nov 2026, his «حلو مرة فكرتك… شوف أفضل طريقة واعملها»; council 20261102-213612-1eb3).
// The same rules as can_access_channel() in supabase/migrations/0016_inbox.sql — the database is the real guard,
// this mirror only decides what the screen offers.
import type { Snapshot } from '@/data/repo'
import type { ChannelId, InboxRow, User } from '@/types'

export const dmChannel = (a: string, b: string): ChannelId => {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort()
  return `dm:${x}:${y}`
}
/** the other person of a private chat (null when it is not one of mine) */
export function dmOther(ch: string, meId: string): string | null {
  const m = ch.match(/^dm:([^:]+):([^:]+)$/)   // the database insists on uuids; the demo store uses short ids
  if (!m) return null
  return m[1] === meId ? m[2] : m[2] === meId ? m[1] : null
}
const team = (u: User | undefined) => !!u && (u.role === 'admin' || u.role === 'creative')

export function canAccessChannel(s: Pick<Snapshot, 'users' | 'chatMembers'>, me: User, ch: string): boolean {
  if (ch === 'team') return team(me)
  if (ch.startsWith('client:')) {
    const id = ch.slice(7)
    return me.role === 'admin' || (me.role === 'client' && me.clientId === id) || (me.role === 'creative' && s.chatMembers.some((m) => m.clientId === id && m.userId === me.id))
  }
  if (ch.startsWith('task:')) return team(me)
  const other = dmOther(ch, me.id)
  return !!other && other !== me.id && team(me) && team(s.users.find((u) => u.id === other)) && ch === dmChannel(me.id, other)
}

/** The inbox rows: the server's (Supabase) or, on the mock, computed the same way from the loaded messages. */
export function inboxRows(s: Snapshot, me: User): InboxRow[] {
  if (s.inbox) return s.inbox
  const by = new Map<string, InboxRow>()
  for (const m of s.messages) {
    if (m.channel.startsWith('task:') || !canAccessChannel(s, me, m.channel)) continue
    const read = s.chatReads?.find((r) => r.userId === me.id && r.channel === m.channel)?.at ?? ''
    const row = by.get(m.channel) ?? { channel: m.channel, lastBody: '', lastSender: null, lastAt: '', unread: 0 }
    if (m.at >= row.lastAt) Object.assign(row, { lastBody: m.body.slice(0, 140), lastSender: m.senderId, lastAt: m.at })
    if (m.senderId !== me.id && m.at > read) row.unread += 1
    by.set(m.channel, row)
  }
  return [...by.values()]
}

export interface Conversation {
  channel: ChannelId
  kind: 'team' | 'dm' | 'client'
  title: string
  color: string
  row?: InboxRow
}

/** What «الرسائل» lists for this person: newest first, then the quiet ones by name. A client has one chat (no list). */
export function conversations(s: Snapshot, me: User, teamName: string): Conversation[] {
  const rows = new Map(inboxRows(s, me).map((r) => [r.channel as string, r]))
  const list: Conversation[] = []
  if (team(me)) {
    list.push({ channel: 'team', kind: 'team', title: teamName, color: '#09090B', row: rows.get('team') })
    for (const u of s.users) if (u.id !== me.id && team(u)) { const ch = dmChannel(me.id, u.id); list.push({ channel: ch, kind: 'dm', title: u.name, color: u.color, row: rows.get(ch) }) }
    for (const c of s.clients) { const ch: ChannelId = `client:${c.id}`; if (canAccessChannel(s, me, ch)) list.push({ channel: ch, kind: 'client', title: c.name, color: c.color, row: rows.get(ch) }) }
  } else if (me.clientId) {
    const c = s.clients.find((x) => x.id === me.clientId)
    list.push({ channel: `client:${me.clientId}`, kind: 'client', title: c?.name ?? '', color: c?.color ?? '#09090B', row: rows.get(`client:${me.clientId}`) })
  }
  return list.sort((a, b) => (b.row?.lastAt ?? '').localeCompare(a.row?.lastAt ?? '') || a.title.localeCompare(b.title, 'ar'))
}

export const unreadTotal = (s: Snapshot, me: User) => inboxRows(s, me).filter((r) => canAccessChannel(s, me, r.channel)).reduce((n, r) => n + r.unread, 0)

/** A sender's display name/colour: the team list, or chat_people for someone this person cannot read in profiles. */
export function senderOf(s: Snapshot, id: string | null): { name: string; color: string } | null {
  if (!id) return null
  const u = s.users.find((x) => x.id === id)
  return u ? { name: u.name, color: u.color } : s.people?.[id] ?? null
}

/** Unsent text per person + chat (council 2 Nov) — in memory only, wiped on sign-out so the next person on this
 *  browser never sees it (found in the 3-role test: a creative's draft showed up for the admin). */
const chatDrafts = new Map<string, string>()
export const chatDraft = (userId: string, ch: string) => chatDrafts.get(userId + '|' + ch) ?? ''
export const setChatDraft = (userId: string, ch: string, v: string) => { if (v) chatDrafts.set(userId + '|' + ch, v); else chatDrafts.delete(userId + '|' + ch) }
export const clearChatDrafts = () => chatDrafts.clear()
