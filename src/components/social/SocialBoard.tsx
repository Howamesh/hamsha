import { useMemo, useState } from 'react'
import { Clapperboard, Images, LayoutGrid, Plus, SquareUser } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { POST_PLATFORMS, type Post } from '@/types'
import { accountFor, postsNeedingAction, visiblePosts, visibleVersions } from '@/lib/social'
import { useMediaUrl } from '@/lib/useMedia'
import { Button, Segmented } from '../ui'
import { DesignViewer } from './DesignViewer'
import { ClientAccountsDialog } from './ClientAccountsDialog'
import { useMediaUrls } from '@/lib/useMedia'
import { BrandTile } from '../BrandTile'
import { repo } from '@/data'
import { NewPostDialog } from './NewPostDialog'
import { StatusChip } from './PostSheet'

type Filter = 'action' | 'all' | 'archive' | 'grid'

export function SocialBoard() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const ui = useUi()
  const posts = useMemo(() => visiblePosts(s, me, ui.calId), [s, me, ui.calId])
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const team = me.role !== 'client'
  const action = postsNeedingAction(posts, me.role)
  const list = posts
    // 2 Nov (Yousef: «ليش الكل والأرشيف نفس الشيء؟»): «الحالية» = everything NOT yet published, «الأرشيف» = published
    .filter((p) => (filter === 'all' ? p.status !== 'published' : filter === 'archive' ? p.status === 'published' : me.role === 'client' ? p.status === 'sent' : p.status !== 'published' && (me.role === 'admin' ? p.status !== 'sent' : p.status === 'changes')))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  // admin: any client · creative: only when they work with at least one client (the DB refuses the rest)
  const canCreate = me.role === 'admin' ? s.clients.length > 0 : me.role === 'creative' && s.tasks.some((x) => x.ownerId === me.id || s.parts.some((p) => p.taskId === x.id && p.assigneeId === me.id))
  const clientLinked = me.role !== 'client' || !!me.clientId

  return (
    <div className="flex-1 min-h-0 rounded-md border border-border bg-card flex flex-col" data-testid="social-board">
      <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-border">
        <div className="text-[15px] font-semibold">{t('socialTitle')}</div>
        {action > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-accent-fg text-[11px] font-bold grid place-items-center">{action}</span>}
        <div className="flex-1" />
        <Segmented
          size="sm"
          value={filter}
          options={[
            { value: 'action', label: me.role === 'client' ? t('awaitingYou') : t('filterAction') },
            { value: 'all', label: t('filterCurrent') },
            { value: 'archive', label: t('filterPublished') },
            { value: 'grid', label: t('filterGrid') },
          ]}
          onChange={setFilter}
        />
        {canCreate && (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> {t('newPost')}
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4">
        {!clientLinked ? (
          <Empty text={t('notLinkedToClient')} />
        ) : filter === 'grid' ? (
          <FeedGrid posts={posts} />
        ) : posts.length === 0 ? (
          <Empty text={team ? t('socialEmptyTeam') : t('socialEmptyClient')} />
        ) : list.length === 0 ? (
          <Empty text={t('socialEmptyFilter')} />
        ) : (
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
            {list.map((p) => (
              <PostCard key={p.id} post={p} onOpen={() => ui.openPost(p.id)} lang={lang} />
            ))}
          </div>
        )}
      </div>
      {creating && <NewPostDialog clientId={ui.calId} onClose={() => setCreating(false)} />}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="h-full grid place-items-center text-[13px] text-fg-secondary text-center px-6">{text}</div>
}

function PostCard({ post, onOpen, lang }: { post: Post; onOpen: () => void; lang: 'ar' | 'en' }) {
  const { t } = useStr()
  const s = useData()
  const me = useUser()!
  const client = s.clients.find((c) => c.id === post.clientId)
  const account = accountFor(s, post)
  // a client only has the sent versions: the card shows the newest one they may see
  const v = visibleVersions(s, me, post.id).find((x) => x.number === post.currentVersion) ?? visibleVersions(s, me, post.id)[0]
  const src = useMediaUrl(v?.imagePaths[0])
  const ratio = post.format === 'story' ? '9 / 16' : post.format === 'portrait' ? '4 / 5' : '1 / 1'
  return (
    <button type="button" onClick={onOpen} className="rounded-md border border-border bg-bg text-start cursor-pointer hover:border-fg-faint overflow-hidden flex flex-col anim-fade" data-testid="post-card" data-status={post.status}>
      <div className="relative w-full bg-muted-bg overflow-hidden" style={{ aspectRatio: ratio, maxHeight: 280 }}>
        {/* 1 Nov live check: on a slow link the image is still loading — say so, never «no design yet» while it exists */}
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : v?.imagePaths[0] ? (
          <div className="absolute inset-0 grid place-items-center text-[11px] text-fg-muted animate-pulse" data-testid="card-loading">{t('imageLoading')}</div>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[11px] text-fg-muted">{t('noVersionYet')}</div>
        )}
        <StatusChip st={post.status} className="absolute top-2 start-2 shadow-sm" />
        <div className="absolute top-2 end-2 flex gap-1">
          {!!v && v.imagePaths.length > 1 && (
            <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 bg-black/60 text-white inline-flex items-center gap-1" data-testid="card-carousel">
              <Images size={11} /> {v.imagePaths.length}
            </span>
          )}
          {post.currentVersion > 1 && <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 bg-black/60 text-white">v{post.currentVersion}</span>}
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <BrandTile client={client} size={16} />
          <span className="text-[12.5px] font-semibold truncate" dir="auto">
            {post.title}
          </span>
        </div>
        <div className="text-[10.5px] text-fg-secondary flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full" style={{ background: POST_PLATFORMS[post.platform].color }} />
          {POST_PLATFORMS[post.platform][lang]}
          {account && (
            <span className="truncate" dir="ltr">
              @{account.handle}
            </span>
          )}
          <span className={cn('ms-auto tabular-nums')} dir="ltr">
            {fmtDate(post.updatedAt.slice(0, 10), lang, { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
    </button>
  )
}

/** «الشبكة»: the account as a profile grid — approved + published posts, 3 per row, newest first; tap → full screen. */
function FeedGrid({ posts }: { posts: Post[] }) {
  const { t } = useStr()
  const s = useData()
  const me = useUser()!
  // 2 Nov (Yousef: «كأني دخلت فعليا على الانستقرام… اليوزر والبايو وصورة الحساب… وأي شيء ننشره ينضاف»): the
  // client's own profile page. One profile per account (or per client while it has no saved account).
  const all = posts
    .filter((p) => p.status === 'approved' || p.status === 'published')
    .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt))
    .map((p) => ({ post: p, v: visibleVersions(s, me, p.id).find((x) => x.number === p.currentVersion) }))
    .filter((x) => !!x.v)
  const keyOf = (p: Post) => accountFor(s, p)?.id ?? `client:${p.clientId}`
  const keys = [...new Set(all.map((x) => keyOf(x.post)))]
  const [picked, setPicked] = useState<string | null>(null)
  const key = picked && keys.includes(picked) ? picked : keys[0]
  const items = all.filter((x) => keyOf(x.post) === key)
  const covers = useMediaUrls(useMemo(() => items.map((x) => x.v!.imagePaths[0]), [items]))
  const [open, setOpen] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const cur = open !== null ? items[open] : null
  const curMedia = useMediaUrls(useMemo(() => (cur ? cur.v!.imagePaths : []), [cur]))
  if (all.length === 0) return <Empty text={t('gridEmpty')} />
  const first = items[0]?.post
  const account = first ? accountFor(s, first) : undefined
  const client = s.clients.find((c) => c.id === first?.clientId)
  const name = account?.displayName?.trim() || client?.name || '—'
  const handle = account?.handle?.trim() || ''
  const avatar = account?.avatarPath ? repo.publicUrl(account.avatarPath) : null
  const labelOf = (k: string) => {
    const p = all.find((x) => keyOf(x.post) === k)!.post
    const a = accountFor(s, p)
    return a?.handle ? `@${a.handle}` : s.clients.find((c) => c.id === p.clientId)?.name ?? '—'
  }
  return (
    <div className="mx-auto w-full max-w-[470px] flex flex-col" data-testid="feed-grid">
      {keys.length > 1 && (
        <div className="flex flex-wrap gap-1.5 justify-center pb-3" data-testid="grid-accounts">
          {keys.map((k) => (
            <button key={k} type="button" onClick={() => setPicked(k)} className={cn('rounded-full border px-3 py-1 text-[12px] cursor-pointer', k === key ? 'border-fg bg-fg text-bg' : 'border-border hover:border-fg-faint')} dir="auto">{labelOf(k)}</button>
          ))}
        </div>
      )}
      {/* the app's own profile head: handle bar, picture with the ring, name, the TRUE number of posts, bio */}
      <div className="flex flex-col gap-3 pb-3" data-testid="grid-profile">
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <b className="text-[16px]" dir="ltr">{handle || name}</b>
        </div>
        <div className="flex items-center gap-5 px-1">
          <span className="shrink-0 rounded-full p-[2.5px]" style={{ background: 'linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)' }}>
            <span className="block rounded-full p-[3px] bg-bg">
              {avatar ? <img src={avatar} alt="" className="w-[80px] h-[80px] rounded-full object-cover" /> : <span className="w-[80px] h-[80px] rounded-full grid place-items-center bg-muted-bg text-[28px] font-bold">{name.trim().charAt(0) || '•'}</span>}
            </span>
          </span>
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold truncate" dir="auto">{name}</span>
            <span className="text-[13px]"><b className="tabular-nums">{items.length}</b> {t('gridPosts')}</span>
          </div>
        </div>
        {account?.bio ? <div className="text-[13px] leading-snug whitespace-pre-wrap px-1" dir="auto">{account.bio}</div> : null}
        {me.role === 'admin' && client && (
          <Button size="sm" className="w-full" onClick={() => setEditing(true)} data-testid="grid-edit-account">
            {account ? t('gridEditAccount') : t('gridAddAccount')}
          </Button>
        )}
        {!account && me.role !== 'admin' && <div className="text-[11.5px] text-fg-muted text-center">{t('gridNoAccount')}</div>}
      </div>
      {/* tabs bar of the profile (grid active) */}
      <div className="flex border-t border-border">
        <span className="flex-1 grid place-items-center py-2.5 border-t-2 border-fg -mt-px"><LayoutGrid size={20} /></span>
        <span className="flex-1 grid place-items-center py-2.5 text-fg-muted"><Clapperboard size={20} /></span>
        <span className="flex-1 grid place-items-center py-2.5 text-fg-muted"><SquareUser size={20} /></span>
      </div>
      <div className="grid grid-cols-3 gap-[2px]">
        {items.map((x, i) => (
          <button key={x.post.id} type="button" onClick={() => setOpen(i)} className="relative aspect-[3/4] bg-muted-bg overflow-hidden cursor-pointer" data-testid="grid-cell" data-status={x.post.status}>
            {covers[i] ? <img src={covers[i]!} alt="" className="w-full h-full object-cover" draggable={false} /> : null}
            {x.v!.imagePaths.length > 1 && <Images size={14} className="absolute top-1.5 end-1.5 text-white drop-shadow" />}
            {x.post.status === 'approved' && <span className="absolute bottom-1 start-1 text-[9.5px] font-bold rounded px-1 py-0.5 bg-black/60 text-white">{t('gridNotYetPublished')}</span>}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-fg-muted text-center pt-3">{t('gridHint')}</div>
      {/* a tapped post opens ALONE at post size — no phone (2 Nov) */}
      {cur && <DesignViewer media={curMedia} format={cur.post.format} onClose={() => setOpen(null)} />}
      {editing && client && <ClientAccountsDialog clientId={client.id} platform={first?.platform} onClose={() => setEditing(false)} />}
    </div>
  )
}
