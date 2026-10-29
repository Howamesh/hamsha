import { useEffect, useRef, useState } from 'react'
import { Eraser, ImagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { Button } from '../ui'

const MAX_UPLOAD = 300 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Draw a signature with a finger / mouse, or upload a picture of it. Emits a PNG data URL (transparent
 * background) or null when empty. Kept deliberately small: the data URL is stored in the contract version.
 */
export function SignaturePad({ value, onChange, height = 160 }: { value: string | null; onChange: (dataUrl: string | null) => void; height?: number }) {
  const { t } = useStr()
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [uploaded, setUploaded] = useState<string | null>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    c.width = c.clientWidth * ratio
    c.height = height * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1d2a6b'
  }, [height, uploaded])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = ref.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (uploaded) return
    drawing.current = true
    ref.current!.setPointerCapture(e.pointerId)
    const ctx = ref.current!.getContext('2d')!
    const [x, y] = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = ref.current!.getContext('2d')!
    const [x, y] = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!dirty) setDirty(true)
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    const url = ref.current!.toDataURL('image/png')
    onChange(url)
  }
  const clear = () => {
    const c = ref.current
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setDirty(false)
    setUploaded(null)   // the canvas comes back and is re-initialised by the effect below
    onChange(null)
  }
  const upload = (f: File | null) => {
    if (!f || !TYPES.includes(f.type) || f.size > MAX_UPLOAD) return
    const img = new Image()
    const url = URL.createObjectURL(f)
    img.onload = () => {
      // normalise to a PNG data URL at the pad's size (keeps the stored signature small + uniform)
      const c = document.createElement('canvas')
      const w = 600
      const h = Math.round((img.height / img.width) * w)
      c.width = w
      c.height = Math.min(h, 300)
      c.getContext('2d')!.drawImage(img, 0, 0, w, c.height)
      const out = c.toDataURL('image/png')
      URL.revokeObjectURL(url)
      setUploaded(out)
      setDirty(true)
      onChange(out)
    }
    img.src = url
  }

  return (
    <div className="flex flex-col gap-2" data-testid="signature-pad">
      <div className={cn('relative rounded-md border border-dashed bg-white overflow-hidden', dirty ? 'border-fg' : 'border-fg-faint')} style={{ height }}>
        {uploaded ? (
          <img src={uploaded} alt="" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
        ) : (
          <canvas ref={ref} className="absolute inset-0 w-full h-full touch-none cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} data-testid="signature-canvas" />
        )}
        {!dirty && <span className="absolute inset-0 grid place-items-center text-[12px] text-fg-muted pointer-events-none">{t('drawSignature')}</span>}
        <span className="absolute bottom-2 inset-x-4 border-b border-fg-faint pointer-events-none" />
      </div>
      <div className="flex gap-2 items-center">
        <Button type="button" size="sm" onClick={clear} disabled={!dirty}>
          <Eraser size={14} /> {t('clearSignature')}
        </Button>
        <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold cursor-pointer rounded-md border border-border px-3 py-1.5 hover:border-fg-faint">
          <ImagePlus size={14} /> {t('uploadSignature')}
          <input type="file" accept={TYPES.join(',')} className="sr-only" data-testid="signature-upload" onChange={(e) => { upload(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </label>
        <span className="text-[11px] text-fg-muted ms-auto">{value ? '✓' : ''}</span>
      </div>
    </div>
  )
}
