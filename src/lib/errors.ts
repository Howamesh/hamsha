import type { Lang } from './i18n'

/** Repository / validation error codes → human messages (both languages). */
const MESSAGES: Record<string, { en: string; ar: string }> = {
  'invalid date for start': { en: 'Start date is not valid.', ar: 'تاريخ البداية غير صحيح.' },
  'invalid date for end': { en: 'Delivery date is not valid.', ar: 'تاريخ التسليم غير صحيح.' },
  'invalid date for day': { en: 'Part day is not valid.', ar: 'تاريخ الجزء غير صحيح.' },
  'end before start': { en: 'Delivery cannot be before the start.', ar: 'التسليم لا يمكن أن يسبق البداية.' },
  'empty title': { en: 'Title cannot be empty.', ar: 'العنوان لا يمكن أن يكون فارغاً.' },
  'empty label': { en: 'Part name cannot be empty.', ar: 'اسم الجزء لا يمكن أن يكون فارغاً.' },
  'empty name': { en: 'Name cannot be empty.', ar: 'الاسم لا يمكن أن يكون فارغاً.' },
  'invalid hours': { en: 'Hours must be between 0.5 and 999.', ar: 'الساعات بين 0.5 و999.' },
  'invalid time': { en: 'Time must be HH:MM.', ar: 'الوقت بصيغة س:د.' },
  'part day outside task range': { en: 'Part day must be inside the task dates.', ar: 'يوم الجزء يجب أن يكون ضمن مدة المهمة.' },
  stale: { en: 'Someone else changed this just now — it was refreshed, please try again.', ar: 'شخص آخر عدّل هذا الآن — تم التحديث، حاول مرة أخرى.' },
  forbidden: { en: 'You are not allowed to do this.', ar: 'ليس لديك صلاحية لهذا الإجراء.' },
  'not found': { en: 'This item no longer exists.', ar: 'هذا العنصر لم يعد موجوداً.' },
  invalid: { en: 'Wrong email or password.', ar: 'البريد أو كلمة المرور غير صحيحة.' },
  'already a member': { en: 'This e-mail already belongs to a member.', ar: 'هذا البريد لعضو مسجّل بالفعل.' },
}

export function errorMessage(e: unknown, lang: Lang): string {
  const key = e instanceof Error ? e.message : String(e)
  const m = MESSAGES[key]
  if (m) return m[lang]
  return lang === 'ar' ? 'تعذّر الحفظ — حاول مرة أخرى.' : 'Could not save — please try again.'
}
