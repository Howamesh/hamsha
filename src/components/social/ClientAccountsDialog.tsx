import { useState, type FormEvent } from 'react'
import { ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { repo } from '@/data'
import { useObjectUrl } from '@/lib/useMedia'
import { POST_PLATFORMS, type ClientAccount, type PostPlatform } from '@/types'
import { Button, Input, SectionTitle } from '../ui'

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const AVATAR_MAX = 2 * 1024 * 1024
const HANDLE_RE = /^[A-Za-z0-9._-]{1,60}$/

/** Picture of an account (public bucket) or its initial in the platform colour. */
export function AccountAvatar({ account, name, platform, size = 36 }: { account?: ClientAccount; name: string; platform: PostPlatform; size?: number }) {
  const src = account?.avatarPath ? repo.publicUrl(account.avatarPath) : null
  return src ? (
    <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} draggable={false} />
  ) : (
    <span className="rounded-full grid place-items-center font-bold text-white shrink-0" style={{ width: size, height: size, background: POST_PLATFORMS[platform].color, fontSize: size * 0.45 }}>
      {name.trim().charAt(0) || '•'}
    </span>
  )
}

/**
 * «حسابات العميل»: the real account on each platform (handle, name, picture, bio) so previews look like the
 * client's feed. Admin edits; creatives only look. Nothing is ever posted from here.
 */
