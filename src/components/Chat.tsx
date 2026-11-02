import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTime, useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { Avatar } from './ui'
import type { ChannelId } from '@/types'
import { chatDraft, senderOf, setChatDraft } from '@/lib/inbox'

export function Chat({ channel, className, readOnly }: { channel: ChannelId; className?: string; /** a deleted member's private chat: history only */ readOnly?: boolean }) {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()
  const send = useSession((x) => x.sendMessage)
  // unsent text per person + chat: never jumps into another chat, never shown to the next person on this browser
  const [draft, setDraftState] = useState(() => (me ? chatDraft(me.id, channel) : ''))
  const setDraft = (v: string | ((d: string) => string)) => setDraftState((d) => { const n = typeof v === 'function' ? v(d) : v; if (me) setChatDraft(me.id, channel, n); return n })
  const [sending, setSending] = useState(false)
  const list = s.messages.filter((m) => m.channel === channel).sort((a, b) => a.at.localeCompare(b.at))
  const endRef = useRef<HTMLDivElement>(null)

  const markRead = useSession((x) => x.markRead)
  const fetchChannel = useSession((x) => x.fetchChannel)
  // this chat's own newest page from the server (the start-up load is the newest messages of ALL chats)
  useEffect(() => { void fetchChannel(channel).catch(() => undefined) }, [channel, fetchChannel])
  // follow the conversation only when a NEW message arrives at the bottom (loading older ones keeps your place)
  const newestId = list.at(-1)?.id
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [newestId])
  // «read» = the newest message from someone else was really ON SCREEN (the chat's end visible, page visible) —
  // full test 2 Nov: a chat lower on the page used to count as read without being seen
  const newestOther = [...list].reverse().find((m) => m.senderId !== me?.id)?.id
  useEffect(() => {
    const el = endRef.current
    if (!newestOther || !el) return
    let seen = false
    const mark = () => { if (seen && document.visibilityState === 'visible') void markRead(newestOther) }
    const io = new IntersectionObserver((es) => { seen = es.some((x) => x.isIntersecting); mark() })
    io.observe(el)
    document.addEventListener('visibilitychange', mark)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', mark) }
  }, [newestOther, markRead])
  const [older, setOlder] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim() || sending) return
    const body = draft
    setSending(true)
    try {
      await send(channel, body)
      // a failed send keeps the text (2 Nov council); text typed while sending is never wiped
      setDraft((d) => (d === body ? '' : d))
    } catch {
      /* toast shown by the store */
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={cn('flex flex-col min-h-0 rounded-md border border-border bg-card', className)}>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-3 flex flex-col gap-2.5" data-testid="chat-list">
        {list.length >= 50 && (
          <button type="button" disabled={older} onClick={() => { setOlder(true); void fetchChannel(channel, list[0].at).finally(() => setOlder(false)) }} className="self-center text-[11.5px] font-semibold text-fg-secondary hover:text-fg cursor-pointer rounded-full border border-border px-3 py-1">
            {t('olderMessages')}
          </button>
        )}
        {list.map((m) => {
          const u = senderOf(s, m.senderId)
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
                  <span dir="auto">{m.body}</span>
                </div>
                <div className={cn('text-[9.5px] text-fg-muted mt-0.5', mine && 'text-end')}>{fmtTime(m.at, lang)}</div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {readOnly ? (
        <div className="p-3 border-t border-border text-[12px] text-fg-muted text-center" data-testid="chat-readonly">{t('chatReadOnly')}</div>
      ) : (
      <form onSubmit={submit} className="flex items-center gap-2 p-2 border-t border-border">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('messagePh')}
          maxLength={4000}
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-[13px]"
        />
        <button
          type="submit"
          aria-label={t('send')}
          className="h-[34px] w-[34px] grid place-items-center rounded-md bg-fg text-bg cursor-pointer disabled:opacity-40"
          disabled={!draft.trim() || sending}
        >
          <ArrowUp size={16} />
        </button>
      </form>
      )}
    </div>
  )
}
