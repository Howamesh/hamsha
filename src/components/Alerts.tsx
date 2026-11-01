import { useEffect } from 'react'
import { AlertTriangle, Clock, FileSignature, Megaphone } from 'lucide-react'
import { activityFeed, unreadActivity, type Activity } from '@/lib/activity'
import { cn } from '@/lib/utils'
import { alerts, visibleTasks } from '@/lib/derive'
import { fmtDate, fmtTime, useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'

export function useAlerts() {
  const s = useData()
  const user = useUser()
  const calId = useUi((u) => u.calId)
  if (!user) return []
  return alerts(s, visibleTasks(s, user, calId))
}

export function useActivity() {
  const s = useData()
  const user = useUser()
  return user ? activityFeed(s, user) : []
}
/** The bell's number: late/due tasks + activity nobody has looked at yet (1 Nov). */
export function useBellCount() {
  const user = useUser()
  const alertsN = useAlerts().length
  const feed = useActivity()
  const seen = useUi((u) => (user ? u.activitySeen[user.id] : undefined))
  return alertsN + (user ? unreadActivity(feed, user, seen) : 0)
}

const ACT_KEY: Record<Activity['kind'], string> = {
  c_created: 'actContractCreated', c_version: 'actContractVersion', c_first_signed: 'actContractFirstSigned', c_sent: 'actContractSent', c_withdrawn: 'actContractWithdrawn',
  c_opened: 'actContractOpened', c_signed: 'actContractSigned', c_changes: 'actContractChanges', c_rejected: 'actContractRejected', c_completed: 'actContractCompleted',
  c_received: 'actContractReceived', p_version: 'actPostVersion', p_sent: 'actPostSent', p_approved: 'actPostApproved', p_changes: 'actPostChanges', p_published: 'actPostPublished', p_received: 'actPostReceived',
}

/** «آخر النشاط»: what happened on contracts and social posts, newest first; tap → opens it. */
function ActivityList() {
  const { t, lang } = useStr()
  const user = useUser()
  const feed = useActivity()
  const seen = useUi((u) => (user ? u.activitySeen[user.id] : undefined))
  const markSeen = useUi((u) => u.markActivitySeen)
  const setWorkspace = useUi((u) => u.setWorkspace)
  const openContract = useUi((u) => u.openContract)
  const openPost = useUi((u) => u.openPost)
  // looking at the list = seen (after it rendered with the «new» dots)
  useEffect(() => {
    if (!user) return
    const id = setTimeout(() => markSeen(user.id), 1500)
    return () => clearTimeout(id)
  }, [user, markSeen, feed.length])
  if (!user || !feed.length) return null
  return (
    <div className="flex flex-col gap-1.5" data-testid="activity">
      <div className="text-[12px] font-semibold text-fg-secondary mt-2">{t('recentActivity')}</div>
      <div className="rounded-md border border-border bg-bg divide-y divide-border overflow-hidden">
        {feed.map((a) => {
          const fresh = !seen || a.at > seen
          return (
            <button key={a.id} type="button" data-testid="activity-item" data-kind={a.kind}
              onClick={() => {
                if (a.target.type === 'contract') { setWorkspace('contracts'); openContract(a.target.id) } else { setWorkspace('social'); openPost(a.target.id) }
              }}
              className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-start cursor-pointer hover:bg-muted-bg', fresh && 'bg-accent/5')}>
              {a.target.type === 'contract' ? <FileSignature size={14} className="shrink-0 text-fg-muted" /> : <Megaphone size={14} className="shrink-0 text-fg-muted" />}
              <span className="flex-1 min-w-0 flex flex-col">
                <span className={cn('text-[12.5px] leading-snug line-clamp-2', fresh && 'font-semibold')} dir="auto">{t(ACT_KEY[a.kind] as never, { title: a.title, n: a.n ?? '', who: a.who ?? t('someone') })}</span>
                {a.note && <span className="text-[11.5px] text-fg-secondary truncate" dir="auto">«{a.note}»</span>}
              </span>
              <span className="shrink-0 text-[10.5px] text-fg-muted tabular-nums">{fmtDate(a.at.slice(0, 10), lang, { day: 'numeric', month: 'short' })}<br />{fmtTime(a.at, lang)}</span>
              {fresh && <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-label={t('newBadge')} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AlertsList() {
  const { t, lang } = useStr()
  const list = useAlerts()
  const openTask = useUi((u) => u.openTask)
  const setFocus = useUi((u) => u.setFocus)
  if (!list.length) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-dashed border-fg-faint p-4 text-[13px] text-fg-secondary text-center">{t('allClearAlerts')}</div>
        <ActivityList />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {list.map((a) => (
        <button
          key={a.task.id}
          type="button"
          onClick={() => {
            setFocus(a.task.start)
            openTask(a.task.id)
          }}
          className={cn(
            'flex items-start gap-2.5 rounded-md border p-3 text-start cursor-pointer',
            a.kind === 'late' ? 'bg-danger-tint border-danger-dark/20 text-danger-dark' : 'bg-warning-tint border-warning-dark/20 text-warning-dark',
          )}
        >
          {a.kind === 'late' ? <AlertTriangle size={16} className="shrink-0 mt-0.5" /> : <Clock size={16} className="shrink-0 mt-0.5" />}
          <span className="text-[12.5px] font-semibold leading-snug">
            {t(a.kind === 'late' ? 'alertLate' : 'alertDue', { task: a.task.title, who: a.who?.name ?? '', date: fmtDate(a.date, lang) })}
          </span>
        </button>
      ))}
      <ActivityList />
    </div>
  )
}
