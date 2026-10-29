import { useMemo, useState, type FormEvent } from 'react'
import { Check, ExternalLink, Maximize2, MessageSquareWarning, Send, Settings2, Trash2, Undo2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, fmtTime, useNarrow, useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { MEDIA_MAX, POST_FORMATS, POST_PLATFORMS, type MediaItem, type Post, type PostVersion } from '@/types'
import { Button, Input, SectionTitle } from '../ui'
import { statusTone, visibleVersions } from '@/lib/social'
import { useMediaUrls, useObjectUrls } from '@/lib/useMedia'
import { FeedPreview } from './FeedPreview'
import { PostViewer } from './PostViewer'
import { MediaField } from './MediaField'
import { ClientAccountsDialog } from './ClientAccountsDialog'

export function StatusChip({ st, className }: { st: Post['status']; className?: string }) {
  const { t } = useStr()
  const key = (`postStatus${st.charAt(0).toUpperCase()}${st.slice(1)}`) as 'postStatusDraft' | 'postStatusSent' | 'postStatusApproved' | 'postStatusChanges' | 'postStatusPublished'
  return <span className={cn('text-[11px] font-bold rounded-md px-2 py-1 whitespace-nowrap', statusTone(st), className)} data-status={st}>{t(key)}</span>
}

function when(iso: string, lang: 'ar' | 'en') {
  return `${fmtDate(iso.slice(0, 10), lang, { day: 'numeric', month: 'short' })} · ${fmtTime(iso, lang)}`
}

/**
 * The post, opened from the board: the feed preview of the version being looked at (tap → full screen),
 * history, and the role's actions. After «يبي تعديل» it opens on the REJECTED version with the client's
 * note in front of the admin (nothing is lost; the corrected version starts from it).
 */
export function PostSheet() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()
  const ui = useUi()
  const sess = useSession()
  const narrow = useNarrow()
  const post = s.posts.find((p) => p.id === ui.postId)
  const versions = useMemo(() => (post && me ? visibleVersions(s, me, post.id) : []), [s, me, post])
  const current = versions.find((v) => v.number === post?.currentVersion) ?? versions[0]
  // «يبي تعديل»: the version the client rejected is the one to look at first
  const rejected = post?.status === 'changes' ? versions.find((v) => v.decision === 'changes' && v.number === post.currentVersion) : undefined
  // a manual pick lives only for the post + version it was made on (a new upload or another post resets it)
  const [pick, setPick] = useState<{ key: string; id: string } | null>(null)
  const key = `${post?.id}:${post?.currentVersion}`
  const setShown = (id: string) => setPick({ key, id })
  const view = (pick?.key === key ? versions.find((v) => v.id === pick.id) : undefined) ?? rejected ?? current
  const media = useMediaUrls(view?.imagePaths ?? [])
  const [uploading, setUploading] = useState(false)
  const [changing, setChanging] = useState(false)
  const [full, setFull] = useState(false)
  const [accounts, setAccounts] = useState(false)
  const [note, setNote] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  if (!post || !me) return null
  const client = s.clients.find((c) => c.id === post.clientId)
  const account = s.clientAccounts.find((a) => a.id === post.accountId)
  const task = post.taskId ? s.tasks.find((x) => x.id === post.taskId) : undefined
  const admin = me.role === 'admin'
  const team = me.role !== 'client'
  const isCurrent = !!view && view.number === post.currentVersion
  const clientCanDecide = me.role === 'client' && post.status === 'sent' && isCurrent && !view?.decision
  const close = () => ui.openPost(null)

  const act = async (fn: () => Promise<void>, toast?: string) => {
    setBusy(true)
    try {
      await fn()
      if (toast) ui.setToast(toast, 'info')
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false)
    }
  }
  const previewProps = { platform: post.platform, format: post.format, media, caption: view?.caption, account, clientName: client?.name ?? '—' }

  return (
    <div
      className={cn(
        'fixed z-[70] bg-card border border-border rounded-md shadow-[0_24px_60px_rgba(0,0,0,0.18)] flex flex-col anim-sheet overflow-hidden',
        narrow ? 'inset-x-0 bottom-0 top-[6%] rounded-b-none' : 'bottom-[10px] inset-x-[10px] top-[72px]',
      )}
      style={!narrow && ui.panelOpen ? { [(lang === 'ar' ? 'right' : 'left')]: 'calc(var(--panel-w) + 20px)' } : undefined}
      role="dialog"
      aria-label={post.title}
      data-testid="post-sheet"
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <span className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: client?.color ?? '#D9B600' }} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold truncate" dir="auto">
            {post.title}
          </div>
          <div className="text-[11px] text-fg-secondary truncate">
            {client?.name} · {POST_PLATFORMS[post.platform][lang]} · {POST_FORMATS[post.format][lang]}
            {account ? ` · @${account.handle}` : ''}
            {task ? ` · ${task.title}` : ''}
          </div>
        </div>
        <StatusChip st={post.status} />
        <Button size="icon" variant="ghost" onClick={close} aria-label={t('cancel')}>
          <X size={16} />
        </Button>
      </div>

      <div className={cn('flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 grid gap-5', narrow ? 'grid-cols-1' : 'grid-cols-[340px_1fr]')}>
        {/* Preview of the version being looked at — tap the design for full screen */}
        <div className="flex flex-col items-center gap-2">
          {view ? (
            <>
              <FeedPreview {...previewProps} width={narrow ? 260 : 320} onOpen={() => setFull(true)} />
              <div className="flex items-center gap-2 text-[11px] text-fg-muted">
                <span>
                  {t('version')} {view.number}
                  {isCurrent ? ` · ${t('currentVersion')}` : ''} · {when(view.createdAt, lang)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setFull(true)} aria-label={t('openFull')} data-testid="open-full">
                  <Maximize2 size={13} /> {t('openFull')}
                </Button>
              </div>
              {view.note && (
                <div className="w-full rounded-md bg-info-tint text-info text-[12px] px-3 py-2" dir="auto">
                  {view.note}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-fg-faint p-6 text-[13px] text-fg-secondary text-center w-full">{t('noVersionYet')}</div>
          )}
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          {/* ---- the client asked for changes: their note first, then the fix ---- */}
          {team && rejected && (
            <div className="rounded-md border border-danger-dark/30 bg-danger-tint/50 p-4 flex flex-col gap-2" data-testid="changes-banner">
              <div className="text-[13.5px] font-semibold text-danger-dark">{t('changesBanner', { n: rejected.number })}</div>
              {rejected.decisionNote && (
                <div className="text-[13px] whitespace-pre-wrap" dir="auto" data-testid="decision-note">
                  {rejected.decisionNote}
                </div>
              )}
              {post.status !== 'published' && (
                <Button variant="dark" className="self-start" disabled={busy} onClick={() => setUploading(true)} data-testid="upload-fixed">
                  <Upload size={14} /> {t('uploadFixed')}
                </Button>
              )}
            </div>
          )}

          {/* ---- client: the only two choices ---- */}
          {me.role === 'client' && (
            <div className="rounded-md border border-border p-4 flex flex-col gap-3" data-testid="client-decision">
              {clientCanDecide ? (
                !changing ? (
                  <>
                    <div className="text-[14px] font-semibold">{t('awaitingYou')}</div>
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="primary" className="bg-success hover:bg-success-dark px-5" disabled={busy} onClick={() => act(() => sess.decidePost(view!.id, 'approved'), t('yourDecisionSaved'))}>
                        <Check size={15} /> {t('approve')}
                      </Button>
                      <Button variant="dark" className="px-5" disabled={busy} onClick={() => setChanging(true)}>
                        <MessageSquareWarning size={15} /> {t('requestChanges')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault()
                      if (!note.trim()) return
                      void act(() => sess.decidePost(view!.id, 'changes', note.trim()), t('yourDecisionSaved')).then(() => {
                        setChanging(false)
                        setNote('')
                      })
                    }}
                  >
                    <div className="text-[13px] font-semibold">{t('requestChanges')}</div>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={t('changesNotePh')} dir="auto" autoFocus className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] resize-y" data-testid="changes-note" />
                    <div className="flex gap-2 justify-end">
                      <Button type="button" onClick={() => setChanging(false)}>
                        {t('cancel')}
                      </Button>
                      <Button type="submit" variant="primary" disabled={!note.trim() || busy}>
                        {t('sendChanges')}
                      </Button>
                    </div>
                  </form>
                )
              ) : (
                <div className="text-[13px] text-fg-secondary">
                  {post.status === 'published' && post.publishedUrl ? (
                    <a href={post.publishedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-info font-semibold hover:underline">
                      <ExternalLink size={14} /> {t('openLive')}
                    </a>
                  ) : (
                    <StatusChip st={post.status} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- team actions ---- */}
          {team && (
            <div className="rounded-md border border-border p-4 flex flex-col gap-3" data-testid="team-actions">
              <div className="flex flex-wrap gap-2 items-center">
                {admin && post.status === 'draft' && post.currentVersion > 0 && (
                  <Button variant="primary" disabled={busy} onClick={() => act(() => sess.updatePost(post.id, { status: 'sent' }), t('postSent'))}>
                    <Send size={14} /> {t('sendToClient')}
                  </Button>
                )}
                {admin && post.status === 'sent' && (
                  <Button disabled={busy} onClick={() => act(() => sess.updatePost(post.id, { status: 'draft' }), t('postWithdrawn'))}>
                    <Undo2 size={14} /> {t('withdraw')}
                  </Button>
                )}
                {post.status !== 'published' && (
                  <Button variant={post.currentVersion === 0 ? 'dark' : 'outline'} disabled={busy} onClick={() => setUploading(true)}>
                    <Upload size={14} /> {t('uploadVersion')}
                  </Button>
                )}
                {admin && post.status !== 'published' && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAccounts(true)} data-testid="sheet-accounts">
                    <Settings2 size={14} /> {account ? `@${account.handle}` : t('accountLabel')}
                  </Button>
                )}
                {post.status === 'sent' && post.sentAt && (
                  <span className="text-[11.5px] text-fg-secondary">
                    {t('awaitingClient')} · {t('sentOn')} {when(post.sentAt, lang)}
                  </span>
                )}
                {post.status === 'published' && post.publishedUrl && (
                  <a href={post.publishedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-info font-semibold hover:underline">
                    <ExternalLink size={14} /> {t('openLive')}
                  </a>
                )}
                {admin && (
                  <Button variant="ghost" size="sm" className="ms-auto text-accent hover:text-accent" disabled={busy} onClick={() => confirm(t('confirmDeletePost')) && act(() => sess.deletePost(post.id)).then(close)}>
                    <Trash2 size={14} /> {t('deletePost')}
                  </Button>
                )}
              </div>
              {admin && post.status === 'approved' && (
                <form
                  className="flex gap-2 items-end flex-wrap"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault()
                    if (!/^https?:\/\//.test(url.trim())) return
                    void act(() => sess.updatePost(post.id, { status: 'published', publishedUrl: url.trim() }), t('postPublishedSaved'))
                  }}
                >
                  <label className="flex-1 min-w-[220px] flex flex-col gap-1.5">
                    <SectionTitle>{t('publishedLink')}</SectionTitle>
                    <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('publishedLinkPh')} dir="ltr" className="-mt-1 py-2 text-[13px]" data-testid="published-url" />
                  </label>
                  <Button type="submit" variant="primary" disabled={!/^https?:\/\//.test(url.trim()) || busy}>
                    <Check size={14} /> {t('markPublished')}
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* ---- history ---- */}
          <SectionTitle>{t('versions')}</SectionTitle>
          <div className="flex flex-col gap-2 -mt-2" data-testid="versions">
            {versions.map((v) => (
              <VersionRow key={v.id} v={v} post={post} active={v.id === view?.id} onClick={() => setShown(v.id)} />
            ))}
          </div>
        </div>
      </div>

      {uploading && <NewVersionDialog post={post} from={view} onClose={() => setUploading(false)} />}
      {full && view && <PostViewer {...previewProps} onClose={() => setFull(false)} />}
      {accounts && <ClientAccountsDialog clientId={post.clientId} platform={post.platform} onClose={() => setAccounts(false)} onPicked={(a) => { if (a.platform === post.platform) void act(() => sess.updatePost(post.id, { accountId: a.id })); setAccounts(false) }} />}
    </div>
  )
}

function VersionRow({ v, post, active, onClick }: { v: PostVersion; post: Post; active: boolean; onClick: () => void }) {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()
  // people are internal: the Supabase client view has no created_by, and the demo store must behave the same
  const by = me?.role !== 'client' && v.createdBy ? s.users.find((u) => u.id === v.createdBy) : undefined
  return (
    <button type="button" onClick={onClick} className={cn('rounded-md border px-3 py-2 text-start cursor-pointer flex flex-col gap-1', active ? 'border-fg' : 'border-border hover:border-fg-faint')} data-testid="version-row">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
        <span>
          {t('version')} {v.number}
        </span>
        {v.number === post.currentVersion && <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 bg-muted-bg text-fg-secondary">{t('currentVersion')}</span>}
        {v.imagePaths.length > 1 && <span className="text-[10.5px] font-medium text-fg-muted">{t('versionImages', { n: v.imagePaths.length })}</span>}
        {v.decision && <span className={cn('text-[10.5px] font-bold rounded-md px-1.5 py-0.5', v.decision === 'approved' ? 'bg-success-tint text-success-dark' : 'bg-danger-tint text-danger-dark')}>{v.decision === 'approved' ? t('postStatusApproved') : t('postStatusChanges')}</span>}
        <span className="ms-auto text-[10.5px] text-fg-muted font-medium" dir="ltr">
          {when(v.createdAt, lang)}
        </span>
      </div>
      {by && (
        <div className="text-[11px] text-fg-secondary">
          {t('createdBy')} {by.name}
        </div>
      )}
      {v.decisionNote && (
        <div className="text-[12px] rounded-md bg-danger-tint text-danger-dark px-2.5 py-1.5 whitespace-pre-wrap" dir="auto" data-testid="version-note">
          <b className="me-1">{t('clientNotes')}:</b>
          {v.decisionNote}
        </div>
      )}
    </button>
  )
}

/** «نسخة جديدة»: starts from the version being looked at — all its images (kept, no re-upload) and caption. */
function NewVersionDialog({ post, from, onClose }: { post: Post; from?: PostVersion; onClose: () => void }) {
  const { t } = useStr()
  const s = useData()
  const sess = useSession()
  const client = s.clients.find((c) => c.id === post.clientId)
  const account = s.clientAccounts.find((a) => a.id === post.accountId)
  const [media, setMedia] = useState<MediaItem[]>(() => (from?.imagePaths ?? []).map((path) => ({ path })))
  const [caption, setCaption] = useState(from?.caption ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const previews = useObjectUrls(media)
  const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (media.length === 0 || busy) return
    setBusy(true)
    try {
      await sess.addPostVersion({ postId: post.id, media, caption: caption.trim(), note: note.trim() || undefined })
      onClose()
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-[85] bg-black/35 grid place-items-center p-4 anim-fade" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-[min(820px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet max-h-[92dvh] overflow-y-auto no-scrollbar" role="dialog" aria-label={t('uploadVersionTitle')}>
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">
            {t('uploadVersionTitle')} · {post.currentVersion + 1}
          </div>
          <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label={t('cancel')}>
            <X size={16} />
          </Button>
        </div>
        <div className="-mt-2 text-[12px] text-fg-secondary">{from ? t('keepPrevHint') : t('uploadVersionHint')}</div>
        {from?.decisionNote && (
          <div className="text-[12.5px] rounded-md bg-danger-tint text-danger-dark px-3 py-2 whitespace-pre-wrap" dir="auto">
            <b className="me-1">{t('clientNotes')}:</b>
            {from.decisionNote}
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-3">
            <MediaField items={media} onChange={setMedia} max={MEDIA_MAX[post.platform]} />
            <label className="flex flex-col gap-1.5">
              <SectionTitle>{t('caption')}</SectionTitle>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder={t('captionPh')} dir="auto" className={cn(field, '-mt-1 resize-y')} />
            </label>
            <label className="flex flex-col gap-1.5">
              <SectionTitle>{t('noteToClient')}</SectionTitle>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('noteToClientPh')} dir="auto" className="-mt-1 py-2 text-[13px]" />
            </label>
          </div>
          <FeedPreview platform={post.platform} format={post.format} media={previews} caption={caption} account={account} clientName={client?.name ?? '—'} width={230} />
        </div>
        <div className="text-[11px] text-fg-muted">{t('uploadVersionHint')}</div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={media.length === 0 || busy}>
            {busy ? t('uploading') : t('upload')}
          </Button>
        </div>
      </form>
    </div>
  )
}
