import { useMemo, useState } from 'react'
import { Images, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { POST_PLATFORMS, type Post } from '@/types'
import { postsNeedingAction, visiblePosts, visibleVersions } from '@/lib/social'
import { useMediaUrl } from '@/lib/useMedia'
import { Button, Segmented } from '../ui'
import { PostViewer } from './PostViewer'
import { useMediaUrls } from '@/lib/useMedia'
import { BrandTile } from '../BrandTile'
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
    .filter((p) => (filter === 'all' ? true : filter === 'archive' ? p.status === 'published' : me.role === 'client' ? p.status === 'sent' : p.status !== 'published' && (me.role === 'admin' ? p.status !== 'sent' : p.status === 'changes')))
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
            { value: 'all', label: t('filterAll') },
            { value: 'archive', label: t('filterArchive') },
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
  const account = s.clientAccounts.find((a) => a.id === post.accountId)
  // a client only has the sent versions: the card shows the newest one they may see
  const v = visibleVersions(s, me, post.id).find((x) => x.number === post.currentVersion) ?? visibleVersions(s, me, post.id)[0]
  const src = useMediaUrl(v?.imagePaths[0])
  const ratio = post.format === 'story' ? '9 / 16' : post.format === 'portrait' ? '4 / 5' : '1 / 1'
  return (
    <button type="button" onClick={onOpen} className="rounded-md border border-border bg-bg text-start cursor-pointer hover:border-fg-faint overflow-hidden flex flex-col anim-fade" data-testid="post-card" data-status={post.status}>
      <div className="relative w-full bg-muted-bg overflow-hidden" style={{ aspectRatio: ratio, maxHeight: 280 }}>
        {src ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} /> : <div className="absolute inset-0 grid place-items-center text-[11px] text-fg-muted">{t('noVersionYet')}</div>}
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
  const items = posts
    .filter((p) => p.status === 'approved' || p.status === 'published')
    .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt))
    .map((p) => ({ post: p, v: visibleVersions(s, me, p.id).find((x) => x.number === p.currentVersion) }))
    .filter((x) => !!x.v)
  const covers = useMediaUrls(useMemo(() => items.map((x) => x.v!.imagePaths[0]), [items]))
  const [open, setOpen] = useState<number | null>(null)
  const cur = open !== null ? items[open] : null
  const curMedia = useMediaUrls(useMemo(() => (cur ? cur.v!.imagePaths : []), [cur]))
  if (items.length === 0) return <Empty text={t('gridEmpty')} />
  return (
    <div className="mx-auto w-full max-w-[520px] flex flex-col gap-2" data-testid="feed-grid">
      <div className="text-[11.5px] text-fg-muted text-center">{t('gridHint')}</div>
      <div className="grid grid-cols-3 gap-[2px]">
        {items.map((x, i) => (
          <button key={x.post.id} type="button" onClick={() => setOpen(i)} className="relative aspect-square bg-muted-bg overflow-hidden cursor-pointer" data-testid="grid-cell" data-status={x.post.status}>
            {covers[i] ? <img src={covers[i]!} alt="" className="w-full h-full object-cover" draggable={false} /> : null}
            {x.v!.imagePaths.length > 1 && <Images size={14} className="absolute top-1.5 end-1.5 text-white drop-shadow" />}
            {x.post.status === 'approved' && <span className="absolute bottom-1 start-1 text-[9.5px] font-bold rounded px-1 py-0.5 bg-black/60 text-white">{t('postStatusApproved')}</span>}
          </button>
        ))}
      </div>
      {cur && (
        <PostViewer
          platform={cur.post.platform}
          format={cur.post.format}
          media={curMedia}
          caption={cur.v!.caption}
          account={s.clientAccounts.find((a) => a.id === cur.post.accountId)}
          clientName={s.clients.find((c) => c.id === cur.post.clientId)?.name ?? '—'}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
