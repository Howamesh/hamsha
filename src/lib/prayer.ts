/**
 * Prayer times with the `adhan` library (Umm al-Qura method), computed per city
 * for the given Gregorian date in the city's own timezone.
 * Umm al-Qura: Fajr 18.5°, Isha = Maghrib + 90 min, and +30 min during Ramadan
 * (handled below via the Hijri month — a point Codex raised in the debate).
 */
import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan'
import { clock12 } from './dates'

export type CityId = 'riyadh' | 'jeddah' | 'makkah' | 'madinah' | 'dammam' | 'dubai' | 'cairo' | 'istanbul'

export interface City {
  id: CityId
  name: { en: string; ar: string }
  lat: number
  lng: number
  tz: string
}

export const CITIES: City[] = [
  { id: 'riyadh', name: { en: 'Riyadh', ar: 'الرياض' }, lat: 24.7136, lng: 46.6753, tz: 'Asia/Riyadh' },
  { id: 'jeddah', name: { en: 'Jeddah', ar: 'جدة' }, lat: 21.4858, lng: 39.1925, tz: 'Asia/Riyadh' },
  { id: 'makkah', name: { en: 'Makkah', ar: 'مكة المكرمة' }, lat: 21.3891, lng: 39.8579, tz: 'Asia/Riyadh' },
  { id: 'madinah', name: { en: 'Madinah', ar: 'المدينة المنورة' }, lat: 24.5247, lng: 39.5692, tz: 'Asia/Riyadh' },
  { id: 'dammam', name: { en: 'Dammam', ar: 'الدمام' }, lat: 26.4207, lng: 50.0888, tz: 'Asia/Riyadh' },
  { id: 'dubai', name: { en: 'Dubai', ar: 'دبي' }, lat: 25.2048, lng: 55.2708, tz: 'Asia/Dubai' },
  { id: 'cairo', name: { en: 'Cairo', ar: 'القاهرة' }, lat: 30.0444, lng: 31.2357, tz: 'Africa/Cairo' },
  { id: 'istanbul', name: { en: 'Istanbul', ar: 'إسطنبول' }, lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' },
]

export const cityById = (id: string): City => CITIES.find((c) => c.id === id) ?? CITIES[0]

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'
export const PRAYER_NAMES: Record<PrayerName, { en: string; ar: string }> = {
  fajr: { en: 'Fajr', ar: 'الفجر' },
  dhuhr: { en: 'Dhuhr', ar: 'الظهر' },
  asr: { en: 'Asr', ar: 'العصر' },
  maghrib: { en: 'Maghrib', ar: 'المغرب' },
  isha: { en: 'Isha', ar: 'العشاء' },
}

export interface Prayer {
  name: PrayerName
  /** Local wall-clock time in the city's timezone */
  hour: number
  minute: number
  /** Minutes after midnight */
  minutes: number
}

/** Hamsha policy: each prayer blocks 30 minutes on the creative's timeline. */
export const PRAYER_BLOCK_MINUTES = 30

const isRamadan = (d: Date): boolean => {
  const m = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' })
    .formatToParts(d)
    .find((p) => p.type === 'month')?.value
  return m === '9'
}

export function wallClock(d: Date, tz: string): { hour: number; minute: number } {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
  return { hour: get('hour'), minute: get('minute') }
}

export function prayerTimes(city: City, date: Date): Prayer[] {
  const params = CalculationMethod.UmmAlQura()
  if (isRamadan(date)) params.ishaInterval = 120 // 90 + 30 during Ramadan
  const pt = new PrayerTimes(new Coordinates(city.lat, city.lng), date, params)
  const list: Array<[PrayerName, Date]> = [
    ['fajr', pt.fajr],
    ['dhuhr', pt.dhuhr],
    ['asr', pt.asr],
    ['maghrib', pt.maghrib],
    ['isha', pt.isha],
  ]
  return list.map(([name, t]) => {
    const { hour, minute } = wallClock(t, city.tz)
    return { name, hour, minute, minutes: hour * 60 + minute }
  })
}

export const pad2 = (n: number) => String(n).padStart(2, '0')
export const prayerLabel = (p: Prayer, lang: 'ar' | 'en' = 'ar') => {
  const end = p.minutes + PRAYER_BLOCK_MINUTES
  return `${clock12(p.hour, p.minute, lang)} – ${clock12(Math.floor(end / 60) % 24, end % 60, lang)}`
}

/**
 * Energy level (0..1) for an hour row, declining linearly from Fajr.
 * The constants are the prototype's (90% at Fajr, −4.6%/h) — flagged as a
 * design assumption, not science; kept for visual continuity with the approved design.
 */
export function energyAt(hour: number, fajrHour: number): number {
  const e = (90 - (hour + 0.5 - fajrHour) * 4.6) / 100
  return Math.min(0.95, Math.max(0.06, e))
}
