import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTime, useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { Avatar } from './ui'
import type { ChannelId } from '@/types'

export function Chat({ channel, className }: { channel: ChannelId; className?: string }) {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()
  const send = useSession((x) => x.sendMessage)
  const [draft, setDraft] = useState('')
  const list = s.messages.filter((m) => m.channel === channel).sort((a, b) => a.at.localeCompare(b.at))
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [list.length])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    const body = draft
    setDraft('')
    await send(channel, body)
  }

  return (
    <div className={cn('flex flex-col min-h-0 rounded-md border border-border bg-card', className)}>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-3 flex flex-col gap-2.5">
        {list.map((m) => {
          const u = s.users.find((x) => x.id === m.senderId)
          const mine = m.senderId === me?.id
          return (
            <div key={m.id} className={cn('flex items-end gap-2 max-w-[92%]', mine && 'self-end flex-row-reverse')}>
              {u && <Avatar name={u.name} color={u.color} size={24} />}
              <div>
                {!mine && <div className="text-[10px] font-semibold text-fg-muted mb-0.5">{u?.name}</div>}
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-[13px] leading-snug',
                    mine ? 'bg-fg text-bg rounded-ee-[3px]' : 'bg-muted-bg text-fg rounded-es-[3px]',
                  )}
                >
                  {m.body}
                </div>
                <div className={cn('text-[9.5px] text-fg-muted mt-0.5', mine && 'text-end')}>{fmtTime(m.at, lang)}</div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 p-2 border-t border-border">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('messagePh')}
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-[13px]"
        />
        <button
          type="submit"
          aria-label={t('send')}
          className="h-[34px] w-[34px] grid place-items-center rounded-md bg-fg text-bg cursor-pointer disabled:opacity-40"
          disabled={!draft.trim()}
        >
          <ArrowUp size={16} />
        </button>
      </form>
    </div>
  )
}
