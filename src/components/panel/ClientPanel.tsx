import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clientProgress, isDone } from '@/lib/derive'
import { fmtDate, useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'
import { Bar, Button, SectionTitle, Segmented } from '../ui'
import { Chat } from '../Chat'
import { SettingsPanel } from '../Settings'

export function ClientPanel() {
  const { t, lang } = useStr()
  const s = useData()
  const me = useUser()!
  const ui = useUi()
  const c = s.clients.find((x) => x.id === me.clientId)
  if (!c) return null
  const p = clientProgress(s, c)
  const tasks = s.tasks.filter((x) => x.clientId === c.id)
  const delivered = tasks.filter((x) => isDone(s, x)).length
  const projects = s.projects.filter((x) => x.clientId === c.id)
  const tab = ui.panelTab === 'settings' ? 'settings' : 'main'
  const stages = [
    { l: lang === 'ar' ? 'العقد' : 'Contract', sub: c.contract === 'signed' ? (lang === 'ar' ? 'موقّع' : 'Signed') : lang === 'ar' ? 'بانتظار التوقيع' : 'Awaiting signature', on: c.contract === 'signed' },
    { l: lang === 'ar' ? 'الانطلاق' : 'Kickoff', sub: fmtDate(c.start, lang), on: true },
    { l: lang === 'ar' ? 'الإنتاج' : 'Production', sub: `${p.done} ${t('of')} ${p.total} ${t('partsDone')}`, on: p.done > 0 },
    { l: lang === 'ar' ? 'الختام' : 'Wrap', sub: fmtDate(c.end, lang), on: false },
  ]
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="text-[17px] font-semibold tracking-[-0.01em]">{t('panelClient')}</div>
        <Button size="icon" variant="ghost" onClick={() => ui.togglePanel(false)} aria-label={t('hidePanel')}>
          <X size={16} />
        </Button>
      </div>
      <div className="px-5 pb-3">
        <Segmented
          value={tab}
          options={[
            { value: 'main', label: t('tabProgress') },
            { value: 'settings', label: t('tabSettings') },
          ]}
          onChange={(v) => ui.setPanelTab(v)}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-5 pt-2 flex flex-col gap-4">
        {tab === 'settings' ? (
          <SettingsPanel />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-md p-3.5 bg-success-tint text-success-dark">
                <div className="text-[22px] font-bold leading-none tabular-nums">{p.pct}%</div>
                <div className="text-[11.5px] font-semibold mt-1.5">{lang === 'ar' ? 'التقدم الكلي' : 'Overall progress'}</div>
              </div>
              <div className="rounded-md p-3.5 bg-info-tint text-info">
                <div className="text-[22px] font-bold leading-none tabular-nums">
                  {delivered}/{tasks.length}
                </div>
                <div className="text-[11.5px] font-semibold mt-1.5">{lang === 'ar' ? 'مهام مُسلّمة' : 'Delivered tasks'}</div>
              </div>
            </div>
            <SectionTitle>{lang === 'ar' ? 'تقدم المشاريع' : 'Project progress'}</SectionTitle>
            <div className="flex flex-col gap-2.5 -mt-2">
              {projects.map((pr) => {
                const ts = tasks.filter((x) => x.projectId === pr.id)
                const pct = ts.length ? Math.round((ts.filter((x) => isDone(s, x)).length / ts.length) * 100) : 0
                return (
                  <div key={pr.id}>
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      <span className="w-[9px] h-[9px] rounded-sm" style={{ background: pr.color }} />
                      {pr.name}
                      <span className="ms-auto tabular-nums">{pct}%</span>
                    </div>
                    <Bar pct={pct} color={pr.color} className="mt-1.5" />
                  </div>
                )
              })}
            </div>
            <SectionTitle>{lang === 'ar' ? 'المراحل' : 'Stages'}</SectionTitle>
            <div className="flex flex-col -mt-2">
              {stages.map((st, i) => (
                <div key={st.l} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn('w-[11px] h-[11px] rounded-full border-2', st.on ? 'bg-success border-success' : 'border-fg-faint bg-card')} />
                    {i < stages.length - 1 && <span className="flex-1 w-px bg-border-soft my-0.5" />}
                  </div>
                  <div className="pb-3">
                    <div className="text-[13px] font-semibold leading-none">{st.l}</div>
                    <div className="text-[11.5px] text-fg-secondary mt-1">{st.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <SectionTitle>{t('tabMessages')}</SectionTitle>
            <Chat channel={`client:${c.id}`} className="-mt-2 h-[280px]" />
          </>
        )}
      </div>
    </>
  )
}
