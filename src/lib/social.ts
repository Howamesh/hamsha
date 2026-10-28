import type { Snapshot } from '@/data/repo'
import type { Post, User } from '@/types'

/** Posts a user may see on the board (the database enforces the same with RLS / the client views). */
export function visiblePosts(s: Snapshot, user: User, calId: string | null): Post[] {
  if (user.role === 'admin') return calId ? s.posts.filter((p) => p.clientId === calId) : s.posts
  if (user.role === 'client') return s.posts.filter((p) => p.clientId === user.clientId)
  const myClients = new Set(s.tasks.filter((t) => t.ownerId === user.id || s.parts.some((p) => p.taskId === t.id && p.assigneeId === user.id)).map((t) => t.clientId))
  return s.posts.filter((p) => p.createdBy === user.id || myClients.has(p.clientId))
}

/** What needs this role's hand right now (drives the badge on the «السوشل» switch). */
export function postsNeedingAction(posts: Post[], role: User['role']): number {
  if (role === 'client') return posts.filter((p) => p.status === 'sent').length
  if (role === 'admin') return posts.filter((p) => p.status === 'changes' || p.status === 'approved' || (p.status === 'draft' && p.currentVersion > 0)).length
  return posts.filter((p) => p.status === 'changes').length
}

export function statusTone(st: Post['status']) {
  return st === 'sent' ? 'bg-warning-tint text-warning-dark' : st === 'approved' ? 'bg-success-tint text-success-dark' : st === 'changes' ? 'bg-danger-tint text-danger-dark' : st === 'published' ? 'bg-info-tint text-info' : 'bg-muted-bg text-fg-secondary'
}
