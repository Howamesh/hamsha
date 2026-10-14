/**
 * Hijri (Umm al-Qura) via the browser's built-in Intl — no library, no network.
 * Decision from the Claude × Codex debate (2026-10-14): Intl for formatting;
 * add @internationalized/date only if Hijri arithmetic is ever needed.
 */
import type { Lang } from './i18n'

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-SA' : 'en') + '-u-ca-islamic-umalqura-nu-latn'

const cache = new Map<string, Intl.DateTimeFormat>()
function fmt(lang: Lang, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = lang + JSON.stringify(opts)
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale(lang), opts)
    cache.set(key, f)
  }
  return f
}

function parts(lang: Lang, d: Date, opts: Intl.DateTimeFormatOptions) {
  const out: Record<string, string> = {}
  for (const p of fmt(lang, opts).formatToParts(d)) out[p.type] = p.value
  return out
}

/** { day: 1, month: 'جمادى الأولى', year: 1448 } */
export function hijriParts(d: Date, lang: Lang) {
  const p = parts(lang, d, { day: 'numeric', month: 'long', year: 'numeric' })
  return { day: Number(p.day), month: p.month, year: Number(p.year) }
}

/** Short cell label: "17" — or "1 جمادى الأولى" on the first of a Hijri month. */
export function hijriCell(d: Date, lang: Lang): string {
  const h = hijriParts(d, lang)
  return h.day === 1 ? `${h.day} ${h.month}` : String(h.day)
}

/** Full date: "3 جمادى الأولى 1448 هـ" */
export function hijriFull(d: Date, lang: Lang): string {
  const h = hijriParts(d, lang)
  return `${h.day} ${h.month} ${h.year} ${lang === 'ar' ? 'هـ' : 'AH'}`
}

/** Period label for a date range: "ربيع الآخر – جمادى الأولى 1448 هـ" */
export function hijriRange(a: Date, b: Date, lang: Lang): string {
  const ha = hijriParts(a, lang)
  const hb = hijriParts(b, lang)
  const era = lang === 'ar' ? 'هـ' : 'AH'
  if (ha.month === hb.month && ha.year === hb.year) return `${ha.month} ${ha.year} ${era}`
  if (ha.year === hb.year) return `${ha.month} – ${hb.month} ${ha.year} ${era}`
  return `${ha.month} ${ha.year} – ${hb.month} ${hb.year} ${era}`
}
