import {
  addDays,
  differenceInCalendarDays,
  format,
  getDay,
  parseISO,
  startOfMonth,
  endOfMonth,
} from 'date-fns'

/** All-day dates are stored and passed around as ISO `YYYY-MM-DD` strings. */
export type IsoDate = string

export type WeekStart = 'monday' | 'sunday'

export const toIso = (d: Date): IsoDate => format(d, 'yyyy-MM-dd')
export const fromIso = (s: IsoDate): Date => parseISO(s)
export const todayIso = (): IsoDate => toIso(new Date())

export const addIso = (s: IsoDate, days: number): IsoDate => toIso(addDays(fromIso(s), days))
export const daysBetween = (a: IsoDate, b: IsoDate): number =>
  differenceInCalendarDays(fromIso(b), fromIso(a))

/** 0 = first column of the week for the chosen week start. */
export function weekOffset(d: Date, weekStart: WeekStart): number {
  const start = weekStart === 'sunday' ? 0 : 1
  return (getDay(d) - start + 7) % 7
}

/** Saudi weekend: Friday (5) + Saturday (6). */
export const isWeekend = (d: Date): boolean => {
  const g = getDay(d)
  return g === 5 || g === 6
}

/** Start of the visible week that contains `d`. */
export function startOfVisibleWeek(d: Date, weekStart: WeekStart): Date {
  return addDays(d, -weekOffset(d, weekStart))
}

/** 7 dates for the week containing `d`. */
export function weekDays(d: Date, weekStart: WeekStart): Date[] {
  const s = startOfVisibleWeek(d, weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(s, i))
}

/**
 * Month grid: always 6 rows × 7 columns so the grid never jumps height
 * (the director asked for the calendar to fill its card with no scroll).
 */
export function monthGrid(year: number, month: number, weekStart: WeekStart): Date[] {
  const first = startOfMonth(new Date(year, month, 1))
  const gridStart = startOfVisibleWeek(first, weekStart)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

export function monthRange(year: number, month: number): { start: IsoDate; end: IsoDate } {
  const d = new Date(year, month, 1)
  return { start: toIso(startOfMonth(d)), end: toIso(endOfMonth(d)) }
}

/** Does an inclusive [start,end] range cover the day? */
export const covers = (start: IsoDate, end: IsoDate, day: IsoDate): boolean =>
  start <= day && day >= start && day <= end

/** Fraction of the day elapsed (0..1) — used for the red "now" line. */
export function dayFraction(now = new Date()): number {
  return (now.getHours() * 60 + now.getMinutes()) / (24 * 60)
}

export const hhmm = (d: Date): string => format(d, 'HH:mm')

/** 12-hour clock the way people read it: "3:00 م" / "3:00 PM" (Yousef, 2026-10-16). Minutes are padded, hours are not. */
export function clock12(hour: number, minute: number, lang: 'ar' | 'en'): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const suffix = lang === 'ar' ? (hour < 12 ? 'ص' : 'م') : hour < 12 ? 'AM' : 'PM'
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`
}
/** From an 'HH:MM' string */
export function clock12FromHHMM(v: string, lang: 'ar' | 'en'): string {
  const [h, m] = v.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? clock12(h, m, lang) : v
}
export const clock12Date = (d: Date, lang: 'ar' | 'en') => clock12(d.getHours(), d.getMinutes(), lang)
