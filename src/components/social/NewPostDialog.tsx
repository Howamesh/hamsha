import { useMemo, useState, type FormEvent } from 'react'
import { Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { MEDIA_MAX, POST_FORMATS, POST_PLATFORMS, type MediaItem, type PostFormat, type PostPlatform } from '@/types'
import { useObjectUrls } from '@/lib/useMedia'
import { Button, Input, SectionTitle } from '../ui'
import { FeedPreview } from './FeedPreview'
import { MediaField } from './MediaField'
import { ClientAccountsDialog } from './ClientAccountsDialog'

/**
 * «منشور جديد» (team): post + its first frozen version (one image or a carousel) in one go. The admin may
 * pick any client and the client's real account on that platform; a creative sees only clients they work with.
 */
export function NewPostDialog({ clientId: fixedClient, onClose }: { clientId: string | null; onClose: () => void }) {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const sess = useSession()
  const openPost = useUi((u) => u.openPost)
  const myClients = useMemo(() => {
    if (me.role === 'admin') return s.clients
    const mine = new Set(s.tasks.filter((x) => x.ownerId === me.id || s.parts.some((p) => p.taskId === x.id && p.assigneeId === me.id)).map((x) => x.clientId))
    return s.clients.filter((c) => mine.has(c.id))
  }, [s, me])
  const [clientId, setClientId] = useState(fixedClient ?? myClients[0]?.id ?? '')
  const [taskId, setTaskId] = useState('')
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState<PostPlatform>('instagram')
  const [format, setFormat] = useState<PostFormat>('portrait')
  const [accountId, setAccountId] = useState<string>('')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [caption, setCaption] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [accounts, setAccounts] = useState(false)
  const client = s.clients.find((c) => c.id === clientId)
  const tasks = s.tasks.filter((x) => x.clientId === clientId)
  const platformAccounts = s.clientAccounts.filter((a) => a.clientId === clientId && a.platform === platform)
  const account = platformAccounts.find((a) => a.id === accountId) ?? platformAccounts[0]
  const previews = useObjectUrls(media)
  const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'
  const can = !!clientId && !!title.trim() && media.length > 0 && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!can) return
    setBusy(true)
    try {
      const post = await sess.createPost({ clientId, taskId: taskId || undefined, accountId: account?.id, title: title.trim(), platform, format })
      await sess.addPostVersion({ postId: post.id, media, caption: caption.trim(), note: note.trim() || undefined })
      onClose()
      openPost(post.id)
    } catch {
      /* the session store already showed the error toast */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/35 grid place-items-center p-4 anim-fade" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-[min(900px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet max-h-[92dvh] overflow-y-auto no-scrollbar" role="dialog" aria-label={t('newPostTitle')}>
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">{t('newPostTitle')}</div>
          <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label={t('cancel')}>
            <X size={16} />
          </Button>
        </div>
        <div className="grid gap-5 md:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-3">
            {!fixedClient && (
              <label className="flex flex-col gap-1.5">
                <SectionTitle>{t('tabClients')}</SectionTitle>
                <select value={clientId} onChange={(e) => { setClientId(e.target.value); setTaskId(''); setAccountId('') }} className={cn(field, '-mt-1 cursor-pointer')} data-testid="post-client">
                  {myClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <SectionTitle>{t('postTitle')}</SectionTitle>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('postTitlePh')} dir="auto" className="-mt-1 py-2 text-[13px]" required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <SectionTitle>{t('platform')}</SectionTitle>
                <select value={platform} onChange={(e) => { setPlatform(e.target.value as PostPlatform); setAccountId('') }} className={cn(field, '-mt-1 cursor-pointer')} data-testid="post-platform">
                  {(Object.keys(POST_PLATFORMS) as PostPlatform[]).map((k) => (
                    <option key={k} value={k}>
                      {POST_PLATFORMS[k][lang]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <SectionTitle>{t('format')}</SectionTitle>
                <select value={format} onChange={(e) => setFormat(e.target.value as PostFormat)} className={cn(field, '-mt-1 cursor-pointer')}>
                  {(Object.keys(POST_FORMATS) as PostFormat[]).map((k) => (
                    <option key={k} value={k}>
                      {POST_FORMATS[k][lang]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-1.5">
              <SectionTitle>{t('accountLabel')}</SectionTitle>
              <div className="flex gap-2 -mt-1">
                <select value={account?.id ?? ''} onChange={(e) => setAccountId(e.target.value)} className={cn(field, 'cursor-pointer flex-1')} data-testid="post-account" disabled={platformAccounts.length === 0}>
                  {platformAccounts.length === 0 && <option value="">{t('noAccount')}</option>}
                  {platformAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.handle} · {a.displayName}
                    </option>
                  ))}
                </select>
                {(me.role === 'admin' || platformAccounts.length > 0) && (
                  <Button type="button" size="sm" variant={platformAccounts.length === 0 && me.role === 'admin' ? 'dark' : 'outline'} onClick={() => setAccounts(true)} data-testid="manage-accounts">
                    <Settings2 size={14} /> {me.role === 'admin' ? t('manageAccounts') : t('accountLabel')}
                  </Button>
                )}
              </div>
            </div>
            {tasks.length > 0 && (
              <label className="flex flex-col gap-1.5">
                <SectionTitle>{t('linkedTask')}</SectionTitle>
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={cn(field, '-mt-1 cursor-pointer')}>
                  <option value="">{t('noLinkedTask')}</option>
                  {tasks.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <MediaField items={media} onChange={setMedia} max={MEDIA_MAX[platform]} />
            <label className="flex flex-col gap-1.5">
              <SectionTitle>{t('caption')}</SectionTitle>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder={t('captionPh')} dir="auto" className={cn(field, '-mt-1 resize-y')} />
            </label>
            <label className="flex flex-col gap-1.5">
              <SectionTitle>{t('noteToClient')}</SectionTitle>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('noteToClientPh')} dir="auto" className="-mt-1 py-2 text-[13px]" />
            </label>
          </div>
          <div className="flex flex-col items-center gap-2">
            <FeedPreview platform={platform} format={format} media={previews} caption={caption} account={account} clientName={client?.name ?? '—'} width={260} />
            {!account && <span className="text-[10.5px] text-fg-muted text-center px-2">{t('previewNoAccount')}</span>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!can}>
            {busy ? t('uploading') : t('createPost')}
          </Button>
        </div>
      </form>
      {/* outside the <form>: a form cannot nest another form, and clicks inside must not close this dialog */}
      {accounts && clientId && (
        <div onClick={(e) => e.stopPropagation()}>
          <ClientAccountsDialog clientId={clientId} platform={platform} onClose={() => setAccounts(false)} onPicked={(a) => { if (a.platform === platform) setAccountId(a.id); setAccounts(false) }} />
        </div>
      )}
    </div>
  )
}
