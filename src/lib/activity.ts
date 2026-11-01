// «آخر النشاط» (1 Nov, Yousef: «أي شيء يصير في الموقع يدخل هنا»): one time-ordered list of what happened on contracts
// and social posts, built from data every role already loads (no new tables). Admin: everything. Creative: the posts
// they can read + the contracts sent to them. Each entry knows who did it, so «my own» actions never count as new.
import type { Snapshot } from '@/data/repo'
import type { User } from '@/types'

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
  const contracts = new Map(s.contracts.map((c) => [c.id, c]))
  if (user.role === 'client') {
    // the client's own «inbox»: what was sent to them (their snapshot only holds sent versions) and what went live
    for (const v of s.contractVersions) {
      const c = contracts.get(v.contractId)
      if (c && v.sentAt) out.push({ id: `cr:${v.id}`, at: v.sentAt, kind: 'c_received', title: c.title, n: v.number, target: { type: 'contract', id: c.id } })
    }
    const ps = new Map(s.posts.map((p) => [p.id, p]))
    for (const v of s.postVersions) {
      const p = ps.get(v.postId)
      if (p && v.sentAt) out.push({ id: `pr:${v.id}`, at: v.sentAt, kind: 'p_received', title: p.title, n: v.number, target: { type: 'post', id: p.id } })
    }
    for (const p of s.posts) if (p.publishedAt) out.push({ id: `pp:${p.id}`, at: p.publishedAt, kind: 'p_published', title: p.title, target: { type: 'post', id: p.id } })
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
  const posts = new Map(s.posts.map((p) => [p.id, p]))
  for (const v of s.postVersions) {
    const p = posts.get(v.postId)
    if (!p) continue
    out.push({ id: `pv:${v.id}`, at: v.createdAt, kind: 'p_version', title: p.title, n: v.number, who: name(v.createdBy), actorId: v.createdBy, target: { type: 'post', id: p.id } })
    if (v.sentAt) out.push({ id: `ps:${v.id}`, at: v.sentAt, kind: 'p_sent', title: p.title, n: v.number, target: { type: 'post', id: p.id } })
    if (v.decidedAt && v.decision) out.push({ id: `pd:${v.id}`, at: v.decidedAt, kind: v.decision === 'approved' ? 'p_approved' : 'p_changes', title: p.title, n: v.number, note: v.decisionNote, target: { type: 'post', id: p.id } })
  }
  for (const p of s.posts) if (p.publishedAt) out.push({ id: `pp:${p.id}`, at: p.publishedAt, kind: 'p_published', title: p.title, target: { type: 'post', id: p.id } })
  return tidy(out.filter((a) => !OWN[user.role]?.has(a.kind)), user, since)
}

// 1 Nov (Yousef: «إذا أنا اللي أعدل مباشرة فليش تظهر لي كل هذه؟»): your OWN moves are never news to you. Contract
// events and post versions carry who did them (actorId → dropped in tidy() when it is you), so a second admin — the
// manager — still sees what the other one did. Only the moves stored WITHOUT a person (a post «sent» / «published»,
// always the team's own click) are left out for the team.
const OWN: Partial<Record<User['role'], Set<ActivityKind>>> = {
  admin: new Set<ActivityKind>(['p_sent', 'p_published']),
  creative: new Set<ActivityKind>(['p_sent']),
}

/** Drop the user's own moves, keep 30 days, and show ONE row per contract/post: its newest news (no piles). */
function tidy(list: Activity[], user: User, since: number): Activity[] {
  const seen = new Set<string>()
  return list
    .filter((a) => a.at && Date.parse(a.at) >= since && a.actorId !== user.id)
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
  return feed.filter((a) => !seenAt || a.at > seenAt).length
}
