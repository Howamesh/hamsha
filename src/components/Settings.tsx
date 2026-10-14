import { CITIES } from '@/lib/prayer'
import { useStr } from '@/lib/useStr'
import { useData, useSession, useUser } from '@/store/session'
import { useUi, type View } from '@/store/ui'
import { Segmented, SectionTitle } from './ui'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <SectionTitle>{label}</SectionTitle>
      <div className="min-w-[160px]">{children}</div>
    </div>
  )
}

export function SettingsPanel() {
  const { t, lang } = useStr()
  const ui = useUi()
  const s = useData()
  const user = useUser()
  const updateProfile = useSession((x) => x.updateProfile)
  const profile = user ? s.profiles[user.id] : undefined
  const views: Array<{ value: View; label: string }> = [
    { value: 'month', label: t('month') },
    { value: 'week', label: t('week') },
    { value: 'day', label: t('day') },
  ]
  return (
    <div className="flex flex-col gap-2.5">
      <Row label={t('language')}>
        <Segmented
          size="sm"
          value={lang}
          options={[
            { value: 'ar', label: 'عربي' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(v) => {
            ui.setLang(v)
            void updateProfile({ lang: v })
          }}
        />
      </Row>
      <Row label={t('weekStart')}>
        <Segmented
          size="sm"
          value={ui.weekStart}
          options={[
            { value: 'monday', label: t('monday') },
            { value: 'sunday', label: t('sunday') },
          ]}
          onChange={(v) => {
            ui.setWeekStart(v)
            void updateProfile({ weekStart: v })
          }}
        />
      </Row>
      <Row label={t('defaultView')}>
        <Segmented size="sm" value={ui.view} options={views} onChange={ui.setView} />
      </Row>
      <Row label={t('location')}>
        <select
          value={profile?.city ?? 'riyadh'}
          onChange={(e) => void updateProfile({ city: e.target.value })}
          className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12.5px] font-semibold"
        >
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name[lang]}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('mode')}>
        <Segmented
          size="sm"
          value={ui.theme}
          options={[
            { value: 'light', label: t('light') },
            { value: 'dark', label: t('dark') },
          ]}
          onChange={(v) => {
            ui.setTheme(v)
            void updateProfile({ theme: v })
          }}
        />
      </Row>
    </div>
  )
}
