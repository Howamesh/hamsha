import { useMemo } from 'react'
import { cityById, prayerLabel, prayerTimes, PRAYER_NAMES, type Prayer } from '@/lib/prayer'
import { fromIso } from '@/lib/dates'
import { useStr } from '@/lib/useStr'
import { useData, useUser } from '@/store/session'
import { useUi } from '@/store/ui'

/** Prayer times for the focused day, for the signed-in user's city. */
export function usePrayers(): Prayer[] {
  const s = useData()
  const user = useUser()
  const focus = useUi((u) => u.focus)
  const cityId = (user && s.profiles[user.id]?.city) || 'riyadh'
  return useMemo(() => prayerTimes(cityById(cityId), fromIso(focus)), [cityId, focus])
}

export function PrayerChip({ prayer }: { prayer: Prayer }) {
  const { lang, t } = useStr()
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border border-dashed border-success px-2 py-1.5 bg-success-tint/60 text-[11.5px] font-semibold text-success-dark"
      title={`${PRAYER_NAMES[prayer.name][lang]} · ${prayerLabel(prayer, lang)}`}
    >
      <span className="w-[6px] h-[6px] rounded-full bg-success shrink-0" />
      <span className="truncate">{PRAYER_NAMES[prayer.name][lang]}</span>
      <span className="text-[10px] tabular-nums text-success-dark/80 ms-auto whitespace-nowrap">
        {prayerLabel(prayer, lang)}
      </span>
      <span className="text-[8.5px] font-bold tracking-[0.06em] uppercase rounded bg-success text-white px-1 py-[1px]">{t('blocked')}</span>
    </div>
  )
}
