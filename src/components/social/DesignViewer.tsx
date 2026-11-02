import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { POST_FORMATS, type PostFormat } from '@/types'
import { Button } from '../ui'

/**
 * «عرض التصميم» (1 Nov, Yousef: «يطلع لحاله مثل ما صمم»): the design ALONE — no phone, no Instagram frame,
 * no caption. 2 Nov («أبيه بنفس حجم البوست العادي»): at the post's own shape (4:5 / 1:1 / 9:16) and the size a post
 * has on a phone — cropped exactly as the app crops it — never blown up to the whole screen.
 * Carousel: arrows, ← → keys, dots. Esc / tap outside / ✕ closes.
 */
export function DesignViewer({ media, format, onClose }: { media: Array<string | null>; format?: PostFormat; onClose: () => void }) {
  const { t, lang } = useStr()
  const [i, setI] = useState(0)
  const n = media.length
  const ratio = POST_FORMATS[format ?? 'portrait'].ratio
  // reading direction: in Arabic the next slide is on the LEFT
  const left = lang === 'ar' ? 1 : -1
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setI((k) => (k + left + n) % Math.max(1, n))
      if (e.key === 'ArrowRight') setI((k) => (k - left + n) % Math.max(1, n))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, n, left])
  const src = media[i]
  const step = (d: number) => (e: React.MouseEvent) => { e.stopPropagation(); setI((k) => (k + d + n) % n) }
  return (
    <div className="fixed inset-0 z-[96] bg-black/95 flex flex-col anim-fade" onClick={onClose} role="dialog" aria-label={t('viewDesign')} data-testid="design-viewer">
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        {n > 1 && <span className="text-[13px] font-semibold opacity-80 tabular-nums" dir="ltr">{i + 1} / {n}</span>}
        <div className="flex-1" />
        <Button size="icon" variant="ghost" className="text-white hover:text-white hover:bg-white/10" onClick={onClose} aria-label={t('cancel')}>
          <X size={20} />
        </Button>
      </div>
      <div className="relative flex-1 min-h-0 grid place-items-center px-3 pb-4">
        {/* a phone-sized post: ≤ 430 px wide (a phone's width), never taller than the screen */}
        <div className="relative overflow-hidden rounded-[6px] bg-white/5" onClick={(e) => e.stopPropagation()} data-testid="design-box"
          style={{ aspectRatio: String(ratio), width: `min(430px, 92vw, calc((100dvh - 150px) * ${ratio}))` }}>
          {src
            ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover select-none" draggable={false} data-testid="design-image" />
            : <div className="absolute inset-0 grid place-items-center text-white/70 text-[13px]">{t('imageLoading')}</div>}
        </div>
        {n > 1 && (
          <>
            <button type="button" onClick={step(left)} aria-label="›" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white grid place-items-center cursor-pointer"><ChevronLeft size={22} /></button>
            <button type="button" onClick={step(-left)} aria-label="‹" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white grid place-items-center cursor-pointer"><ChevronRight size={22} /></button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="flex justify-center gap-1.5 pb-5" onClick={(e) => e.stopPropagation()}>
          {media.map((_, k) => <button key={k} type="button" onClick={() => setI(k)} aria-label={String(k + 1)} className={cn('w-2 h-2 rounded-full cursor-pointer', k === i ? 'bg-white' : 'bg-white/35')} />)}
        </div>
      )}
    </div>
  )
}
