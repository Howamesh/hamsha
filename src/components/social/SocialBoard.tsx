import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { POST_PLATFORMS, type Post } from '@/types'
import { postsNeedingAction, visiblePosts } from '@/lib/social'
import { useMediaUrl } from '@/lib/useMedia'
import { Button, Segmented } from '../ui'
import { BrandTile } from '../BrandTile'
import { NewPostDialog } from './NewPostDialog'
import { StatusChip } from './PostSheet'

type Filter = 'action' | 'all' | 'archive'

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
  const client = s.clients.find((c) => c.id === post.clientId)
  const v = s.postVersions.find((x) => x.postId === post.id && x.number === post.currentVersion)
  const src = useMediaUrl(v?.imagePath)
  const ratio = post.format === 'story' ? '9 / 16' : post.format === 'portrait' ? '4 / 5' : '1 / 1'
  return (
    <button type="button" onClick={onOpen} className="rounded-md border border-border bg-bg text-start cursor-pointer hover:border-fg-faint overflow-hidden flex flex-col anim-fade" data-testid="post-card" data-status={post.status}>
      <div className="relative w-full bg-muted-bg overflow-hidden" style={{ aspectRatio: ratio, maxHeight: 280 }}>
        {src ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} /> : <div className="absolute inset-0 grid place-items-center text-[11px] text-fg-muted">{t('noVersionYet')}</div>}
        <StatusChip st={post.status} className="absolute top-2 start-2 shadow-sm" />
        {post.currentVersion > 1 && <span className="absolute top-2 end-2 text-[10.5px] font-bold rounded-md px-1.5 py-0.5 bg-black/60 text-white">v{post.currentVersion}</span>}
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
          <span className={cn('ms-auto tabular-nums')} dir="ltr">
            {fmtDate(post.updatedAt.slice(0, 10), lang, { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
    </button>
  )
}
