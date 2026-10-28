import { useMemo, useState, type FormEvent } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { POST_FORMATS, POST_PLATFORMS, type PostFormat, type PostPlatform } from '@/types'
import { useObjectUrl } from '@/lib/useMedia'
import { Button, Input, SectionTitle } from '../ui'
import { PhoneFrame } from './PhoneFrame'

const MAX_BYTES = 10 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Image picker shared by «منشور جديد» and «نسخة جديدة»: validates type + size and previews the file. */
export function ImageField({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const { t } = useStr()
  const [err, setErr] = useState<string | null>(null)
  return (
    <label className="flex flex-col gap-1.5 cursor-pointer">
      <SectionTitle>{t('design')}</SectionTitle>
      <span className={cn('rounded-md border border-dashed px-3 py-3 text-[12.5px] flex items-center gap-2 -mt-1', file ? 'border-success text-success-dark bg-success-tint' : 'border-fg-faint text-fg-secondary hover:border-fg')}>
        <ImagePlus size={16} />
        <span className="truncate">{file ? file.name : t('pickImage')}</span>
        {file && <span className="ms-auto text-[11px] font-semibold">{t('changeImage')}</span>}
      </span>
      <input
        type="file"
        accept={TYPES.join(',')}
        data-testid="post-image"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          if (!f) return
          if (!TYPES.includes(f.type) || f.size > MAX_BYTES) {
            setErr(t('imageOnly'))
            onFile(null)
            return
          }
          setErr(null)
          onFile(f)
        }}
      />
      <span className={cn('text-[11px]', err ? 'text-accent font-semibold' : 'text-fg-muted')}>{err ?? t('imageOnly')}</span>
    </label>
  )
}

/**
 * «منشور جديد» (team): post + its first frozen version in one go. The admin may pick any client;
 * a creative sees only clients they work with (the database refuses the rest anyway).
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
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = useObjectUrl(file)
  const client = s.clients.find((c) => c.id === clientId)
  const tasks = s.tasks.filter((x) => x.clientId === clientId)
  const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'
  const can = !!clientId && !!title.trim() && !!file && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!can || !file) return
    setBusy(true)
    try {
      const post = await sess.createPost({ clientId, taskId: taskId || undefined, title: title.trim(), platform, format })
      await sess.addPostVersion({ postId: post.id, file, caption: caption.trim(), note: note.trim() || undefined })
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
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-[min(860px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet max-h-[92dvh] overflow-y-auto no-scrollbar" role="dialog" aria-label={t('newPostTitle')}>
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
                <select value={clientId} onChange={(e) => { setClientId(e.target.value); setTaskId('') }} className={cn(field, '-mt-1 cursor-pointer')} data-testid="post-client">
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
                <select value={platform} onChange={(e) => setPlatform(e.target.value as PostPlatform)} className={cn(field, '-mt-1 cursor-pointer')}>
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
            <ImageField file={file} onFile={setFile} />
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
            <PhoneFrame platform={platform} format={format} src={preview} caption={caption} account={client?.name ?? '—'} width={240} />
            <span className="text-[10.5px] text-fg-muted">{t('previewNote')}</span>
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
    </div>
  )
}
