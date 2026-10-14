/** Small shadcn-flavoured primitives, styled with the design tokens. */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { cn, initials } from '@/lib/utils'

type Variant = 'primary' | 'outline' | 'ghost' | 'dark' | 'warning'
type Size = 'sm' | 'md' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border border-transparent',
  outline: 'bg-card text-fg-secondary border border-border hover:text-fg',
  ghost: 'bg-transparent text-fg-secondary hover:bg-muted-bg hover:text-fg border border-transparent',
  dark: 'bg-fg text-bg border border-transparent hover:opacity-90',
  warning: 'bg-warning text-[#09090B] border border-transparent hover:brightness-95',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-[34px] px-3.5 text-[13px]',
  icon: 'h-[34px] w-[34px] p-0',
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ className, variant = 'outline', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn('w-full rounded-md border border-border bg-bg px-4 py-[11px] text-[14px] text-fg', className)}
    {...props}
  />
))
Input.displayName = 'Input'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T
  options: Array<{ value: T; label: string; dot?: string }>
  onChange: (v: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('flex rounded-md bg-muted-bg p-[3px] gap-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 inline-flex items-center justify-center gap-1.5 rounded-md font-semibold cursor-pointer transition-colors',
            size === 'sm' ? 'px-2.5 py-1.5 text-[11.5px]' : 'px-3.5 py-1.5 text-[12.5px]',
            value === o.value ? 'bg-card text-fg shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-fg-secondary hover:text-fg',
          )}
        >
          {o.dot && <span className="w-[7px] h-[7px] rounded-full" style={{ background: o.dot }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ name, color, size = 28, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <div
      className={cn('grid place-items-center rounded-full font-semibold text-white shrink-0', className)}
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.38) }}
      title={name}
    >
      {initials(name)}
    </div>
  )
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('rounded-md bg-muted-bg px-2.5 py-1 text-[10.5px] font-bold tracking-[0.05em] text-fg-secondary whitespace-nowrap', className)}>
      {children}
    </span>
  )
}

export function Card({ children, className, dir }: { children?: React.ReactNode; className?: string; dir?: 'ltr' | 'rtl' }) {
  return (
    <div className={cn('rounded-md border border-border bg-card', className)} dir={dir}>
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-fg-secondary">{children}</div>
}

export function Bar({ pct, color, className }: { pct: number; color: string; className?: string }) {
  return (
    <div className={cn('h-[6px] w-full rounded-full bg-muted-bg overflow-hidden', className)}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function Logo({ size = 42 }: { size?: number }) {
  const s = size / 42
  return (
    <div className="grid place-items-center rounded-lg bg-[#09090B]" style={{ width: size, height: size }}>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `${10 * s}px ${10 * s}px` }}>
        <div className="rounded-[4px] bg-[#F7C948]" style={{ width: 10 * s, height: 14 * s }} />
        <div className="rounded-[4px] bg-[#5AB0AA] self-end" style={{ width: 10 * s, height: 9 * s }} />
      </div>
    </div>
  )
}
