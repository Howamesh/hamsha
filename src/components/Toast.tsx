import { useEffect } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUi } from '@/store/ui'

/** Bottom toast for errors raised by actions (events/async never reach the ErrorBoundary). */
export function Toast() {
  const toast = useUi((s) => s.toast)
  const kind = useUi((s) => s.toastKind)
  const setToast = useUi((s) => s.setToast)
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(id)
  }, [toast, setToast])
  if (!toast) return null
  return (
    <div role="alert" className="fixed bottom-[70px] lg:bottom-5 inset-x-0 z-[90] flex justify-center px-4 pointer-events-none">
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-[13px] font-semibold shadow-[0_12px_32px_rgba(0,0,0,0.14)] anim-sheet max-w-[520px]',
          kind === 'error' ? 'border-danger-dark/20 bg-danger-tint text-danger-dark' : 'border-info/20 bg-info-tint text-info',
        )}
      >
        {kind === 'error' ? <AlertTriangle size={16} className="shrink-0" /> : <Info size={16} className="shrink-0" />}
        <span>{toast}</span>
        <button type="button" onClick={() => setToast(null)} className="ms-1 cursor-pointer opacity-70 hover:opacity-100" aria-label="×">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
