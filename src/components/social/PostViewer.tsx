import { useEffect, useState } from 'react'
import { Moon, Sun, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { Button } from '../ui'
import { FeedPreview, type FeedPreviewProps } from './FeedPreview'

/**
 * Full-screen look at a version («يدخل ويملأ الشاشة»): dark backdrop, the feed post as large as the
 * viewport allows, carousel arrows + ← → keys, dark/light toggle for the preview only, Esc closes.
 */
export function PostViewer({ onClose, ...preview }: Omit<FeedPreviewProps, 'width' | 'onOpen' | 'large'> & { onClose: () => void }) {
  const { t } = useStr()
  const [dark, setDark] = useState(preview.dark ?? false)
  const [i, setI] = useState(preview.index ?? 0)
  const [vw, setVw] = useState(() => [window.innerWidth, window.innerHeight])
  useEffect(() => {
    const onResize = () => setVw([window.innerWidth, window.innerHeight])
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setI((k) => (k - 1 + preview.media.length) % Math.max(1, preview.media.length))
      if (e.key === 'ArrowRight') setI((k) => (k + 1) % Math.max(1, preview.media.length))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, preview.media.length])
  // the handset is ~1.9× taller than wide (+ caption): fit the height, cap the width
  const width = Math.max(300, Math.min(560, vw[0] - 32, Math.round((vw[1] - 96) / 2.15)))
  return (
    <div className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-sm flex flex-col anim-fade" onClick={onClose} role="dialog" aria-label={t('openFull')} data-testid="post-viewer">
      <div className="flex items-center gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-[13px] font-semibold opacity-80">{t('previewLabel')}</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="text-white hover:text-white hover:bg-white/10" onClick={() => setDark((d) => !d)} aria-label={dark ? t('lightPreview') : t('darkPreview')} data-testid="viewer-theme">
          {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? t('lightPreview') : t('darkPreview')}
        </Button>
        <Button size="icon" variant="ghost" className="text-white hover:text-white hover:bg-white/10" onClick={onClose} aria-label={t('cancel')}>
          <X size={18} />
        </Button>
      </div>
      <div className={cn('flex-1 min-h-0 overflow-y-auto no-scrollbar grid place-items-center px-4 pb-6')} onClick={(e) => e.stopPropagation()}>
        <FeedPreview {...preview} dark={dark} index={i} onIndex={setI} width={width} large />
      </div>
    </div>
  )
}
