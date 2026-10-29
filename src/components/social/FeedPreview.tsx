import { useEffect, useState } from 'react'
import { Bookmark, ChevronLeft, ChevronRight, Heart, MessageCircle, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { repo } from '@/data'
import { POST_FORMATS, POST_PLATFORMS, type ClientAccount, type PostFormat, type PostPlatform } from '@/types'

/**
 * «كأنه نُشر فعلاً»: the post as it would sit in the client's feed — their real picture, name and handle,
 * the design at its true ratio (carousel with dots + arrows), the caption under generic action icons.
 * Deliberately NO official platform logos (Meta / TikTok brand rules) and NO fake likes, comments or
 * followers (council 2026-10-29): the client must judge the design, not invented numbers.
 */
export interface FeedPreviewProps {
  platform: PostPlatform
  format: PostFormat
  /** resolved image URLs in display order (null = still loading) */
  media: Array<string | null>
  caption?: string
  account?: ClientAccount
  /** fallback header name when the client has no account yet */
  clientName: string
  width?: number
  dark?: boolean
  /** controlled carousel index (optional) */
  index?: number
  onIndex?: (i: number) => void
  /** tapping the design opens it big */
  onOpen?: () => void
  className?: string
  /** large = full-screen viewer typography */
  large?: boolean
}

export function FeedPreview({ platform, format, media, caption, account, clientName, width = 300, dark = false, index, onIndex, onOpen, className, large }: FeedPreviewProps) {
  const { t } = useStr()
  const pf = POST_PLATFORMS[platform]
  const ratio = POST_FORMATS[format].ratio
  const story = format === 'story'
  const [local, setLocal] = useState(0)
  const i = Math.min(index ?? local, Math.max(0, media.length - 1))
  const go = (n: number) => {
    const next = (n + media.length) % Math.max(1, media.length)
    setLocal(next)
    onIndex?.(next)
  }
  useEffect(() => {
    if (i >= media.length) go(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.length])
  const name = account?.displayName ?? clientName
  const handle = account?.handle
  const avatar = account?.avatarPath ? repo.publicUrl(account.avatarPath) : null
  const fs = large ? 1.35 : 1
  const Avatar = ({ size }: { size: number }) =>
    avatar ? (
      <img src={avatar} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} draggable={false} />
    ) : (
      <span className="rounded-full grid place-items-center font-bold text-white shrink-0" style={{ width: size, height: size, background: pf.color, fontSize: size * 0.45 }}>
        {name.trim().charAt(0) || '•'}
      </span>
    )
  const Slides = () => (
    <>
      {media[i] ? <img src={media[i]!} alt="" className="w-full h-full object-cover" draggable={false} data-testid="feed-image" /> : <div className="absolute inset-0 grid place-items-center text-[11px] opacity-50">—</div>}
      {media.length > 1 && (
        <>
          <span className="absolute top-2 end-2 rounded-full bg-black/60 text-white text-[10.5px] font-bold px-2 py-0.5 tabular-nums" dir="ltr" data-testid="carousel-counter">
            {i + 1}/{media.length}
          </span>
          <button type="button" aria-label={t('mediaEarlier')} onClick={(e) => { e.stopPropagation(); go(i - 1) }} className="absolute start-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/85 text-black grid place-items-center cursor-pointer shadow">
            <ChevronLeft size={16} className="rtl:rotate-180" />
          </button>
          <button type="button" aria-label={t('mediaLater')} onClick={(e) => { e.stopPropagation(); go(i + 1) }} className="absolute end-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/85 text-black grid place-items-center cursor-pointer shadow">
            <ChevronRight size={16} className="rtl:rotate-180" />
          </button>
        </>
      )}
    </>
  )
  const Dots = () =>
    media.length > 1 ? (
      <div className="flex justify-center gap-1 py-1.5" data-testid="carousel-dots">
        {media.map((_, k) => (
          <span key={k} className={cn('rounded-full transition-all', k === i ? 'w-[6px] h-[6px]' : 'w-[5px] h-[5px] opacity-35')} style={{ background: k === i ? '#3797f0' : dark ? '#fff' : '#000' }} />
        ))}
      </div>
    ) : null

  return (
    <div
      className={cn('mx-auto rounded-[28px] border-[6px] border-[#1c1c20] bg-black shadow-[0_18px_40px_rgba(0,0,0,0.25)] overflow-hidden select-none', className)}
      style={{ width }}
      dir="ltr"
      data-testid="feed-preview"
      data-dark={dark ? '1' : '0'}
    >
      <div className={cn('relative', dark ? 'bg-black text-[#f5f5f5]' : 'bg-white text-[#111]')} style={{ minHeight: Math.round((width - 16) * 1.9), fontSize: 12 * fs }}>
        <div className="h-5 flex items-center justify-center">
          <span className={cn('w-16 h-[5px] rounded-full', dark ? 'bg-white/25' : 'bg-black/80')} />
        </div>
        {!story && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <Avatar size={32 * fs} />
            <div className="leading-tight min-w-0">
              <div className="font-bold truncate" style={{ fontSize: 12.5 * fs }} dir="auto">
                {handle ?? name}
              </div>
              <div className="opacity-60 truncate" style={{ fontSize: 10 * fs }} dir="auto">
                {handle ? name : pf.en}
              </div>
            </div>
            <span className="ms-auto opacity-60 tracking-widest" style={{ fontSize: 14 * fs }}>···</span>
          </div>
        )}
        <div
          className={cn('relative w-full overflow-hidden', dark ? 'bg-[#1a1a1f]' : 'bg-[#f1f1f3]', story && 'absolute inset-0', onOpen && 'cursor-zoom-in')}
          style={story ? undefined : { aspectRatio: String(ratio) }}
          onClick={onOpen}
          role={onOpen ? 'button' : undefined}
          aria-label={onOpen ? t('openFull') : undefined}
          data-testid="feed-design"
        >
          <Slides />
          {story && (
            <>
              <div className="absolute top-2 inset-x-2 flex gap-1">
                {(media.length > 1 ? media : [0]).map((_, k) => (
                  <span key={k} className={cn('flex-1 h-[3px] rounded-full', k <= i ? 'bg-white/90' : 'bg-white/40')} />
                ))}
              </div>
              <div className="absolute top-4 start-2 flex items-center gap-1.5 text-white drop-shadow">
                <Avatar size={26 * fs} />
                <span className="font-bold" style={{ fontSize: 11 * fs }} dir="auto">
                  {handle ?? name}
                </span>
              </div>
              {caption && (
                <div className="absolute bottom-3 inset-x-3 text-white leading-snug drop-shadow-md line-clamp-4" style={{ fontSize: 11 * fs }} dir="auto">
                  {caption}
                </div>
              )}
            </>
          )}
        </div>
        {!story && (
          <div className="px-3 pb-3">
            <div className="flex items-center gap-4 py-2 opacity-90">
              <Heart size={22 * fs} strokeWidth={1.8} />
              <MessageCircle size={22 * fs} strokeWidth={1.8} />
              <Send size={22 * fs} strokeWidth={1.8} />
              <Bookmark size={22 * fs} strokeWidth={1.8} className="ms-auto" />
            </div>
            <Dots />
            {caption && (
              <div className={cn('leading-snug whitespace-pre-wrap', large ? 'line-clamp-none' : 'line-clamp-6')} style={{ fontSize: 11.5 * fs }} dir="auto" data-testid="feed-caption">
                <b className="me-1.5">{handle ?? name}</b>
                {caption}
              </div>
            )}
            <div className="opacity-50 mt-1.5 uppercase tracking-wide" style={{ fontSize: 9 * fs }}>
              {t('previewLabel')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
