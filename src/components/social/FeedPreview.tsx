import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { repo } from '@/data'
import { POST_FORMATS, type ClientAccount, type PostFormat, type PostPlatform } from '@/types'

/**
 * «كأنه داخل التطبيق نفسه» (1 Nov, Yousef: «شكله غبي في موقعنا»): the post exactly as the client's followers will
 * meet it — a real phone (status bar, island, home bar), the app's own Arabic layout (Instagram post / story,
 * Twitter, LinkedIn, TikTok / Snapchat full screen), the client's real picture + handle (set once per account).
 * Still NO official logos and NO invented likes/comments/followers (council 2026-10-29): the client judges the
 * design, not fake numbers. The words «معاينة قبل النشر» sit under the phone, never inside the app.
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

// ---- generic outline icons drawn in the apps' style (no brand marks) ----
const I = {
  heart: 'M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.8 6.8 4.6c2-.1 3.6 1 5.2 2.9 1.6-1.9 3.2-3 5.2-2.9 3.4.2 5.3 3.6 4.1 6.7-1.8 4.6-9.3 9.2-9.3 9.2z',
  comment: 'M20.7 16.6A9 9 0 1 0 17 20.2l3.9 1.1-1.2-3.8z',
  send: 'M22 3 9.2 10.1M22 3l-6.6 18-4.2-8.2L3 8.6 22 3z',
  save: 'M19 21 12 15.8 5 21V3.5h14V21z',
  back: 'M15 5 8 12l7 7',
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6.5H9V21H3V10.5z',
  search: 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5.5 5.5',
  plus: 'M4 4h16v16H4zM12 8v8M8 12h8',
  reels: 'M3.5 3.5h17v17h-17zM3.5 8.5h17M8 3.5l3 5M14 3.5l3 5M10 12v5.5l4.5-2.75L10 12z',
  reply: 'M4 5h16v11H9l-5 4V5z',
  repost: 'M7 7h11v4M17 17H6v-4M15 4l3 3-3 3M9 20l-3-3 3-3',
  like2: 'M7 11v9H4v-9h3zm0 0 4-7c1.5 0 2.3 1 2 2.5L12.5 10H19c1.2 0 2 1 1.8 2.1l-1.3 6.2c-.2 1-1 1.7-2 1.7H7',
  views: 'M5 20V12M10 20V6M15 20v-9M20 20V9',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20h4',
  mail: 'M3 5h18v14H3zM3 5l9 7 9-7',
}
function Ico({ d, size, fill, className, stroke = 1.9 }: { d: string; size: number; fill?: boolean; className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cn('shrink-0', className)} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
function Dots3({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden className="shrink-0">
      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}

export function FeedPreview({ platform, format, media, caption, account, clientName, width = 300, dark = false, index, onIndex, onOpen, className, large }: FeedPreviewProps) {
  const { t, lang } = useStr()
  const ratio = POST_FORMATS[format].ratio
  // TikTok and Snapchat live full screen; a story is full screen on every app
  const vertical = format === 'story' || platform === 'tiktok' || platform === 'snapchat'
  const [local, setLocal] = useState(0)
  const [more, setMore] = useState(false)
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
  const name = account?.displayName?.trim() || clientName
  // never invent a handle: until the client's account is saved, the name stands in for it
  const realHandle = account?.handle?.trim() || ''
  const handle = realHandle || name
  const avatar = account?.avatarPath ? repo.publicUrl(account.avatarPath) : null
  // real proportions: every size below is in iPhone points (a 375 × 812 screen), scaled to this phone's width
  const bezel = Math.max(5, Math.round(width * 0.03))
  const screenW = width - bezel * 2
  const s = screenW / 375
  const px = (n: number) => Math.round(n * s * 10) / 10
  const fg = dark ? '#f5f5f5' : '#0c0c0c'
  const sub = dark ? '#a8a8a8' : '#737373'
  const line = dark ? '#262626' : '#dbdbdb'
  const bg = dark ? '#000' : '#fff'

  const Avatar = ({ size, ring }: { size: number; ring?: boolean }) => {
    const inner = avatar ? (
      <img src={avatar} alt="" className="rounded-full object-cover w-full h-full" draggable={false} />
    ) : (
      <span className="rounded-full grid place-items-center font-bold text-white w-full h-full" style={{ background: '#8a8a8a', fontSize: size * 0.42 }}>{name.trim().charAt(0) || '•'}</span>
    )
    if (!ring) return <span className="shrink-0 block" style={{ width: size, height: size }}>{inner}</span>
    // the coloured «new story» ring is a generic gradient, not a logo
    return (
      <span className="shrink-0 rounded-full p-[2px] block" style={{ width: size + 6, height: size + 6, background: 'linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)' }}>
        <span className="block rounded-full p-[2px] w-full h-full" style={{ background: bg }}>{inner}</span>
      </span>
    )
  }

  const Media = ({ rounded }: { rounded?: boolean }) => (
    <div
      className={cn('relative w-full overflow-hidden', vertical && 'h-full', onOpen && 'cursor-zoom-in', rounded && 'rounded-[14px] border')}
      style={{ ...(vertical ? {} : { aspectRatio: String(ratio) }), background: dark ? '#1a1a1a' : '#efefef', borderColor: line }}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      aria-label={onOpen ? t('openFull') : undefined}
      data-testid="feed-design"
    >
      {media[i] ? <img src={media[i]!} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} data-testid="feed-image" /> : <div className="absolute inset-0 grid place-items-center text-[11px] opacity-50">{t('imageLoading')}</div>}
      {media.length > 1 && !vertical && (
        <>
          <span className="absolute top-2.5 end-2.5 rounded-full bg-black/70 text-white font-semibold px-2 py-[2px] tabular-nums" style={{ fontSize: px(11) }} dir="ltr" data-testid="carousel-counter">
            {i + 1}/{media.length}
          </span>
          {/* tap the left / right half to move, like the app (plus small arrows for a mouse) */}
          <button type="button" aria-label={t('mediaEarlier')} onClick={(e) => { e.stopPropagation(); go(i - 1) }} className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/80 text-black grid place-items-center cursor-pointer" style={{ width: px(22), height: px(22) }}>
            <Ico d="M15 5 8 12l7 7" size={px(13)} stroke={2.6} />
          </button>
          <button type="button" aria-label={t('mediaLater')} onClick={(e) => { e.stopPropagation(); go(i + 1) }} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/80 text-black grid place-items-center cursor-pointer" style={{ width: px(22), height: px(22) }}>
            <Ico d="M9 5l7 7-7 7" size={px(13)} stroke={2.6} />
          </button>
        </>
      )}
    </div>
  )
  const CarouselDots = () =>
    media.length > 1 ? (
      <div className="flex justify-center gap-[3px]" dir="ltr" data-testid="carousel-dots">
        {media.map((_, k) => (
          <span key={k} className="rounded-full" style={{ width: px(6), height: px(6), background: k === i ? '#0095f6' : dark ? '#555' : '#c7c7c7' }} />
        ))}
      </div>
    ) : null
  const Caption = ({ clamp = 2 }: { clamp?: number }) =>
    caption ? (
      <div className="leading-[1.4] whitespace-pre-wrap" style={{ fontSize: px(13) }} dir="auto" data-testid="feed-caption">
        <span className={cn(!(more || large) && (clamp === 2 ? 'line-clamp-2' : 'line-clamp-3'))}>
          <b dir="ltr">{handle}</b>{'\u00a0 '}
          {caption}
        </span>
        {!more && !large && caption.length > 70 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setMore(true) }} className="cursor-pointer" style={{ color: sub }}>{lang === 'ar' ? 'المزيد' : 'more'}</button>
        )}
      </div>
    ) : null
  const when = lang === 'ar' ? 'الآن' : 'Just now'

  // ---------------- per-app screens ----------------
  let screen: React.ReactNode
  if (vertical) {
    // Instagram / Snapchat story, TikTok video: the design fills the screen, the app floats on top
    const tiktok = platform === 'tiktok' && format !== 'story'
    screen = (
      <div className="absolute inset-0 bg-black text-white">
        {Media({})}
        <div className="absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        {!tiktok && (
          <div className="absolute inset-x-2 flex gap-[3px]" style={{ top: px(48) }}>
            {(media.length > 1 ? media : [0]).map((_, k) => (
              <span key={k} className={cn('flex-1 rounded-full', k <= i ? 'bg-white/95' : 'bg-white/40')} style={{ height: px(2.5) }} />
            ))}
          </div>
        )}
        {!tiktok && (
          <div className="absolute inset-x-3 flex items-center gap-2" style={{ top: px(58) }} dir="rtl">
            <Avatar size={px(30)} />
            <b style={{ fontSize: px(13) }} dir="ltr">{handle}</b>
            <span style={{ fontSize: px(12.5) }} className="opacity-80">{when}</span>
            <span className="ms-auto flex items-center gap-3"><Dots3 size={px(20)} /><span style={{ fontSize: px(22), lineHeight: 1 }}>×</span></span>
          </div>
        )}
        {media.length > 1 && (
          <>
            <button type="button" aria-label={t('mediaEarlier')} onClick={(e) => { e.stopPropagation(); go(i - 1) }} className="absolute left-0 top-[18%] bottom-[22%] w-1/3 cursor-pointer" />
            <button type="button" aria-label={t('mediaLater')} onClick={(e) => { e.stopPropagation(); go(i + 1) }} className="absolute right-0 top-[18%] bottom-[22%] w-1/3 cursor-pointer" />
            <span className="sr-only" data-testid="carousel-counter">{i + 1}/{media.length}</span>
          </>
        )}
        {tiktok ? (
          <>
            <div className="absolute flex flex-col items-center gap-4" style={{ right: px(10), bottom: px(96) }}>
              <Avatar size={px(40)} />
              <Ico d={I.heart} size={px(30)} fill />
              <Ico d={I.comment} size={px(28)} fill />
              <Ico d={I.save} size={px(26)} fill />
              <Ico d={I.send} size={px(26)} />
            </div>
            <div className="absolute flex flex-col gap-1" style={{ left: px(12), right: px(64), bottom: px(64) }} dir="auto">
              <b style={{ fontSize: px(14) }} dir="auto">{realHandle ? `@${realHandle}` : name}</b>
              {caption && <div className="leading-snug line-clamp-3" style={{ fontSize: px(13) }} data-testid="feed-caption">{caption}</div>}
            </div>
          </>
        ) : (
          <>
            {caption && format === 'story' && <div className="absolute inset-x-4 text-center leading-snug line-clamp-4 drop-shadow-md" style={{ bottom: px(80), fontSize: px(14) }} dir="auto" data-testid="feed-caption">{caption}</div>}
            {caption && format !== 'story' && <div className="absolute inset-x-4 leading-snug line-clamp-3 drop-shadow-md" style={{ bottom: px(80), fontSize: px(13) }} dir="auto" data-testid="feed-caption">{caption}</div>}
            <div className="absolute inset-x-3 flex items-center gap-3" style={{ bottom: px(30) }} dir="rtl">
              <span className="flex-1 rounded-full border border-white/70 px-3" style={{ fontSize: px(13), paddingBlock: px(7) }}>{lang === 'ar' ? 'إرسال رسالة' : 'Send message'}</span>
              <Ico d={I.heart} size={px(24)} />
              <Ico d={I.send} size={px(24)} />
            </div>
          </>
        )}
      </div>
    )
  } else if (platform === 'x' || platform === 'linkedin') {
    // a text-first timeline post: words above a rounded picture
    const li = platform === 'linkedin'
    screen = (
      <div className="absolute inset-0 flex flex-col" style={{ background: bg, color: fg }} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="flex items-center gap-3 px-3 border-b" style={{ paddingTop: px(50), paddingBottom: px(8), borderColor: line }}>
          <Ico d={I.back} size={px(22)} className="rtl:rotate-180" />
          <b style={{ fontSize: px(16) }}>{li ? (lang === 'ar' ? 'منشور' : 'Post') : lang === 'ar' ? 'المنشور' : 'Post'}</b>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pt-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <Avatar size={px(li ? 44 : 40)} />
            <div className="min-w-0 leading-tight">
              <div className="font-bold truncate" style={{ fontSize: px(14) }} dir="auto">{name}</div>
              <div className="truncate" style={{ fontSize: px(12.5), color: sub }} dir="ltr">{li || !realHandle ? when : `@${realHandle}`}</div>
            </div>
            <span className="ms-auto" style={{ color: sub }}><Dots3 size={px(18)} /></span>
          </div>
          {caption && <div className="leading-[1.45] whitespace-pre-wrap" style={{ fontSize: px(14) }} dir="auto" data-testid="feed-caption">{caption}</div>}
          {Media({ rounded: !li })}
          {CarouselDots()}
          <div style={{ fontSize: px(12), color: sub }}>{when}</div>
          <div className="flex items-center justify-between border-t pt-2.5" style={{ borderColor: line, color: sub }}>
            {li ? (
              [['أعجبني', 'Like', I.like2], ['تعليق', 'Comment', I.comment], ['إعادة نشر', 'Repost', I.repost], ['إرسال', 'Send', I.send]].map(([ar, en, d]) => (
                <span key={en} className="flex flex-col items-center gap-0.5" style={{ fontSize: px(10.5) }}><Ico d={d} size={px(19)} />{lang === 'ar' ? ar : en}</span>
              ))
            ) : (
              [I.reply, I.repost, I.heart, I.views, I.save].map((d, k) => <Ico key={k} d={d} size={px(19)} />)
            )}
          </div>
        </div>
        <div className="flex items-center justify-around border-t" style={{ borderColor: line, paddingTop: px(8), paddingBottom: px(24) }}>
          {[I.home, I.search, I.bell, I.mail].map((d, k) => <Ico key={k} d={d} size={px(23)} fill={k === 0} />)}
        </div>
      </div>
    )
  } else {
    // Instagram post (also the default look): the single-post page of the client's profile, in the app's Arabic layout
    screen = (
      <div className="absolute inset-0 flex flex-col" style={{ background: bg, color: fg }} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="flex items-center gap-3 px-3" style={{ paddingTop: px(48), paddingBottom: px(6) }}>
          <Ico d={I.back} size={px(24)} className="rtl:rotate-180" />
          <div className="leading-tight min-w-0">
            <div className="truncate uppercase" style={{ fontSize: px(11), color: sub }} dir="ltr">{handle}</div>
            <b style={{ fontSize: px(15) }}>{lang === 'ar' ? 'المنشورات' : 'Posts'}</b>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          <div className="flex items-center gap-2.5 px-3" style={{ paddingBlock: px(8) }}>
            <Avatar size={px(30)} ring />
            <div className="min-w-0 leading-tight">
              <b className="block truncate" style={{ fontSize: px(13) }} dir="ltr">{handle}</b>
              {account?.displayName && <span className="block truncate" style={{ fontSize: px(11.5), color: sub }} dir="auto">{name}</span>}
            </div>
            <span className="ms-auto"><Dots3 size={px(20)} /></span>
          </div>
          {Media({})}
          <div className="px-3" style={{ paddingTop: px(9) }}>
            <div className="relative flex items-center gap-3.5">
              <Ico d={I.heart} size={px(25)} />
              <Ico d={I.comment} size={px(24)} className="ltr:-scale-x-100" />
              <Ico d={I.send} size={px(24)} className="rtl:-scale-x-100" />
              <span className="absolute inset-x-0 flex justify-center pointer-events-none">{CarouselDots()}</span>
              <Ico d={I.save} size={px(24)} className="ms-auto" />
            </div>
            <div className="flex flex-col gap-1" style={{ paddingTop: px(8), paddingBottom: px(10) }}>
              {Caption({})}
              <div style={{ fontSize: px(11), color: sub }}>{when}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-around border-t" style={{ borderColor: line, paddingTop: px(9), paddingBottom: px(24) }}>
          <Ico d={I.home} size={px(24)} fill />
          <Ico d={I.search} size={px(24)} />
          <Ico d={I.plus} size={px(24)} />
          <Ico d={I.reels} size={px(24)} stroke={1.6} />
          <span className="rounded-full overflow-hidden ring-1" style={{ width: px(25), height: px(25), ['--tw-ring-color' as string]: fg }}><Avatar size={px(25)} /></span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('mx-auto flex flex-col items-center gap-2 select-none', className)} style={{ width }} data-testid="feed-preview" data-dark={dark ? '1' : '0'} data-platform={platform}>
      {/* the phone */}
      <div className="relative w-full bg-[#0b0b0d] shadow-[0_22px_48px_rgba(0,0,0,0.28)]" style={{ padding: bezel, borderRadius: px(46) + bezel }} dir="ltr">
        <div className="relative overflow-hidden" style={{ height: Math.round(screenW * (812 / 375)), borderRadius: px(46), background: bg }}>
          {screen}
          {/* status bar + island (above every app) */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between pointer-events-none" style={{ height: px(44), paddingInline: px(22), color: vertical ? '#fff' : fg }}>
            <b style={{ fontSize: px(13) }} className="tabular-nums">9:41</b>
            <span className="absolute left-1/2 -translate-x-1/2 bg-black rounded-full" style={{ top: px(10), width: px(88), height: px(25) }} />
            <span className="flex items-center gap-1">
              <svg viewBox="0 0 18 12" width={px(16)} height={px(11)} fill="currentColor" aria-hidden><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
              <svg viewBox="0 0 16 12" width={px(15)} height={px(11)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M1.5 4.5a9.5 9.5 0 0 1 13 0M4 7.3a6 6 0 0 1 8 0" /><circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none" /></svg>
              <svg viewBox="0 0 27 13" width={px(24)} height={px(12)} aria-hidden><rect x="0.5" y="0.5" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" /><rect x="2.5" y="2.5" width="18" height="8" rx="2" fill="currentColor" /><rect x="24" y="4.5" width="2" height="4" rx="1" fill="currentColor" opacity="0.4" /></svg>
            </span>
          </div>
          {/* home indicator */}
          <span className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none" style={{ bottom: px(7), width: px(110), height: px(4.5), background: vertical || dark ? '#fff' : '#000' }} />
        </div>
      </div>
      <div className="text-[10.5px] text-fg-muted">{t('previewLabel')}</div>
    </div>
  )
}
