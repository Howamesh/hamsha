// «كل الأرقام إنجليزي حتى لو كتبت بالعربي» (his rule, 1 Nov 2026): every field in the app turns
// Arabic-Indic (٠-٩) and Persian (۰-۹) digits — and the Arabic decimal/thousands marks — into Latin as
// they are typed. One listener for the whole app instead of touching every <input>.

const MAP: Record<string, string> = { '٫': '.', '٬': ',' }
const FOREIGN = /[٠-٩۰-۹٫٬]/

export const toLatin = (v: string) =>
  v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٫٬]/g, (c) => MAP[c])

const SKIP = new Set(['password', 'file', 'checkbox', 'radio', 'color', 'range', 'date', 'time', 'datetime-local', 'month', 'week'])

/** Capture phase on window runs before React's root listener, so onChange already sees Latin digits. */
export function installLatinDigits() {
  window.addEventListener(
    'input',
    (e) => {
      const el = e.target
      const isInput = el instanceof HTMLInputElement
      if (!isInput && !(el instanceof HTMLTextAreaElement)) return
      if (isInput && SKIP.has(el.type)) return
      if (!FOREIGN.test(el.value)) return
      let start: number | null = null
      let end: number | null = null
      try {
        start = el.selectionStart
        end = el.selectionEnd
      } catch {
        /* type=email/number have no selection API */
      }
      // the PROTOTYPE setter, not el.value = …: React's value tracker must still see a change, or onChange is skipped
      const proto = isInput ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, toLatin(el.value))
      // one character in, one character out → the caret stays where it was
      if (start !== null && end !== null) {
        try {
          el.setSelectionRange(start, end)
        } catch {
          /* not supported for this type */
        }
      }
    },
    true,
  )
}
