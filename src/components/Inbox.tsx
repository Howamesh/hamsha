import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, fmtTime, useStr } from '@/lib/useStr'
import { conversations, senderOf } from '@/lib/inbox'
import { toIso, todayIso } from '@/lib/dates'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { Avatar, Logo } from './ui'
import { Chat } from './Chat'
import type { ChannelId } from '@/types'

/**
 * «الرسائل» (2 Nov, his pick ⭐٥ + «المبدعين يتواصلوا مع بعض… ومع عميل لو أعطيته صلاحية»): a fixed list of chats —
 * the team group, a private chat with each team member, and the clients this person may talk to — newest first,
 * each with its unread number (from the server). Tap → that chat alone, with «رجوع».
 */
export function Inbox() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const ui = useUi()
  const list = conversations(s, me, t('inboxTeam'), t('deletedMember'))
  const open = ui.chatChannel ? list.find((c) => c.channel === ui.chatChannel) : undefined
  const [more, setMore] = useState(false)
  if (open) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-2" data-testid="chat-open" data-channel={open.channel}>
        <button type="button" onClick={() => ui.openChat(null)} className="self-start inline-flex items-center gap-1 text-[12.5px] font-semibold text-fg-secondary hover:text-fg cursor-pointer" data-testid="chat-back">
          {lang === 'ar' ? <ChevronRight size={15} /> : <ChevronLeft size={15} />} {t('backToInbox')}
        </button>
        <div className="flex items-center gap-2">
          {open.kind === 'team' ? <Logo size={26} /> : <Avatar name={open.title} color={open.color} size={26} />}
          <div className="text-[15px] font-semibold truncate"><bdi>{open.title}</bdi></div>
        </div>
        <Chat key={open.channel} channel={open.channel as ChannelId} readOnly={open.readOnly} className="flex-1 min-h-[260px]" />
      </div>
    )
  }
  // full test 2 Nov: a creative saw 11 empty rows — quiet private chats fold under «محادثة جديدة» until opened
  const shown = list.filter((c) => c.row || c.kind !== 'dm')
  const quiet = list.filter((c) => !c.row && c.kind === 'dm')
  return (
    <div className="flex flex-col gap-1" data-testid="inbox">
      {[...shown, ...(more ? quiet : [])].map((c) => {
        const r = c.row
        const who = r?.lastSender === me.id ? t('inboxYou') : c.kind !== 'dm' ? senderOf(s, r?.lastSender ?? null)?.name : undefined
        // the message's LOCAL day (lastAt is UTC — full test 2 Nov: today's late-evening message showed yesterday's date)
        const day = r?.lastAt ? toIso(new Date(r.lastAt)) : ''
        const today = !!r?.lastAt && day === todayIso()
        return (
          <button key={c.channel} type="button" onClick={() => ui.openChat(c.channel)} data-testid="inbox-row" data-channel={c.channel} data-unread={r?.unread ?? 0}
            className={cn('flex items-center gap-2.5 rounded-md px-2 py-2 text-start cursor-pointer hover:bg-muted-bg', !!r?.unread && 'bg-accent/5')}>
            {c.kind === 'team' ? <Logo size={32} /> : <Avatar name={c.title} color={c.color} size={32} />}
            <span className="flex-1 min-w-0 flex flex-col">
              {/* <bdi>: an English name keeps the row's (Arabic) alignment instead of jumping to the other side */}
              <span className={cn('text-[13.5px] truncate', r?.unread ? 'font-bold' : 'font-semibold')}><bdi>{c.title}</bdi></span>
              <span className={cn('text-[12px] truncate', r?.unread ? 'text-fg font-semibold' : 'text-fg-secondary')}>
                {r?.lastAt ? <>{who && <><bdi>{who}</bdi>: </>}<bdi>{r.lastBody}</bdi></> : t('inboxEmpty')}
              </span>
            </span>
            <span className="shrink-0 flex flex-col items-center gap-1">
              {r?.lastAt && <span className="text-[10.5px] text-fg-muted tabular-nums">{today ? fmtTime(r.lastAt, lang) : fmtDate(day, lang, { day: 'numeric', month: 'short' })}</span>}
              {!!r?.unread && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-fg text-[10.5px] font-bold grid place-items-center" data-testid="inbox-unread">{r.unread}</span>}
            </span>
          </button>
        )
      })}
      {quiet.length > 0 && (
        <button type="button" onClick={() => setMore((m) => !m)} className="self-start mt-1 text-[12.5px] font-semibold text-fg-secondary hover:text-fg cursor-pointer rounded-full border border-border px-3 py-1" data-testid="inbox-more">
          {more ? t('inboxLess') : t('inboxMore', { n: quiet.length })}
        </button>
      )}
    </div>
  )
}
