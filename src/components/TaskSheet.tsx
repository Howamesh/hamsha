import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addIso } from '@/lib/dates'
import { clientById, dueDate, partsOf, progressOf, projectById, userById, visibleTasks } from '@/lib/derive'
import { fmtDate, useNarrow, useNow, useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { TASK_TYPES, type TaskType } from '@/types'
import { Avatar, Button, Input, SectionTitle } from './ui'
import { DraftInput } from './DraftInput'

/** Soft limit: a member's open parts on one day beyond this show a warning (never blocks saving). */
const DAY_HOURS_LIMIT = 8

export function TaskSheet() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()
  const ui = useUi()
  const narrow = useNarrow()
  const now = useNow(1000)
  const sess = useSession()
  const task = s.tasks.find((x) => x.id === ui.taskId)
  const visible = task && me ? visibleTasks(s, me, null).some((x) => x.id === task.id) : false
  const [newPart, setNewPart] = useState('')
  if (!task || !me || !visible) return null

  const admin = me.role === 'admin'
  const client = clientById(s, task.clientId)
  const project = projectById(s, task.projectId)
  const parts = partsOf(s, task.id)
  const pr = progressOf(parts)
  const owner = userById(s, task.ownerId)
  const due = new Date(dueDate(task) + 'T18:00:00')
  const ms = due.getTime() - now.getTime()
  const h = Math.floor(Math.abs(ms) / 36e5)
  const mm = Math.floor((Math.abs(ms) % 36e5) / 6e4)
  const countdown = lang === 'ar' ? `${Math.floor(h / 24)}ي ${h % 24}س ${mm}د` : `${Math.floor(h / 24)}d ${h % 24}h ${mm}m`
  const cdTone = pr.total && pr.done === pr.total ? 'bg-success-tint text-success-dark' : ms < 0 ? 'bg-danger-tint text-danger-dark' : ms < 864e5 ? 'bg-warning-tint text-warning-dark' : 'bg-success-tint text-success-dark'
  const isClient = me.role === 'client'
  const canToggle = (assigneeId: string) => !isClient && (admin || assigneeId === me.id)
  const color = client?.color ?? '#D9B600'
  const approval = { draft: { en: 'Draft', ar: 'مسودة' }, pending: { en: 'Pending', ar: 'بانتظار الاعتماد' }, approved: { en: 'Approved', ar: 'معتمد' } }

  return (
    <div
      className={cn(
        'fixed z-[70] bg-card border border-border rounded-md shadow-[0_24px_60px_rgba(0,0,0,0.18)] flex flex-col anim-sheet overflow-hidden',
        narrow ? 'inset-x-0 bottom-0 top-[8%] rounded-b-none' : 'bottom-[10px] inset-x-[10px] max-h-[78vh]',
      )}
      style={!narrow && ui.panelOpen ? { [lang === 'ar' ? 'right' : 'left']: 'calc(var(--panel-w) + 20px)' } : undefined}
      role="dialog"
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <span className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: color }} />
        <DraftInput
          key={task.id}
          value={task.title}
          readOnly={!admin}
          dir="auto"
          onCommit={(v) => sess.updateTask(task.id, { title: v })}
          className="flex-1 min-w-0 bg-transparent text-[16px] font-semibold outline-none"
        />
        <span className="hidden sm:inline text-[11px] font-bold rounded-md px-2 py-1 bg-muted-bg text-fg-secondary">{TASK_TYPES[task.type][lang]}</span>
        <span className="hidden sm:inline text-[11px] font-bold rounded-md px-2 py-1" style={{ background: color + '33' }}>
          {client?.name}
        </span>
        <span className={cn('text-[11px] font-bold rounded-md px-2 py-1 tabular-nums', cdTone)} dir="ltr">
          {ms < 0 ? '−' : '⏳ '}
          {countdown}
        </span>
        <Button size="icon" variant="ghost" onClick={() => ui.openTask(null)} aria-label={t('cancel')}>
          <X size={16} />
        </Button>
      </div>

      <div className={cn('flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 grid gap-4', narrow ? 'grid-cols-1' : 'grid-cols-[330px_1fr]')}>
        {/* Brief */}
        <div className="flex flex-col gap-3">
          <SectionTitle>{lang === 'ar' ? 'نوع المهمة' : 'Type of task'}</SectionTitle>
          <div className="flex flex-wrap gap-1.5 -mt-1">
            {(Object.keys(TASK_TYPES) as TaskType[]).map((k) => (
              <button
                key={k}
                type="button"
                disabled={!admin}
                onClick={() => void sess.updateTask(task.id, { type: k })}
                className={cn('text-[11.5px] font-semibold rounded-md px-2.5 py-1.5 border cursor-pointer', task.type === k ? 'bg-fg text-bg border-fg' : 'bg-card text-fg-secondary border-border', !admin && 'cursor-default')}
              >
                {TASK_TYPES[k][lang]}
              </button>
            ))}
          </div>
          <SectionTitle>{lang === 'ar' ? 'الوصف' : 'Description'}</SectionTitle>
          <textarea
            key={task.id + ':d'}
            defaultValue={task.description ?? ''}
            readOnly={!admin}
            onBlur={(e) => admin && void sess.updateTask(task.id, { description: e.target.value })}
            rows={4}
            placeholder={lang === 'ar' ? 'ماذا نريد بالضبط؟' : 'What exactly do we want?'}
            className="-mt-1 w-full rounded-md border border-border bg-bg p-3 text-[13px] resize-y"
          />
          <SectionTitle>{lang === 'ar' ? 'مرجع · النتيجة المطلوبة' : 'Reference · desired result'}</SectionTitle>
          <Input
            key={task.id + ':r'}
            defaultValue={task.reference ?? ''}
            readOnly={!admin}
            onBlur={(e) => admin && void sess.updateTask(task.id, { reference: e.target.value })}
            placeholder={lang === 'ar' ? 'رابط أو وصف المرجع…' : 'Link or description…'}
            className="-mt-1 py-2.5 text-[13px]"
            dir="auto"
          />

          <SectionTitle>{lang === 'ar' ? 'الجدولة والاعتماد' : 'Schedule & approval'}</SectionTitle>
          <div className="-mt-1 rounded-md border border-border p-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              {owner && <Avatar name={owner.name} color={owner.color} size={26} />}
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold truncate">{owner?.name}</div>
                <div className="text-[10.5px] text-fg-secondary">
                  {project?.name} · {lang === 'ar' ? 'المسؤول' : 'Owner'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2" dir="ltr">
              <label className="text-[10.5px] font-bold text-fg-secondary">
                {lang === 'ar' ? 'البداية' : 'Start'}
                <Input type="date" value={task.start} readOnly={!admin} onChange={(e) => e.target.value && void sess.updateTask(task.id, { start: e.target.value, end: e.target.value > task.end ? e.target.value : task.end })} className="py-1.5 text-[12.5px] mt-1" />
              </label>
              <label className="text-[10.5px] font-bold text-fg-secondary">
                {lang === 'ar' ? 'تسليم العميل' : 'Client delivery'}
                <Input type="date" value={task.end} readOnly={!admin} onChange={(e) => e.target.value && void sess.updateTask(task.id, { end: e.target.value < task.start ? task.start : e.target.value })} className="py-1.5 text-[12.5px] mt-1" />
              </label>
            </div>
            {!admin && <div className="text-[11px] text-fg-muted">{lang === 'ar' ? 'المواعيد مقفلة — تواصل مع المسؤول لتغييرها.' : 'Dates are locked — message the owner to change them.'}</div>}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-semibold text-fg-secondary">
                {lang === 'ar' ? 'موعد المبدع' : 'Creative deadline'} · {fmtDate(dueDate(task), lang)}
              </span>
              <span className={cn('text-[11px] font-bold rounded-md px-2 py-1', task.approval === 'approved' ? 'bg-success-tint text-success-dark' : task.approval === 'pending' ? 'bg-warning-tint text-warning-dark' : 'bg-muted-bg text-fg-secondary')}>
                {approval[task.approval][lang]}
              </span>
            </div>
            {task.approval === 'draft' && !isClient && (
              <Button size="sm" onClick={() => void sess.updateTask(task.id, { approval: 'pending' })}>
                {lang === 'ar' ? 'إرسال للاعتماد' : 'Send for approval'}
              </Button>
            )}
            {task.approval === 'pending' && admin && (
              <Button size="sm" variant="dark" onClick={() => void sess.updateTask(task.id, { approval: 'approved' })}>
                <Check size={14} /> {lang === 'ar' ? 'اعتماد (المدير)' : 'Approve (admin)'}
              </Button>
            )}
          </div>
        </div>

        {/* Parts */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle>{lang === 'ar' ? 'أجزاء المهمة' : 'Parts of the task'}</SectionTitle>
            <span className="text-[11.5px] font-semibold text-fg-secondary tabular-nums">
              {pr.done} {t('of')} {pr.total} · {pr.hours}h
            </span>
          </div>
          <div className="flex flex-col gap-2 -mt-1">
            {parts.map((p, i) => {
              const u = userById(s, p.assigneeId)
              return (
                <div key={p.id} className={cn('flex items-center gap-2.5 rounded-md border border-border p-2.5', p.done && 'opacity-70')}>
                  <button
                    type="button"
                    disabled={!canToggle(p.assigneeId)}
                    onClick={() => void sess.upsertPart({ ...p, done: !p.done })}
                    className={cn('w-[20px] h-[20px] rounded-[5px] border-2 grid place-items-center cursor-pointer shrink-0 disabled:cursor-default', p.done ? 'bg-accent border-accent text-white' : 'border-fg-faint')}
                    aria-label={t('done')}
                  >
                    {p.done && <Check size={13} />}
                  </button>
                  <span className="w-[20px] h-[20px] rounded-[5px] bg-muted-bg grid place-items-center text-[10.5px] font-bold text-fg-secondary shrink-0">{i + 1}</span>
                  <DraftInput
                    value={p.label}
                    readOnly={!admin}
                    dir="auto"
                    onCommit={(v) => sess.upsertPart({ ...p, label: v })}
                    className={cn('flex-1 min-w-0 bg-transparent text-[13px] font-semibold outline-none', p.done && 'line-through')}
                  />
                  {u && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Avatar name={u.name} color={u.color} size={22} />
                      <div className="min-w-0 hidden sm:block">
                        {admin ? (
                          <select
                            value={p.assigneeId}
                            onChange={(e) => void sess.upsertPart({ ...p, assigneeId: e.target.value })}
                            title={lang === 'ar' ? 'مين عليه هذا الجزء' : 'Who does this part'}
                            className="max-w-[120px] bg-transparent text-[11.5px] font-semibold outline-none cursor-pointer"
                          >
                            {s.users
                              .filter((x) => x.role !== 'client')
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <div className="text-[11.5px] font-semibold truncate">{u.name.split(' ')[0]}</div>
                        )}
                        <div className="text-[9.5px] text-fg-muted truncate">{u.title}</div>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const dayTotal = s.parts.filter((x) => x.assigneeId === p.assigneeId && x.day === p.day && !x.done).reduce((a, x) => a + (x.hours || 0), 0)
                    const limit = DAY_HOURS_LIMIT
                    return dayTotal > limit ? (
                      <span
                        className="text-[10px] font-bold rounded-md px-1.5 py-0.5 bg-warning-tint text-warning-dark whitespace-nowrap"
                        title={lang === 'ar' ? `${u?.name.split(' ')[0] ?? ''} عليه ${dayTotal} ساعة في ${fmtDate(p.day, lang)} — أكثر من ${limit}` : `${u?.name.split(' ')[0] ?? ''} has ${dayTotal}h on ${fmtDate(p.day, lang)} — over ${limit}`}
                      >
                        {dayTotal}{t('hourShort')} {lang === 'ar' ? 'في اليوم' : 'that day'} ⚠
                      </span>
                    ) : null
                  })()}
                  <div className="flex items-center gap-1" dir="ltr">
                    <input type="number" min={0.5} step={0.5} value={p.hours} readOnly={!admin} onChange={(e) => Number(e.target.value) >= 0.5 && void sess.upsertPart({ ...p, hours: Number(e.target.value) })} className="w-[46px] rounded-md border border-border bg-bg px-1.5 py-1 text-[12px] text-center" />
                    <span className="text-[11px] text-fg-muted">{t('hourShort')}</span>
                  </div>
                  <input type="date" value={p.day} readOnly={!admin} onChange={(e) => e.target.value && void sess.upsertPart({ ...p, day: e.target.value })} min={task.start} max={task.end} className="hidden md:block rounded-md border border-border bg-bg px-1.5 py-1 text-[12px]" dir="ltr" />
                  <input
                    type="time"
                    value={p.time ?? ''}
                    readOnly={!admin}
                    onChange={(e) => void sess.upsertPart({ ...p, time: e.target.value || undefined })}
                    title={lang === 'ar' ? 'وقت التسليم داخل اليوم' : 'Hand-off time'}
                    className="hidden md:block rounded-md border border-border bg-bg px-1.5 py-1 text-[12px] w-[88px]"
                    dir="ltr"
                  />
                  {admin && (
                    <button
                      type="button"
                      disabled={parts.length <= 1}
                      title={parts.length <= 1 ? t('lastPartHint') : undefined}
                      onClick={() => void sess.deletePart(p.id)}
                      className="text-fg-muted hover:text-accent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={t('remove')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {admin && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newPart.trim()) return
                void sess.upsertPart({ taskId: task.id, label: newPart.trim(), assigneeId: task.ownerId, hours: 4, day: (() => { const d = addIso(task.start, parts.length); return d > task.end ? task.end : d })(), done: false, order: parts.length })
                setNewPart('')
              }}
              className="flex gap-2"
            >
              <Input value={newPart} onChange={(e) => setNewPart(e.target.value)} placeholder={lang === 'ar' ? 'جزء جديد (تسليم لشخص)…' : 'Add a part (hand-off to someone)…'} className="py-2 text-[13px]" />
              <Button type="submit" variant="dark" disabled={!newPart.trim()}>
                <Plus size={14} />
              </Button>
            </form>
          )}
          {admin && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-accent hover:text-accent"
              onClick={() => {
                if (confirm(lang === 'ar' ? 'حذف هذه المهمة؟' : 'Delete this task?')) {
                  void sess.deleteTask(task.id)
                  ui.openTask(null)
                }
              }}
            >
              <Trash2 size={14} /> {lang === 'ar' ? 'حذف المهمة' : 'Delete task'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
