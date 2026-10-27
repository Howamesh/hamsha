import { useState } from 'react'
import { Bell, ChevronDown, MessageCircle, PieChart, Settings, SlidersHorizontal, Trash2, UserPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clientProgress, isDone, taskProgress, urgency, workload } from '@/lib/derive'
import { fmtDate, useStr } from '@/lib/useStr'
import { clock12FromHHMM } from '@/lib/dates'
import { useData, useSession } from '@/store/session'
import { useUi, type PanelTab } from '@/store/ui'
import { Avatar, Bar, Button, Card, Input, SectionTitle, Segmented } from '../ui'
import { Chat } from '../Chat'
import { AlertsList, useAlerts } from '../Alerts'
import { SettingsPanel } from '../Settings'
import { InviteDialog } from '../InviteDialog'
import { BrandTile } from '../BrandTile'
import { PanelTabs } from './PanelTabs'

export function AdminPanel() {
  const { t } = useStr()
  const s = useData()
  const ui = useUi()
  const calId = ui.calId
  const client = calId ? s.clients.find((c) => c.id === calId) : null
  const alertCount = useAlerts().length
  const tabs: Array<{ id: PanelTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'main', label: client ? t('tabSetup') : t('tabClients'), icon: client ? <SlidersHorizontal size={16} /> : <PieChart size={16} /> },
    { id: 'messages', label: t('tabMessages'), icon: <MessageCircle size={16} /> },
    { id: 'alerts', label: t('tabAlerts'), icon: <Bell size={16} />, badge: alertCount },
    { id: 'settings', label: t('tabSettings'), icon: <Settings size={16} /> },
  ]

  return (
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="text-[17px] font-semibold tracking-[-0.01em]">{client ? t('panelSetup') : t('panelMaster')}</div>
        <Button size="icon" variant="ghost" onClick={() => ui.togglePanel(false)} aria-label={t('hidePanel')}>
          <X size={16} />
        </Button>
      </div>
      <PanelTabs tabs={tabs} />
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-5 pt-3 flex flex-col gap-4">
        {ui.panelTab === 'main' && (client ? <ClientSetup clientId={client.id} /> : <Master />)}
        {ui.panelTab === 'messages' && <Chat channel={client ? `client:${client.id}` : 'team'} className="flex-1 min-h-[320px]" />}
        {ui.panelTab === 'alerts' && <AlertsList />}
        {ui.panelTab === 'settings' && <SettingsPanel />}
      </div>
    </>
  )
}

function Kpi({ n, label, tone }: { n: string | number; label: string; tone: 'green' | 'blue' | 'teal' | 'red' }) {
  const tones = {
    green: 'bg-success-tint text-success-dark',
    blue: 'bg-info-tint text-info',
    teal: 'bg-[#DDF3F1] text-[#1F6E69] dark:bg-[#0f2a28]',
    red: 'bg-danger-tint text-danger-dark',
  }
  return (
    <div className={cn('rounded-md p-3.5', tones[tone])}>
      <div className="text-[22px] font-bold leading-none tabular-nums">{n}</div>
      <div className="text-[11.5px] font-semibold mt-1.5 opacity-90">{label}</div>
    </div>
  )
}

