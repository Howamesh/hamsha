// «آخر النشاط» (1 Nov, Yousef: «أي شيء يصير في الموقع يدخل هنا»): one time-ordered list of what happened on contracts
// and social posts, built from data every role already loads (no new tables). Admin: everything. Creative: the posts
// they can read + the contracts sent to them. Each entry knows who did it, so «my own» actions never count as new.
import type { Snapshot } from '@/data/repo'
import type { User } from '@/types'

export type ActivityKind =
  | 'c_created' | 'c_version' | 'c_first_signed' | 'c_sent' | 'c_withdrawn' | 'c_opened' | 'c_signed' | 'c_changes' | 'c_rejected' | 'c_completed' | 'c_received'
  | 'p_version' | 'p_sent' | 'p_approved' | 'p_changes' | 'p_published'
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
  if (user.role === 'client') return []
  const since = Date.now() - DAYS * 86400000
  const name = (id?: string) => (id ? s.users.find((u) => u.id === id)?.name : undefined)
  const out: Activity[] = []
  const contracts = new Map(s.contracts.map((c) => [c.id, c]))
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
  return out.filter((a) => a.at && Date.parse(a.at) >= since).sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX)
}

/** New since this user last opened «التنبيهات» — their own actions never count. */
export function unreadActivity(feed: Activity[], user: User, seenAt?: string): number {
  return feed.filter((a) => (!seenAt || a.at > seenAt) && a.actorId !== user.id).length
}
