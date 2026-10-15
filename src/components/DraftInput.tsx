import { useRef, useState, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import { useUi } from '@/store/ui'

/**
 * Text input that edits a local draft and commits on blur / Enter, cancels on Escape.
 * Keeps per-keystroke writes away from the repository (and later from Supabase's
 * version check). While not focused it always mirrors the outside `value`.
 * If `onCommit` throws or rejects, the draft stays and a translated error shows under the field.
 */
export function DraftInput({
  value,
  onCommit,
  allowEmpty = false,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: string
  onCommit: (v: string) => void | Promise<void>
  allowEmpty?: boolean
}) {
  const lang = useUi((s) => s.lang)
  const [draft, setDraft] = useState<string | null>(null) // null = not editing → mirror `value`
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false) // set by Escape so the blur that follows does not save
  const shown = draft ?? value

  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(null)
      setError(null)
      return
    }
    const v = (draft ?? value).trim()
    if (v === value || (!v && !allowEmpty)) {
      setDraft(null)
      setError(null)
      return
    }
    try {
      await onCommit(v)
      setDraft(null)
      setError(null)
    } catch (e) {
      setError(errorMessage(e, lang)) // keep the draft so nothing typed is lost
    }
  }

  return (
    <div className="flex flex-col min-w-0 flex-1">
      <input
        {...rest}
        value={shown}
        aria-invalid={!!error}
        className={cn(className, error && 'text-accent')}
        onChange={(e) => {
          setDraft(e.target.value)
          if (error) setError(null)
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {error && (
        <div role="alert" className="text-[11px] font-semibold text-accent mt-0.5">
          {error}
        </div>
      )}
    </div>
  )
}