function Master() {
  const { t, lang } = useStr()
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [openClient, setOpenClient] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const s = useData()
  const ui = useUi()
  const createClient = useSession((x) => x.createClient)
  const [name, setName] = useState('')
  const open = s.tasks.filter((x) => !isDone(s, x))
  const delivered = s.tasks.length ? Math.round(((s.tasks.length - open.length) / s.tasks.length) * 100) : 0
  const overdue = s.tasks.filter((x) => urgency(s, x) === 'late').length
  const wl = workload(s)
  const max = Math.max(1, ...wl.map((w) => w.open))

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <Kpi n={s.clients.length} label={t('activeClients')} tone="teal" />
        <Kpi n={open.length} label={t('tasksInFlight')} tone="blue" />
        <Kpi n={`${delivered}%`} label={t('delivered')} tone="green" />
        <Kpi n={overdue} label={t('overdue')} tone="red" />
      </div>

      <SectionTitle>{t('clientProgress')}</SectionTitle>
      <div className="flex flex-col gap-2 -mt-2">
        {s.clients.map((c) => {
          const p = clientProgress(s, c)
          const owner = s.users.find((u) => u.id === c.ownerId)
          const expanded = openClient === c.id
          const projects = s.projects.filter((x) => x.clientId === c.id)
          const upcoming = s.tasks
            .filter((x) => x.clientId === c.id && !isDone(s, x))
            .sort((a, b) => a.end.localeCompare(b.end))
            .slice(0, 5)
          return (
            <Card key={c.id} className={cn('p-3 transition-colors', expanded && 'border-fg-faint')}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => ui.setCalId(c.id)} className="flex items-center gap-2 min-w-0 flex-1 text-start cursor-pointer hover:opacity-80" title={t('openClientCalendar')}>
                  <BrandTile client={c} size={22} />
                  <span className="text-[13.5px] font-semibold truncate">{c.name}</span>
                </button>
                <span className="text-[13px] font-bold tabular-nums">{p.pct}%</span>
                <button
                  type="button"
                  onClick={() => setOpenClient(expanded ? null : c.id)}
                  className="w-6 h-6 grid place-items-center rounded-md text-fg-secondary hover:bg-muted-bg hover:text-fg cursor-pointer"
                  aria-label={t('expand')}
                >
                  <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
                </button>
              </div>
              <Bar pct={p.pct} color={c.color} className="mt-2" />
              <div className="text-[11.5px] text-fg-secondary mt-1.5">
                {p.tasks} {t('tasks')} · {p.projects} {t('projects')} · {t('owner')} {owner?.name}
              </div>
              {expanded && (
                <div className="mt-3 flex flex-col gap-2 anim-fade">
                  <div className="flex flex-wrap gap-1.5">
                    {projects.map((pr) => {
                      const ts = s.tasks.filter((x) => x.projectId === pr.id)
                      const pct = ts.length ? Math.round((ts.filter((x) => isDone(s, x)).length / ts.length) * 100) : 0
                      return (
                        <span key={pr.id} className="inline-flex items-center gap-1.5 rounded-md bg-muted-bg px-2 py-1 text-[11px] font-semibold">
                          <span className="w-[7px] h-[7px] rounded-sm" style={{ background: pr.color }} />
                          {pr.name} · {pct}%
                        </span>
                      )
                    })}
                  </div>
                  {upcoming.length === 0 ? (
                    <div className="text-[11.5px] text-fg-muted">{t('noOpenTasks')}</div>
                  ) : (
                    upcoming.map((task) => {
                      const tp = taskProgress(s, task)
                      const u = urgency(s, task)
                      const who = s.users.find((x) => x.id === task.ownerId)
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => {
                            ui.setFocus(task.start)
                            ui.openTask(task.id)
                          }}
                          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-start cursor-pointer hover:border-fg-faint"
                        >
                          <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: u === 'late' ? 'var(--accent)' : u === 'soon' ? 'var(--warning)' : 'var(--fg-faint)' }} />
                          <div className="min-w-0 flex-1">
                            <div dir="auto" className="text-[12px] font-semibold truncate">
                              {task.title}
                            </div>
                            <div className="text-[10.5px] text-fg-secondary truncate">
                              {who?.name} · {tp.done}/{tp.total}
                            </div>
                          </div>
                          <span className="text-[10.5px] font-semibold text-fg-muted whitespace-nowrap" dir="ltr">
                            {fmtDate(task.end, lang, { day: 'numeric', month: 'short' })}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          void createClient(name.trim(), t('generalProject'))
          setName('')
        }}
        className="flex gap-2"
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('newClientPh')} className="py-2" />
        <Button type="submit" variant="primary" className="px-4" disabled={!name.trim()}>
          {t('create')}
        </Button>
      </form>

      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{t('teamWorkload')}</SectionTitle>
        <Button size="sm" onClick={() => setInviting(true)} className="-my-1">
          <UserPlus size={14} /> {t('inviteMember')}
        </Button>
      </div>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      <div className="flex flex-col gap-1.5 -mt-2">
        {wl.map(({ user, open }) => {
          const expanded = openUser === user.id
          const parts = s.parts
            .filter((p) => p.assigneeId === user.id && !p.done)
            .sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? ''))
          return (
            <div key={user.id} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setOpenUser(expanded ? null : user.id)}
                className={cn('flex items-center gap-2.5 rounded-md px-1.5 py-1.5 -mx-1.5 cursor-pointer hover:bg-muted-bg text-start', expanded && 'bg-muted-bg')}
                title={user.name}
              >
                <Avatar name={user.name} color={user.color} size={24} />
                <div className="flex-1 min-w-0">
                  {expanded && <div className="text-[11.5px] font-semibold truncate mb-1">{user.name}</div>}
                  <Bar pct={(open / max) * 100} color={user.color} />
                </div>
                <span className="text-[12px] font-semibold tabular-nums w-5 text-end">{open}</span>
              </button>
              {expanded && (
                <div className="flex flex-col gap-1 ps-8 pb-1">
                  {parts.map((p) => {
                    const task = s.tasks.find((x) => x.id === p.taskId)
                    const client = task && s.clients.find((c) => c.id === task.clientId)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (task) {
                            ui.setFocus(p.day)
                            ui.openTask(task.id)
                          }
                        }}
                        className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-start cursor-pointer hover:border-fg-faint"
                        style={{ borderInlineStartColor: client?.color, borderInlineStartWidth: 3 }}
                      >
                        <div className="min-w-0 flex-1">
                          <div dir="auto" className="text-[12px] font-semibold truncate">
                            {p.label}
                          </div>
                          <div dir="auto" className="text-[10.5px] text-fg-secondary truncate">
                            {client?.name} · {task?.title}
                          </div>
                        </div>
                        <span className="text-[10.5px] font-semibold text-fg-muted tabular-nums whitespace-nowrap" dir="ltr">
                          {fmtDate(p.day, lang, { day: 'numeric', month: 'short' })}
                          {p.time ? ` · ${clock12FromHHMM(p.time, lang)}` : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function ClientSetup({ clientId }: { clientId: string }) {
  const { t } = useStr()
  const s = useData()
  const ui = useUi()
  const sess = useSession()
  const c = s.clients.find((x) => x.id === clientId)!
  const projects = s.projects.filter((p) => p.clientId === clientId)
  const team = s.users.filter((u) => u.role !== 'client')
  const owner = s.users.find((u) => u.id === c.ownerId)
  const [newProject, setNewProject] = useState('')
  const contractOpts: Array<{ value: typeof c.contract; label: string }> = [
    { value: 'draft', label: t('contractDraft') },
    { value: 'sent', label: t('contractSent') },
    { value: 'signed', label: t('contractSigned') },
  ]
  return (
    <>
      <Button size="sm" onClick={() => ui.setCalId(null)} className="self-start -mb-1">
        {t('txt')} {t('allClients')}
      </Button>
      <SectionTitle>{t('calendarName')}</SectionTitle>
      <Input
        key={c.id}
        defaultValue={c.name}
        dir="auto"
        onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void sess.updateClient(c.id, { name: e.target.value.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="-mt-2 py-2.5"
      />
      <div className="-mt-2 text-[11.5px] text-fg-muted">{t('howToAddTasks')}</div>

      <SectionTitle>
        {t('projectOwner')} · {owner?.name}
      </SectionTitle>
      <div className="flex flex-wrap gap-2 -mt-2">
        {team.map((u) => (
          <button key={u.id} type="button" title={u.name} onClick={() => void sess.updateClient(c.id, { ownerId: u.id })} className="cursor-pointer">
            <Avatar name={u.name} color={u.color} size={32} className={cn('transition-opacity', u.id === c.ownerId ? 'ring-2 ring-fg ring-offset-2 ring-offset-card' : 'opacity-50 hover:opacity-90')} />
          </button>
        ))}
      </div>

      <SectionTitle>{t('runsFromTo')}</SectionTitle>
      <div className="grid grid-cols-2 gap-2 -mt-2" dir="ltr">
        <Input type="date" value={c.start} onChange={(e) => e.target.value && void sess.updateClient(c.id, { start: e.target.value, end: e.target.value > c.end ? e.target.value : c.end })} className="py-2 text-[13px]" />
        <Input type="date" value={c.end} min={c.start} onChange={(e) => e.target.value && void sess.updateClient(c.id, { end: e.target.value < c.start ? c.start : e.target.value })} className="py-2 text-[13px]" />
      </div>

      <SectionTitle>{t('projectsInside')}</SectionTitle>
      <div className="flex flex-col gap-2 -mt-2">
        {projects.map((p) => {
          const tasks = s.tasks.filter((x) => x.projectId === p.id)
          const pct = tasks.length ? Math.round((tasks.filter((x) => isDone(s, x)).length / tasks.length) * 100) : 0
          return (
            <Card key={p.id} className="p-3 flex items-center gap-2.5">
              <span className="w-[9px] h-[9px] rounded-sm shrink-0" style={{ background: p.color }} />
              <div className="min-w-0 flex-1">
                <input
                  defaultValue={p.name}
                  dir="auto"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && void sess.updateProject(p.id, { name: e.target.value.trim() })}
                  className="w-full bg-transparent text-[13px] font-semibold outline-none"
                />
                <div className="text-[11px] text-fg-secondary flex items-center gap-1">
                  {t('lead')} ·
                  <select value={p.leadId} onChange={(e) => void sess.updateProject(p.id, { leadId: e.target.value })} className="bg-transparent text-[11px] font-semibold outline-none cursor-pointer">
                    {team.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  · {pct}%
                </div>
              </div>
              <button
                type="button"
                onClick={() => confirm(t('confirmDeleteProject')) && void sess.deleteProject(p.id)}
                className="text-fg-muted hover:text-accent cursor-pointer"
                aria-label={t('remove')}
              >
                <X size={14} />
              </button>
            </Card>
          )
        })}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!newProject.trim()) return
            const palette = ['#D9B600', '#9B7BF2', '#4CB782', '#F06FA7', '#4E9BFA', '#F2994A']
            void sess.createProject({ clientId: c.id, name: newProject.trim(), leadId: c.ownerId, color: palette[projects.length % palette.length] })
            setNewProject('')
          }}
          className="flex gap-2"
        >
          <Input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder={t('newProjectPh')} dir="auto" className="py-2" />
          <Button type="submit" variant="dark" disabled={!newProject.trim()}>
            {t('add')}
          </Button>
        </form>
      </div>

      <SectionTitle>{t('clientAccount')}</SectionTitle>
      <Card className="p-3 -mt-2 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-fg-secondary">{t('clientAccountHint')}</span>
        <select
          value={s.users.find((u) => u.role === 'client' && u.clientId === c.id)?.id ?? ''}
          onChange={(e) => {
            const prev = s.users.find((u) => u.role === 'client' && u.clientId === c.id)
            if (prev && prev.id !== e.target.value) void sess.updateUser(prev.id, { clientId: undefined })
            if (e.target.value) void sess.updateUser(e.target.value, { clientId: c.id })
          }}
          className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12.5px] font-semibold max-w-[170px]"
        >
          <option value="">—</option>
          {s.users
            .filter((u) => u.role === 'client' && (!u.clientId || u.clientId === c.id))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.email}
              </option>
            ))}
        </select>
      </Card>

      <SectionTitle>{t('contract')}</SectionTitle>
      <Card className="p-3 -mt-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">{t('contract')}</span>
        <Segmented size="sm" value={c.contract} options={contractOpts} onChange={(v) => void sess.updateClient(c.id, { contract: v })} className="min-w-[200px]" />
      </Card>

      <Button
        variant="ghost"
        size="sm"
        className="self-start text-accent hover:text-accent mt-2"
        onClick={() => {
          if (confirm(t('confirmDeleteClient'))) {
            void sess.deleteClient(c.id)
            ui.setCalId(null)
          }
        }}
      >
        <Trash2 size={14} /> {t('deleteClient')}
      </Button>
    </>
  )
}
