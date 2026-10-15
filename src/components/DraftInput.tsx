import { useState, type InputHTMLAttributes } from 'react'

/**
 * Text input that edits a local draft and commits on blur / Enter.
 * Keeps per-keystroke writes away from the repository (and later from Supabase's
 * version check). While not focused it always shows the latest outside value.
 */
export function DraftInput({
  value,
  onCommit,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null) // null = not editing → mirror `value`
  const shown = draft ?? value
  const commit = () => {
    const v = (draft ?? value).trim()
    if (v && v !== value) onCommit(v)
    setDraft(null)
  }
  return (
    <input
      {...rest}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(null)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