export function ClientAccountsDialog({ clientId, platform: initialPlatform, onClose, onPicked }: { clientId: string; platform?: PostPlatform; onClose: () => void; onPicked?: (a: ClientAccount) => void }) {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const sess = useSession()
  const setToast = useUi((u) => u.setToast)
  const client = s.clients.find((c) => c.id === clientId)
  const accounts = s.clientAccounts.filter((a) => a.clientId === clientId).sort((a, b) => a.platform.localeCompare(b.platform) || a.handle.localeCompare(b.handle))
  const admin = me.role === 'admin'
  const [editing, setEditing] = useState<ClientAccount | 'new' | null>(admin && accounts.length === 0 ? 'new' : null)
  const [busy, setBusy] = useState(false)

  async function remove(a: ClientAccount) {
    if (!confirm(t('confirmDeleteAccount'))) return
    setBusy(true)
    try {
      await sess.deleteClientAccount(a.id)
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[88] bg-black/35 grid place-items-center p-4 anim-fade" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[min(640px,100%)] rounded-lg bg-card border border-border p-5 flex flex-col gap-4 anim-sheet max-h-[92dvh] overflow-y-auto no-scrollbar" role="dialog" aria-label={t('accountsTitle', { client: client?.name ?? '' })} data-testid="accounts-dialog">
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">{t('accountsTitle', { client: client?.name ?? '' })}</div>
          <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label={t('cancel')}>
            <X size={16} />
          </Button>
        </div>
        <div className="-mt-2 text-[12px] text-fg-secondary">{t('accountsHint')}</div>

        {accounts.length === 0 && editing === null && <div className="text-[13px] text-fg-secondary">{t('noAccountsYet')}</div>}
        <div className="flex flex-col gap-2" data-testid="accounts-list">
          {accounts.map((a) => (
            <div key={a.id} className={cn('flex items-center gap-3 rounded-md border border-border px-3 py-2', onPicked && 'cursor-pointer hover:border-fg-faint')} onClick={() => onPicked?.(a)} data-testid="account-row">
              <AccountAvatar account={a} name={a.displayName} platform={a.platform} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[13px] font-semibold truncate" dir="ltr">
                  @{a.handle}
                </div>
                <div className="text-[11.5px] text-fg-secondary truncate" dir="auto">
                  {a.displayName} · {POST_PLATFORMS[a.platform][lang]}
                </div>
              </div>
              {admin && (
                <>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={(e) => { e.stopPropagation(); setEditing(a) }} aria-label={t('editAccount')}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-accent hover:text-accent" disabled={busy} onClick={(e) => { e.stopPropagation(); void remove(a) }} aria-label={t('deleteAccount')}>
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        {admin && editing === null && (
          <Button variant="dark" size="sm" className="self-start" onClick={() => setEditing('new')}>
            <Plus size={14} /> {t('addAccount')}
          </Button>
        )}
        {admin && editing !== null && (
          <AccountForm
            clientId={clientId}
            account={editing === 'new' ? undefined : editing}
            platform={initialPlatform}
            onDone={(saved) => {
              setEditing(null)
              setToast(t('accountSaved'), 'info')
              if (saved && onPicked && editing === 'new') onPicked(saved)
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  )
}

function AccountForm({ clientId, account, platform: initialPlatform, onDone, onCancel }: { clientId: string; account?: ClientAccount; platform?: PostPlatform; onDone: (saved?: ClientAccount) => void; onCancel: () => void }) {
  const { t, lang } = useStr()
  const sess = useSession()
  const s = useData()
  const [platform, setPlatform] = useState<PostPlatform>(account?.platform ?? initialPlatform ?? 'instagram')
  const [handle, setHandle] = useState(account?.handle ?? '')
  const [name, setName] = useState(account?.displayName ?? '')
  const [bio, setBio] = useState(account?.bio ?? '')
  const [avatar, setAvatar] = useState<File | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const picked = useObjectUrl(avatar ?? null)
  const current = avatar === null ? null : picked ?? (account?.avatarPath ? repo.publicUrl(account.avatarPath) : null)
  const clean = handle.trim().replace(/^@/, '')
  const can = HANDLE_RE.test(clean) && !!name.trim() && !busy
  const field = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px]'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!can) return
    setBusy(true)
    try {
      await sess.saveClientAccount({ id: account?.id, clientId, platform, handle: clean, displayName: name.trim(), bio: bio.trim() || undefined, avatar })
      // the store already holds the saved row (same client/platform/handle)
      const saved = useSession.getState().data?.clientAccounts.find((a) => a.clientId === clientId && a.platform === platform && a.handle.toLowerCase() === clean.toLowerCase())
      onDone(saved)
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false)
    }
  }
  const preview: ClientAccount = { id: account?.id ?? 'preview', clientId, platform, handle: clean || 'handle', displayName: name || s.clients.find((c) => c.id === clientId)?.name || '—', bio: bio || undefined, avatarPath: current ?? undefined }

  return (
    <form onSubmit={submit} className="rounded-md border border-border p-4 flex flex-col gap-3" data-testid="account-form">
      <div className="flex items-center gap-3">
        <label className="relative cursor-pointer shrink-0" title={t('pickAvatar')}>
          <AccountAvatar account={preview} name={preview.displayName} platform={platform} size={56} />
          <span className="absolute -bottom-1 -end-1 w-6 h-6 rounded-full bg-fg text-bg grid place-items-center border-2 border-card">
            <ImagePlus size={12} />
          </span>
          <input
            type="file"
            accept={AVATAR_TYPES.join(',')}
            className="sr-only"
            data-testid="avatar-input"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              e.target.value = ''
              if (!f) return
              if (!AVATAR_TYPES.includes(f.type) || f.size > AVATAR_MAX) {
                setErr(t('imageOnly'))
                return
              }
              setErr(null)
              setAvatar(f)
            }}
          />
        </label>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <SectionTitle>{t('avatar')}</SectionTitle>
          <div className="flex gap-2 flex-wrap">
            <span className="text-[11.5px] text-fg-secondary">{t('pickAvatar')}</span>
            {current && (
              <button type="button" className="text-[11.5px] text-accent font-semibold cursor-pointer" onClick={() => setAvatar(null)}>
                {t('removeAvatar')}
              </button>
            )}
          </div>
          {err && <span className="text-[11px] text-accent font-semibold">{err}</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <SectionTitle>{t('platform')}</SectionTitle>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as PostPlatform)} className={cn(field, '-mt-1 cursor-pointer')} disabled={!!account}>
            {(Object.keys(POST_PLATFORMS) as PostPlatform[]).map((k) => (
              <option key={k} value={k}>
                {POST_PLATFORMS[k][lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <SectionTitle>{t('handle')}</SectionTitle>
          <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t('handlePh')} dir="ltr" className="-mt-1 py-2 text-[13px]" data-testid="account-handle" required />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <SectionTitle>{t('displayName')}</SectionTitle>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('displayNamePh')} dir="auto" className="-mt-1 py-2 text-[13px]" data-testid="account-name" required />
      </label>
      <label className="flex flex-col gap-1.5">
        <SectionTitle>{t('bio')}</SectionTitle>
        <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))} rows={2} dir="auto" className={cn(field, '-mt-1 resize-y')} />
      </label>
      <div className="text-[11px] text-fg-muted">{t('handleRule')}</div>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={!can}>
          {busy ? t('uploading') : t('saveAccount')}
        </Button>
      </div>
    </form>
  )
}
