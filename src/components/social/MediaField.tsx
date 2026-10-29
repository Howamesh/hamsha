import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { useMediaUrls, useObjectUrl } from '@/lib/useMedia'
import type { MediaItem } from '@/types'
import { SectionTitle } from '../ui'

const MAX_BYTES = 10 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Thumbnail of one item: a picked File (object URL) or a kept storage path (resolved URL). */
function Thumb({ item, url, dark }: { item: MediaItem; url: string | null; dark?: boolean }) {
  const own = useObjectUrl(item instanceof File ? item : null)
  const src = item instanceof File ? own : url
  return src ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} /> : <div className={cn('w-full h-full', dark ? 'bg-white/10' : 'bg-muted-bg')} />
}

/**
 * Ordered media picker shared by «منشور جديد» and «نسخة جديدة»: several images (a carousel), the first is
 * the cover, arrows reorder, × removes. Kept paths from the previous version sit next to new files.
 */
export function MediaField({ items, onChange, max }: { items: MediaItem[]; onChange: (items: MediaItem[]) => void; max: number }) {
  const { t } = useStr()
  const [err, setErr] = useState<string | null>(null)
  const kept = useMemo(() => items.map((m) => (m instanceof File ? '' : m.path)), [items])
  const keptUrls = useMediaUrls(useMemo(() => kept.filter(Boolean), [kept]))
  const urlOf = (k: number) => {
    const path = kept[k]
    if (!path) return null
    const idx = kept.filter(Boolean).indexOf(path)
    return keptUrls[idx] ?? null
  }
  const move = (k: number, d: -1 | 1) => {
    const j = k + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[k], next[j]] = [next[j], next[k]]
    onChange(next)
  }
  const add = (files: FileList | null) => {
    if (!files) return
    const picked = [...files]
    if (picked.some((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES)) {
      setErr(t('imageOnly'))
      return
    }
    if (items.length + picked.length > max) {
      setErr(t('mediaTooMany', { n: max }))
      return
    }
    setErr(null)
    onChange([...items, ...picked])
  }
  return (
    <div className="flex flex-col gap-1.5">
      <SectionTitle>{t('mediaLabel')}</SectionTitle>
      <div className="flex flex-wrap gap-2 -mt-1" data-testid="media-list">
        {items.map((m, k) => (
          <div key={k} className="relative w-[84px] h-[84px] rounded-md overflow-hidden border border-border bg-bg group" data-testid="media-item" data-kept={m instanceof File ? '0' : '1'}>
            <Thumb item={m} url={urlOf(k)} />
            {k === 0 && <span className="absolute bottom-1 start-1 text-[9.5px] font-bold rounded px-1 py-0.5 bg-black/65 text-white">{t('mediaCover')}</span>}
            {!(m instanceof File) && <span className="absolute top-1 start-1 text-[9px] rounded px-1 py-0.5 bg-black/55 text-white" title={t('mediaKept')}>↺</span>}
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== k))} aria-label={t('mediaRemove')} className="absolute top-1 end-1 w-5 h-5 rounded-full bg-black/65 text-white grid place-items-center cursor-pointer">
              <X size={12} />
            </button>
            {items.length > 1 && (
              <div className="absolute bottom-1 end-1 flex gap-0.5" dir="ltr">
                <button type="button" onClick={() => move(k, -1)} disabled={k === 0} aria-label={t('mediaEarlier')} className="w-5 h-5 rounded bg-black/65 text-white grid place-items-center cursor-pointer disabled:opacity-30">
                  <ChevronLeft size={12} />
                </button>
                <button type="button" onClick={() => move(k, 1)} disabled={k === items.length - 1} aria-label={t('mediaLater')} className="w-5 h-5 rounded bg-black/65 text-white grid place-items-center cursor-pointer disabled:opacity-30">
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
        {items.length < max && (
          <label className={cn('w-[84px] h-[84px] rounded-md border border-dashed grid place-items-center cursor-pointer text-[11px] text-center leading-tight gap-1', items.length ? 'border-fg-faint text-fg-secondary hover:border-fg' : 'border-fg-faint text-fg-secondary hover:border-fg')}>
            <ImagePlus size={18} />
            <span className="px-1">{items.length ? t('addImages') : t('pickImage')}</span>
            <input type="file" accept={TYPES.join(',')} multiple data-testid="post-image" className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
          </label>
        )}
      </div>
      <span className={cn('text-[11px]', err ? 'text-accent font-semibold' : 'text-fg-muted')}>{err ?? t('mediaHint', { n: max })}</span>
    </div>
  )
}
