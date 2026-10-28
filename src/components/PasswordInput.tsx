import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { Input } from './ui'

/**
 * Password field with the «eye» toggle (Yousef, 2026-10-28): the person chooses whether to see what they
 * typed. Used everywhere Hamsha asks for a password (login, welcome/reset). Starts hidden.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(({ className, ...props }, ref) => {
  const { t } = useStr()
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input ref={ref} type={shown ? 'text' : 'password'} dir="ltr" className={cn('pe-11', className)} {...props} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t('hidePassword') : t('showPassword')}
        aria-pressed={shown}
        title={shown ? t('hidePassword') : t('showPassword')}
        tabIndex={-1}
        className="absolute inset-y-0 end-0 flex items-center px-3 text-fg-secondary hover:text-fg cursor-pointer"
      >
        {shown ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'
