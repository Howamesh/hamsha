import { cn } from '@/lib/utils'
import { POST_FORMATS, POST_PLATFORMS, type PostFormat, type PostPlatform } from '@/types'

/**
 * Generic phone preview — «كأنه داخل التطبيق» without any official logo: a handset, a header with the
 * account name in the platform colour, the design at its real ratio, then the caption. Stories fill the screen.
 */
export function PhoneFrame({
  platform,
  format,
  src,
  caption,
  account,
  width = 260,
  className,
}: {
  platform: PostPlatform
  format: PostFormat
  src: string | null
  caption?: string
  account: string
  width?: number
  className?: string
}) {
  const pf = POST_PLATFORMS[platform]
  const ratio = POST_FORMATS[format].ratio
  const story = format === 'story'
  const inner = width - 16
  return (
    <div className={cn('mx-auto rounded-[28px] border-[6px] border-[#1c1c20] bg-black shadow-[0_18px_40px_rgba(0,0,0,0.25)] overflow-hidden select-none', className)} style={{ width }} dir="ltr">
      <div className="relative bg-white dark:bg-[#0f0f12] text-[#111] dark:text-[#eee]" style={{ minHeight: Math.round(inner * 1.9) }}>
        <div className="h-5 flex items-center justify-center">
          <span className="w-16 h-[5px] rounded-full bg-black/80 dark:bg-white/20" />
        </div>
        {!story && (
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold text-white" style={{ background: pf.color }}>
              {account.trim().charAt(0) || '•'}
            </span>
            <div className="leading-tight">
              <div className="text-[11.5px] font-bold" dir="auto">
                {account}
              </div>
              <div className="text-[9.5px] opacity-60">{pf.en}</div>
            </div>
            <span className="ms-auto text-[14px] opacity-50">···</span>
          </div>
        )}
        <div className={cn('relative w-full bg-[#f1f1f3] dark:bg-[#1a1a1f] overflow-hidden', story && 'absolute inset-0')} style={story ? undefined : { aspectRatio: String(ratio) }}>
          {src ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} /> : <div className="absolute inset-0 grid place-items-center text-[11px] opacity-50">—</div>}
          {story && (
            <>
              <div className="absolute top-2 inset-x-2 flex gap-1">
                <span className="flex-1 h-[3px] rounded-full bg-white/90" />
                <span className="flex-1 h-[3px] rounded-full bg-white/40" />
                <span className="flex-1 h-[3px] rounded-full bg-white/40" />
              </div>
              <div className="absolute top-4 start-2 flex items-center gap-1.5 text-white drop-shadow">
                <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold" style={{ background: pf.color }}>
                  {account.trim().charAt(0) || '•'}
                </span>
                <span className="text-[11px] font-bold" dir="auto">
                  {account}
                </span>
              </div>
              {caption && (
                <div className="absolute bottom-3 inset-x-3 text-white text-[11px] leading-snug drop-shadow-md line-clamp-4" dir="auto">
                  {caption}
                </div>
              )}
            </>
          )}
        </div>
        {!story && (
          <div className="px-3 py-2">
            <div className="flex gap-3 text-[13px] opacity-70">
              <span>♡</span>
              <span>◯</span>
              <span>➤</span>
            </div>
            {caption && (
              <div className="mt-1.5 text-[11px] leading-snug line-clamp-6 whitespace-pre-wrap" dir="auto">
                <b className="me-1">{account}</b>
                {caption}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
