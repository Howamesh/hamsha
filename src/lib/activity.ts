// «آخر النشاط» (1 Nov, Yousef: «أي شيء يصير في الموقع يدخل هنا»): one time-ordered list of what happened on contracts
// and social posts, built from data every role already loads (no new tables). Admin: everything. Creative: the posts
// they can read + the contracts sent to them. Each entry knows who did it, so «my own» actions never count as new.
import type { Snapshot } from '@/data/repo'
import type { User } from '@/types'
import { visibleContracts } from './contracts'
import { visiblePosts } from './social'

export type ActivityKind =
  | 'c_created' | 'c_version' | 'c_first_signed' | 'c_sent' | 'c_withdrawn' | 'c_opened' | 'c_signed' | 'c_changes' | 'c_rejected' | 'c_completed' | 'c_received'
  | 'p_version' | 'p_sent' | 'p_approved' | 'p_changes' | 'p_published' | 'p_received'
export interface Activity {
  id: string
  at: string
  kind: ActivityKind
  title: string
  n?: number
  who?: string
  actorId?: string
  note?: string
  target: { type: 'contract' | 'post'; id: string }
}

const DAYS = 30
const MAX = 80

export function activityFeed(s: Snapshot, user: User): Activity[] {
  const since = Date.now() - DAYS * 86400000
  const name = (id?: string) => (id ? s.users.find((u) => u.id === id)?.name : undefined)
  const out: Activity[] = []
  // 2 Nov (found in the overnight check): only what this person may SEE — the database already hides the rest, but the
  // demo store and any wider snapshot must never put another client's or a creative's contract in someone's alerts
  const contracts = new Map(visibleContracts(s, user).map((c) => [c.id, c]))
  const visible = new Map(visiblePosts(s, user, null).map((p) => [p.id, p]))
  if (user.role === 'client') {
    // the client's own «inbox»: what was sent to them (their snapshot only holds sent versions) and what went live
    for (const v of s.contractVersions) {
      const c = contracts.get(v.contractId)
      if (c && v.sentAt) out.push({ id: `cr:${v.id}`, at: v.sentAt, kind: 'c_received', title: c.title, n: v.number, target: { type: 'contract', id: c.id } })
    }
    for (const v of s.postVersions) {
      const p = visible.get(v.postId)
      if (p && v.sentAt) out.push({ id: `pr:${v.id}`, at: v.sentAt, kind: 'p_received', title: p.title, n: v.number, target: { type: 'post', id: p.id } })
    }
    for (const p of visible.values()) if (p.publishedAt) out.push({ id: `pp:${p.id}`, at: p.publishedAt, kind: 'p_published', title: p.title, target: { type: 'post', id: p.id } })
    return tidy(out, user, since)
  }
  if (user.role === 'admin') {
    for (const e of s.contractEvents) {
      const c = contracts.get(e.contractId)
      if (!c) continue
      const kind = (`c_${e.event}`) as ActivityKind
      out.push({ id: `ce:${e.id}`, at: e.at, kind, title: c.title, n: e.version, who: name(e.actor), actorId: e.actor, note: typeof e.meta?.note === 'string' ? (e.meta.note as string) : undefined, target: { type: 'contract', id: c.id } })
    }
  } else {
    // a creative: the contracts that reached them, and their own decisions
    for (const v of s.contractVersions) {
      const c = contracts.get(v.contractId)
      if (!c || c.party !== 'creative' || c.creativeId !== user.id) continue
      if (v.sentAt) out.push({ id: `cr:${v.id}`, at: v.sentAt, kind: 'c_received', title: c.title, n: v.number, target: { type: 'contract', id: c.id } })
    }
  }
  for (const v of s.postVersions) {
    const p = visible.get(v.postId)
    if (!p) continue
    out.push({ id: `pv:${v.id}`, at: v.createdAt, kind: 'p_version', title: p.title, n: v.number, who: name(v.createdBy), actorId: v.createdBy, target: { type: 'post', id: p.id } })
    if (v.sentAt) out.push({ id: `ps:${v.id}`, at: v.sentAt, kind: 'p_sent', title: p.title, n: v.number, actorId: v.number === p.currentVersion ? p.sentBy : undefined, who: v.number === p.currentVersion ? name(p.sentBy) : undefined, target: { type: 'post', id: p.id } })
    if (v.decidedAt && v.decision) out.push({ id: `pd:${v.id}`, at: v.decidedAt, kind: v.decision === 'approved' ? 'p_approved' : 'p_changes', title: p.title, n: v.number, note: v.decisionNote, target: { type: 'post', id: p.id } })
  }
  for (const p of visible.values()) if (p.publishedAt) out.push({ id: `pp:${p.id}`, at: p.publishedAt, kind: 'p_published', title: p.title, actorId: p.publishedBy, who: name(p.publishedBy), target: { type: 'post', id: p.id } })
  return tidy(out, user, since)
}

// 1 Nov (Yousef: «إذا أنا اللي أعدل مباشرة فليش تظهر لي كل هذه؟»): your OWN moves are never news to you — decided by
// WHO did it (actorId), never by role, so a second admin (the manager) still sees the other admin's moves.
// A post «sent» / «published» from before 0014 has no recorded actor: it was always a team click → hidden for the team.
const TEAM_ONLY_UNKNOWN = new Set<ActivityKind>(['p_sent', 'p_published'])

/** Drop the user's own moves, keep 30 days, and show ONE row per contract/post: its newest news (no piles). */
function tidy(list: Activity[], user: User, since: number): Activity[] {
  const seen = new Set<string>()
  return list
    .filter((a) => a.at && Date.parse(a.at) >= since && a.actorId !== user.id && !(user.role !== 'client' && !a.actorId && TEAM_ONLY_UNKNOWN.has(a.kind)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((a) => {
      const k = `${a.target.type}:${a.target.id}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, MAX)
}

/** New since this user last opened «التنبيهات» (the feed already holds only other people's news, one per item). */
export function unreadActivity(feed: Activity[], _user: User, seenAt?: string): number {
  return feed.filter((a) => isNewer(a.at, seenAt)).length
}
/** Server times compared as instants (never as text: «…Z» vs «…+00:00»); no marker yet = everything is new. */
export function isNewer(at: string, seenAt?: string): boolean {
  if (!seenAt) return true
  const a = Date.parse(at), b = Date.parse(seenAt)
  return Number.isNaN(b) || a > b
}
/** The seen marker = the newest SERVER time on the list the person looked at (never this device's clock). */
export function newestAt(feed: Activity[]): string | undefined {
  let best: string | undefined
  for (const a of feed) if (!best || Date.parse(a.at) > Date.parse(best)) best = a.at
  return best
}
