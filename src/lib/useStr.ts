import { useEffect, useState } from 'react'
import { STR, interpolate, type Lang, type StrKey } from './i18n'
import { useUi } from '@/store/ui'

type Pair = { en: string; ar: string }

export function useStr() {
  const lang = useUi((s) => s.lang)
  const t = (k: StrKey, vars?: Record<string, string | number>) => interpolate((STR[k] as Pair)[lang], vars)
  return { lang, t, dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr', days: STR.days[lang], daysLong: STR.daysLong[lang] }
}

export const pick = (lang: Lang, p: Pair) => p[lang]

/** Narrow layout breakpoint (the prototype's single `narrow < 1100px`). */
export function useNarrow(bp = 1100) {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < bp : false))
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < bp)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return narrow
}

/** Ticks every `ms` — for countdowns and the red now-line. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function fmtDate(iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', opts).format(new Date(iso + 'T12:00:00'))
}
export function fmtTime(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
