import { cn, initials } from '@/lib/utils'
import type { Client } from '@/types'

/** Client brand mark: the real logo when we have one, otherwise a coloured initial. */
export function BrandTile({ client, size = 16, className }: { client?: Client; size?: number; className?: string }) {
  const radius = Math.max(3, Math.round(size * 0.25))
  if (client?.logo) {
    return (
      <span
        className={cn('grid place-items-center overflow-hidden bg-card shrink-0', className)}
        style={{ width: size, height: size, borderRadius: radius }}
        title={client.name}
      >
        <img src={client.logo} alt={client.name} className="w-full h-full object-cover" draggable={false} />
      </span>
    )
  }
  return (
    <span
      className={cn('grid place-items-center font-bold text-white shrink-0', className)}
      style={{ width: size, height: size, borderRadius: radius, background: client?.color ?? '#D9B600', fontSize: Math.round(size * 0.55) }}
      title={client?.name}
    >
      {initials(client?.name ?? '?', 1)}
    </span>
  )
}
