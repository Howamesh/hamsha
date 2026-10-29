/**
 * «العقود» — templates, arithmetic and dates. Built from the manager's own Figma contracts (29 Oct 2026):
 * the fixed core («الدستور») is the preamble and the general provisions; the variable parts (counts, amounts,
 * months, platforms, colours) stay EMPTY until a person types them, and the app does the arithmetic.
 * Hawamish's legal identity (CR, address, representative, phone, e-mail, bank accounts) is NOT in the code:
 * the admin types it once in Settings («الهوية القانونية») and it is copied into every contract version.
 */
import type { Client, Contract, ContractBank, ContractContent, ContractKind, ContractPartyInfo, ContractSection, ContractSigner, ContractVersion, OrgLegal, User } from '@/types'
import type { Snapshot } from '@/data/repo'
import { todayIso, type IsoDate } from './dates'

export const COPYRIGHT_YEAR = 1448
export const EMPTY_PARTY: ContractPartyInfo = { name: '', cr: '', country: 'المملكة العربية السعودية', city: '', repTitle: '', repName: '', phone: '', email: '', nationalId: '' }
export const EMPTY_LEGAL: OrgLegal = { party: { ...EMPTY_PARTY, name: 'شركة نموذج هوامش', repTitle: 'ممثل هوامش' }, signer: { name: '', capacity: '' }, banks: [], stamp: '' }

// ---------- numbers → Arabic words (تفقيط) ----------
const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']

function under1000(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(HUNDREDS[h])
  if (r < 20) {
    if (r) parts.push(ONES[r])
  } else {
    const o = r % 10
    const t = Math.floor(r / 10)
    parts.push(o ? `${ONES[o]} و${TENS[t]}` : TENS[t])
  }
  return parts.join(' و')
}
function group(n: number, forms: [string, string, string, string]): string {
  if (n === 0) return ''
  if (n === 1) return forms[0]
  if (n === 2) return forms[1]
  if (n >= 3 && n <= 10) return `${under1000(n)} ${forms[2]}`
  return `${under1000(n)} ${forms[3]}`
}
/** 48000 → «ثمانية وأربعون ألف» (integers up to 999,999,999). */
export function numberWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'صفر'
  const parts: string[] = []
  const m = Math.floor(n / 1_000_000)
  const k = Math.floor((n % 1_000_000) / 1000)
  const u = n % 1000
  if (m) parts.push(group(m, ['مليون', 'مليونان', 'ملايين', 'مليون']))
  if (k) parts.push(group(k, ['ألف', 'ألفان', 'آلاف', 'ألف']))
  if (u) parts.push(under1000(u))
  return parts.join(' و')
}
export function fmtAmount(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n))
}
/** 48000, 'ريال سعودي' → «(48,000) ثمانية وأربعون ألف ريال سعودي» */
export function amountWords(n: number, currency = 'ريال سعودي'): string {
  return `(${fmtAmount(n)}) ${numberWords(n)} ${currency}`
}
export const CURRENCIES: Record<string, { word: string; short: string }> = {
  SAR: { word: 'ريال سعودي', short: 'ريال' },
  KWD: { word: 'دينار كويتي', short: 'د.ك' },
  AED: { word: 'درهم إماراتي', short: 'درهم' },
  USD: { word: 'دولار أمريكي', short: 'دولار' },
}
export const currencyWord = (code: string) => CURRENCIES[code]?.word ?? code
export const currencyShort = (code: string) => CURRENCIES[code]?.short ?? code
/** 12 → «اثني عشر (12) شهراً» as the manager writes durations */
/** after «لمدة» the number is in the genitive: اثنا عشر → اثني عشر (the manager's wording) */
const genitive = (w: string) => w.replace(/^اثنا /, 'اثني ').replace(/^اثنان$/, 'اثنين')
export function monthsWords(n: number): string {
  return n === 1 ? 'شهر واحد' : n === 2 ? 'شهرين' : n <= 10 ? `${genitive(numberWords(n))} (${n}) أشهر` : `${genitive(numberWords(n))} (${n}) شهراً`
}
export function daysWords(n: number): string {
  return n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? `${genitive(numberWords(n))} (${n}) أيام` : `${genitive(numberWords(n))} (${n}) يوماً`
}

// ---------- dates ----------
/** «يوم الأربعاء 08/02/1448هـ الموافق 22/07/2026م» (Umm al-Qura calendar, Latin digits) */
export function agreementDateLine(iso: IsoDate): string {
  const d = new Date(iso + 'T12:00:00')
  const weekday = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long' }).format(d)
  const hParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d)
  const get = (t: string) => hParts.find((p) => p.type === t)?.value ?? ''
  const hijri = `${get('day')}/${get('month')}/${get('year').replace(/\D/g, '')}هـ`
  const [y, m, dd] = iso.split('-')
  return `يوم ${weekday} ${hijri} الموافق ${dd}/${m}/${y}م`
}
export function signDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

// ---------- templates (the manager's recurring core, placeholders for the variables) ----------
export const FULL_SECTIONS: ContractSection[] = [
  {
    num: '01',
    title: 'تمهيد',
    fixed: true,
    body: 'نظراً لرغبة {الطرف} في {الهدف}، وفق أفضل الممارسات والمعايير المهنية. وحيث إن {الطرف_الآخر} قد أبدى استعداده التام، وتمتعه بالخبرة والكفاءة الفنية والمهنية اللازمة لتنفيذ الأعمال محل هذا العقد. عليه، فقد التقت إرادة الطرفين وتطابقت رغبتهما المعتبرة شرعاً ونظاماً على إبرام هذا العقد، والاتفاق على الشروط والبنود التالية:\nأولاً: يعتبر التمهيد السابق جزءاً لا يتجزأ من هذا العقد، ومكملاً ومفسراً لأحكامه وموجهاً لنطاق أعماله.',
  },
  {
    num: '02',
    title: 'نطاق العمل',
    body: 'يلتزم {الطرف_الآخر} بتنفيذ الأعمال التالية:\nأولاً: تفعيل وإدارة منصات التواصل الاجتماعي ({المنصات})\n1/ إعداد استراتيجية تسويق رقمي تتناسب مع هوية {العميل} وأهدافه.\n2/ إعداد خطة محتوى دورية (Content Calendar) تتضمن المحتوى التعريفي، والتوعوي، والتفاعلي، والترويجي بواقع {المنشورات} منشوراً شهرياً.\n3/ تصميم المنشورات والمواد البصرية بما يتوافق مع الهوية المعتمدة بواقع {التصاميم} تصميماً شهرياً.\n4/ كتابة المحتوى التسويقي والإعلاني بما يعكس رسالة {العميل} ويحقق أهدافه التسويقية.\n5/ إدارة ونشر المحتوى وفق الخطة الزمنية المعتمدة.\n6/ متابعة أداء الحسابات ورفع التوصيات اللازمة لتحسين التفاعل والوصول.',
  },
  {
    num: '03',
    title: 'مدة التنفيذ',
    body: '1/ يلتزم {الطرف_الآخر} بتقديم وتنفيذ الخدمات المتفق عليها بموجب هذا العقد لمدة {المدة}، تبدأ من تاريخ توقيع العقد وسداد الدفعة الأولى واستلام جميع المتطلبات والبيانات اللازمة لبدء تنفيذ الأعمال.\n2/ يلتزم {الطرف_الآخر} بتقديم الخدمات بصورة دورية ومستمرة طوال مدة العقد، وفق الخطة الزمنية وجدول الأعمال المتفق عليه بين الطرفين.\n3/ يجوز للطرفين تجديد هذا العقد أو تمديد مدته باتفاق كتابي قبل انتهائه، كما يجوز تعديل نطاق الأعمال أو إضافة خدمات جديدة بموجب ملحق أو اتفاق مكتوب يوقع من الطرفين.',
  },
  { num: '04', title: 'قيمة العقد وآلية السداد', body: '{السداد}' },
  {
    num: '05',
    title: 'حقوق الملكية الفكرية',
    fixed: true,
    body: '1/ تنتقل إلى {الطرف}، بعد سداد كامل المستحقات المالية المترتبة بموجب هذا العقد، جميع حقوق الملكية الفكرية المتعلقة بالأعمال التي تم تطويرها خصيصاً له، بما في ذلك التصاميم الإبداعية، والمحتوى التسويقي، والملفات المصدرية المتفق على تسليمها، وأي أعمال فنية أو تقنية تم إنتاجها خصيصاً لتنفيذ هذا العقد.\n2/ يحتفظ {الطرف_الآخر} بكافة حقوقه في الأدوات، والمنهجيات، والقوالب، والمكتبات البرمجية، والخبرات الفنية، والأفكار العامة التي يمتلكها أو طورها بصورة مستقلة قبل هذا العقد أو التي لا تختص بـ{الطرف}، ويجوز له استخدامها في مشاريعه الأخرى، شريطة ألا يؤدي ذلك إلى الإفصاح عن أي معلومات أو بيانات أو أعمال خاصة بـ{الطرف}.\n3/ لا يجوز لـ{الطرف_الآخر} إعادة بيع أو منح أو نقل أو استغلال أي من التصاميم، أو المحتويات، أو أي أعمال تم تطويرها خصيصاً لـ{الطرف} لصالح أي طرف آخر، كما لا يجوز نسخها أو إعادة استخدامها بما يمس حقوق {الطرف} أو يخل بسرية أعماله.',
  },
  {
    num: '06',
    title: 'السرية وحماية البيانات',
    fixed: true,
    body: 'يلتزم الطرفان بالمحافظة على سرية جميع المعلومات والبيانات والوثائق والملفات والمحتويات، وبيانات حسابات التواصل الاجتماعي، وأي معلومات فنية أو تجارية يتم تبادلها أو الاطلاع عليها أثناء تنفيذ هذا العقد، وعدم الإفصاح عنها أو استخدامها لأي غرض غير متعلق بتنفيذ الأعمال محل هذا العقد، أو تمكين أي طرف ثالث من الوصول إليها، إلا بعد الحصول على موافقة كتابية من الطرف الآخر أو إذا كان الإفصاح مطلوباً بموجب الأنظمة والتعليمات المعمول بها في المملكة العربية السعودية.',
  },
  {
    num: '07',
    title: 'الدعم الفني والصيانة',
    body: 'يلتزم {الطرف_الآخر} بتقديم الدعم الفني والصيانة اللازمة للأعمال محل هذا العقد {مدة_الدعم}، بما يضمن استمرارية الخدمات المتفق عليها وجودتها.\nوتشمل خدمات الدعم والصيانة ما يلي:\n1/ معالجة أي أعطال أو مشاكل فنية تؤثر على تشغيل الأعمال المسلّمة أو ظهورها.\n2/ تنفيذ التحديثات والتحسينات الفنية البسيطة اللازمة لضمان الاستقرار وتحسين الأداء.\n3/ إجراء التعديلات البسيطة على المحتوى أو التصاميم المنشورة عند الحاجة.\n4/ معالجة الأخطاء الفنية أو التصميمية الناتجة عن أعمال {الطرف_الآخر}.\nولا تشمل خدمات الدعم والصيانة ما يلي:\n1/ أعمال أو صفحات أو مواقع إضافية لم تكن ضمن نطاق الأعمال المتفق عليه.\n2/ إعادة تصميم الهوية البصرية أو الشعار أو إنشاء هوية بصرية جديدة، إلا إذا تم الاتفاق عليها بعقد أو ملحق مستقل.\n3/ إنتاج حملات إعلانية مدفوعة، أو تحمل تكاليف الإعلانات، أو رسوم الاستضافة، أو أسماء النطاقات (Domains)، أو الاشتراكات والخدمات الخارجية، ما لم ينص العقد على خلاف ذلك.\n4/ الأعطال أو المشاكل الناتجة عن تدخل {الطرف} أو أي طرف ثالث دون موافقة {الطرف_الآخر}.\nوفي حال طلب {الطرف} أي أعمال إضافية خارج نطاق هذا العقد، فيتم الاتفاق عليها بموجب عرض سعر أو ملحق عقد مستقل يحدد نطاق الأعمال، والمدة، والمقابل المالي.',
  },
  {
    num: '08',
    title: 'التزامات الطرف الأول',
    body: 'يلتزم الطرف الأول بما يلي:\n1/ تزويد الطرف الثاني بجميع المعلومات والبيانات والملفات والمحتويات اللازمة لتنفيذ الأعمال محل هذا العقد، وذلك في الوقت المناسب.\n2/ مراجعة واعتماد التصاميم، والمحتوى، وأي مخرجات أخرى خلال المدة المتفق عليها، ويُعد تأخره في الاعتماد سبباً مبرراً لتمديد مدة التنفيذ عند الحاجة.\n3/ سداد المستحقات المالية في مواعيدها المحددة وفقاً لأحكام هذا العقد.\n4/ منح الصلاحيات اللازمة للوصول إلى حسابات التواصل الاجتماعي، والاستضافة، والنطاق (Domain)، وأي منصات أو خدمات أخرى يتطلبها تنفيذ الأعمال، مع بقاء ملكية تلك الحسابات والأصول الرقمية لصاحبها.\n5/ التعاون، والرد على الاستفسارات، وتوفير الملاحظات والاعتمادات اللازمة لضمان تنفيذ الأعمال وفق الخطة الزمنية المتفق عليها.',
  },
  {
    num: '09',
    title: 'التزامات الطرف الثاني',
    body: 'يلتزم الطرف الثاني بما يلي:\n1/ تنفيذ جميع الأعمال والخدمات محل هذا العقد وفق الأصول المهنية وأفضل الممارسات المتعارف عليها، وبما يحقق أهداف الطرف الأول.\n2/ المحافظة على سرية جميع البيانات والمعلومات والملفات التي يطلع عليها أثناء تنفيذ العقد، وعدم استخدامها أو الإفصاح عنها إلا في حدود تنفيذ الأعمال المتفق عليها.\n3/ تنفيذ الأعمال وفق المواصفات والمتطلبات التي يعتمدها الطرف الأول، والتأكد من جاهزيتها قبل التسليم.\n4/ إعداد خطة محتوى دورية، وتصميم ونشر المحتوى وفق الجدول الزمني المتفق عليه.\n5/ تقديم الدعم الفني والصيانة اللازمة طوال مدة العقد، ومعالجة أي أخطاء ناتجة عن أعماله.\n6/ التعاون مع الطرف الأول، وتقديم المشورة الفنية والتسويقية المتعلقة بالأعمال محل هذا العقد، وإشعاره بأي ملاحظات أو متطلبات قد تؤثر على جودة التنفيذ أو سير العمل.',
  },
  {
    num: '10',
    title: 'إنهاء العقد',
    fixed: true,
    body: 'يجوز لأي من الطرفين إنهاء هذا العقد في حال عدم رغبته في الاستمرار بتنفيذه، وذلك بعد إشعار الطرف الآخر كتابةً قبل خمسة عشر (15) يوماً من تاريخ الإنهاء. وفي هذه الحالة يستحق {الطرف_الآخر} قيمة الأعمال المنجزة حتى تاريخ الإنهاء.',
  },
  {
    num: '11',
    title: 'القوة القاهرة',
    fixed: true,
    body: 'لا يعد أي من الطرفين مسؤولاً عن التأخير أو عدم التنفيذ الناتج عن ظروف القوة القاهرة الخارجة عن الإرادة والتي يتعذر توقعها أو دفعها.',
  },
  {
    num: '12',
    title: 'النظام الواجب التطبيق والاختصاص',
    fixed: true,
    body: 'يخضع هذا العقد لأنظمة المملكة العربية السعودية، وتختص الجهات القضائية المختصة في المملكة بالنظر في أي نزاع ينشأ عنه.',
  },
  {
    num: '13',
    title: 'أحكام عامة',
    fixed: true,
    body: '1/ تعديل العقد: لا يجوز إجراء أي تغيير أو تعديل أو إضافة على هذا العقد إلا بموجب وثيقة مكتوبة وموقعة من ممثل معتمد عن كل طرف، وتعد جزءاً لا يتجزأ من هذا العقد، وتسري أحكامها من تاريخ توقيعها ما لم يتفق الطرفان على خلاف ذلك.\n2/ في حال وفاة أحد الأطراف: في حال وفاة أحد الأطراف -لا قدر الله- تنتقل حقوقه والتزاماته الناشئة عن هذا العقد إلى ورثته أو من يمثلهم نظاماً، وذلك بالقدر الذي تجيزه الأنظمة المعمول بها في المملكة العربية السعودية.\n3/ الاتفاق الكامل: يمثل هذا العقد كامل الاتفاق بين الطرفين فيما يتعلق بموضوعه، ويلغي جميع المفاوضات أو المراسلات أو التفاهمات السابقة، سواء كانت شفهية أو مكتوبة.\n4/ البطلان الجزئي: إذا تبين أن أي حكم من أحكام هذا العقد باطل أو غير قابل للتنفيذ بموجب الأنظمة المعمول بها في المملكة العربية السعودية، فإن ذلك لا يؤثر على صحة ونفاذ بقية أحكام العقد.\n5/ اللغة: تكون اللغة العربية هي اللغة المعتمدة في تفسير هذا العقد وتنفيذه، ويجوز للطرفين استخدام لغة أخرى في المراسلات أو الملاحق، وفي حال وجود أي تعارض تكون العبرة بالنص العربي.\n6/ القانون وحل النزاعات: يخضع هذا العقد لأنظمة المملكة العربية السعودية، وتختص الجهات القضائية المختصة في المملكة العربية السعودية بالفصل في أي نزاع ينشأ عنه، بعد بذل الطرفين جهودهما لحل النزاع ودياً خلال مدة لا تتجاوز ستين (60) يوماً من تاريخ إشعار أحدهما للآخر بوجود النزاع.\n7/ الإخطارات: تكون جميع الإخطارات والمطالبات والمراسلات المتعلقة بهذا العقد عبر البريد الإلكتروني المحدد في صدر العقد، ولا يعتد بتغيير أي طرف لبريده الإلكتروني إلا بعد إشعار الطرف الآخر كتابة قبل التغيير بما لا يقل عن خمسة عشر (15) يوماً.\n8/ السرية: يلتزم كل طرف بالمحافظة على سرية جميع المعلومات التي يطلع عليها بسبب هذا العقد، ويحظر عليه الإفصاح عنها لأي طرف ثالث بصورة مباشرة أو غير مباشرة، ويستثنى من ذلك ما يكون الإفصاح عنه واجباً بموجب الأنظمة أو بأمر من جهة قضائية أو حكومية مختصة.\n9/ الملحق الفني (Scope of Work): يرفق بهذا العقد ملحق فني يحدد نطاق الأعمال بصورة تفصيلية، ويشمل –بحسب ما ينطبق–: المنصات المشمولة بالخدمة، عدد المنشورات والتصاميم الدورية، نوع المحتوى والخطة التحريرية، مواصفات المخرجات، الجدول الزمني لتقديم الخدمات، وأي متطلبات أو مخرجات إضافية يتفق عليها الطرفان.',
  },
  {
    num: '14',
    title: 'أحكام عامة',
    fixed: true,
    body: '10/ التاريخ: التاريخ المعتمد للتعامل في هذا العقد هو التاريخ (الميلادي)، مع ضرورة الإشارة إلى التاريخ (الهجري)، في أي مكاتبات، أو تقارير، وخلافها.\n11/ نسخ العقد: حرر هذا العقد من نسختين أصليتين، تسلّم كل طرف نسخة منها للعلم والعمل بموجبها، وتُعد النسخة الموقّعة إلكترونياً داخل منصة همشة، ببصمتها وسجلها الزمني، نسخة أصلية معتمدة بين الطرفين.',
  },
]

export const SHORT_SCOPE =
  'يعمل فريق هوامش* بصفته الذراع الإبداعي والتسويقي لـ{العميل}، إذ يتولى الفريق {الهدف} بروح الفريق الداخلي الواحد. يشمل نطاق العمل: {المنصات}، وإعداد خطة محتوى شهرية، وإنتاج المحتوى المرئي والنصي بمختلف أشكاله بواقع {المنشورات} منشوراً شهرياً، وتقديم تقارير أداء دورية.'
export const SHORT_FOOTNOTE = '*عام كامل ({الأشهر} شهر) من تاريخ التوقيع، قابل للتجديد أو التوقف باتفاق من الطرفين'
export const OFFER_INTRO =
  'بناءً على ما تم تداوله في الاجتماعات التمهيدية، يقدّم {الطرف_الآخر} هذا العرض إطاراً للتعاون يحدّد نطاق الأعمال ومستوياتها وآلية تنفيذها وسدادها، ويمهّد لشراكة تُبنى على أهداف واضحة وأثر قابل للقياس. يختار {الطرف} الباقة المناسبة، ويتحول هذا العرض عند اعتماده إلى عقد بالقيمة والمدة المختارتين.'

/** Empty = must be typed; the UI shows the empty amount in grey as «مقترح». */
export function emptyContent(kind: ContractKind, counterparty: ContractPartyInfo, title: string, accent: string, legal: OrgLegal, project = ''): ContractContent {
  const signer: ContractSigner = { ...legal.signer }
  return {
    kind,
    title,
    project,
    date: todayIso(),
    counterpartySide: kind === 'full' ? 'first' : 'second',
    hawamish: { ...EMPTY_LEGAL.party, ...legal.party },
    counterparty,
    scope: kind === 'short' ? SHORT_SCOPE : kind === 'offer' ? OFFER_INTRO : '',
    sections: kind === 'full' ? FULL_SECTIONS.map((s) => ({ ...s })) : [],
    pricing: { mode: 'monthly', currency: 'SAR', monthly: 0, months: 12, projectTotal: 0, installments: [], lateDays: 7, supportMonths: 0 },
    tracks: kind === 'short' ? [{ name: 'المسار التقني وتطوير المنتج', nameEn: 'Technical & UX/UI Track', months: 12, monthly: 0, quarters: ['', '', '', ''] }] : [],
    packages: kind === 'offer' ? [1, 2, 3].map((i) => ({ name: `الباقة ${['الأولى', 'الثانية', 'الثالثة'][i - 1]}`, subtitle: '', price: 0, per: 'month' as const, items: [] })) : [],
    unitName: kind === 'offer' ? 'فيديو واحد' : '',
    unitPrice: 0,
    unitItems: [],
    bank: legal.banks[0] ? { ...legal.banks[0] } : { owner: '', account: '', iban: '', swift: '' },
    signers: { hawamish: signer, counterparty: { name: counterparty.repName, capacity: '' } },
    vars: { platforms: '', posts: 0, designs: 0, videos: 0 },
    accent,
    copyrightYear: COPYRIGHT_YEAR,
    stamp: legal.stamp || undefined,
  }
}

export function partyFromClient(c: Client): ContractPartyInfo {
  return { ...EMPTY_PARTY, name: c.name, repTitle: `ممثل ${c.name}` }
}
export function partyFromCreative(u: User): ContractPartyInfo {
  return { ...EMPTY_PARTY, name: u.name, repTitle: u.title ?? 'مبدع', repName: u.name, email: u.email }
}
export const emptyBank = (): ContractBank => ({ owner: '', account: '', iban: '', swift: '' })

// ---------- arithmetic + placeholders ----------
export function contractTotal(c: ContractContent): number {
  if (c.kind === 'short') return c.tracks.reduce((s, t) => s + t.monthly * t.months, 0)
  if (c.kind === 'offer') return 0
  if (c.pricing.mode === 'project') return c.pricing.projectTotal || c.pricing.installments.reduce((s, i) => s + i.amount, 0)
  return c.pricing.monthly * c.pricing.months
}

/** The amounts / counts a person still has to type before the contract may be sent. */
export function missingValues(c: ContractContent): string[] {
  const out: string[] = []
  if (c.kind === 'short') {
    c.tracks.forEach((t, i) => {
      if (!(t.monthly > 0)) out.push(`المبلغ الشهري للمسار ${i + 1}`)
      if (!(t.months > 0)) out.push(`مدة المسار ${i + 1}`)
    })
  } else if (c.kind === 'offer') {
    c.packages.forEach((p, i) => {
      if (!(p.price > 0)) out.push(`سعر الباقة ${i + 1}`)
    })
  } else if (c.pricing.mode === 'monthly') {
    if (!(c.pricing.monthly > 0)) out.push('المبلغ الشهري')
    if (!(c.pricing.months > 0)) out.push('عدد الأشهر')
  } else {
    if (!(contractTotal(c) > 0)) out.push('إجمالي المشروع')
    if (c.pricing.installments.some((i) => !(i.amount > 0))) out.push('مبالغ الدفعات')
  }
  if (!c.counterparty.name.trim()) out.push('اسم الطرف الآخر')
  if (!c.hawamish.cr.trim()) out.push('السجل التجاري لهوامش (الإعدادات)')
  if (!c.bank.iban.trim()) out.push('الحساب البنكي (الإعدادات)')
  if (!c.signers.hawamish.name.trim()) out.push('اسم موقّع هوامش (الإعدادات)')
  return out
}

function paymentText(c: ContractContent): string {
  const cur = currencyWord(c.pricing.currency)
  const first = c.counterpartySide === 'first' ? 'الطرف الأول' : 'الطرف الثاني'
  const other = c.counterpartySide === 'first' ? 'الطرف الثاني' : 'الطرف الأول'
  if (c.pricing.mode === 'monthly') {
    const total = contractTotal(c)
    return [
      `اتفق الطرفان على أن قيمة الخدمات محل هذا العقد تبلغ مبلغاً قدره ${amountWords(c.pricing.monthly, cur)} شهرياً، ولمدة ${monthsWords(c.pricing.months)}، بإجمالي قيمة قدرها ${amountWords(total, cur)} طوال مدة العقد، ما لم يتم إنهاؤه أو تمديده وفقاً لأحكام هذا العقد. وتكون آلية السداد على النحو التالي:`,
      `1/ يلتزم ${first} بسداد مبلغ قدره ${amountWords(c.pricing.monthly, cur)} مقدماً عند توقيع العقد، ويُعد ذلك مقابل الشهر الأول من مدة العقد.`,
      `2/ يلتزم ${first} بسداد مبلغ ${amountWords(c.pricing.monthly, cur)} مقدماً عند استحقاق كل شهر من أشهر العقد، بحيث يكون تاريخ استحقاق كل دفعة هو اليوم الموافق لتاريخ بدء سريان هذا العقد، وذلك طوال مدة العقد البالغة ${monthsWords(c.pricing.months)}.`,
      `3/ في حال تأخر ${first} عن سداد أي دفعة لمدة تتجاوز ${daysWords(c.pricing.lateDays)} من تاريخ استحقاقها، يحق لـ${other} تعليق تقديم الخدمات مؤقتاً حتى يتم السداد، دون أن يترتب على ذلك أي مسؤولية أو تعويض على ${other}، كما لا يترتب على التعليق تمديد مدة العقد إلا باتفاق مكتوب بين الطرفين.`,
    ].join('\n')
  }
  const total = contractTotal(c)
  const lines = [`اتفق الطرفان على أن إجمالي قيمة المشروع هو مبلغ ${amountWords(total, cur)}، وتكون آلية السداد على النحو التالي:`]
  c.pricing.installments.forEach((i, k) => lines.push(`${k + 1}/ مبلغاً قدره ${amountWords(i.amount, cur)} يُدفع ${i.label || '…'}.`))
  lines.push(`ويعتبر أي عمل إضافي خارج نطاق هذا العقد يستدعي عرض سعر مستقل وموافقة كتابية من ${first}.`)
  return lines.join('\n')
}

/** Replaces {placeholders} with the typed values; empty values stay visible as «…» so nothing is silently blank. */
export function fillText(text: string, c: ContractContent): string {
  const party = c.counterpartySide === 'first' ? 'الطرف الأول' : 'الطرف الثاني'
  const other = c.counterpartySide === 'first' ? 'الطرف الثاني' : 'الطرف الأول'
  const dash = (v: string | number) => (v === '' || v === 0 ? '…' : String(v))
  const months = c.kind === 'short' ? (c.tracks[0]?.months ?? 12) : c.pricing.months
  const support = c.pricing.supportMonths > 0 ? `لمدة ${monthsWords(c.pricing.supportMonths)} مجانية تبدأ من تاريخ التسليم النهائي` : 'طوال مدة سريانه'
  return text
    .replace(/\{السداد\}/g, paymentText(c))
    .replace(/\{الطرف_الآخر\}/g, other)
    .replace(/\{الطرف\}/g, party)
    .replace(/\{العميل\}/g, dash(c.counterparty.name))
    .replace(/\{الهدف\}/g, dash(c.project))
    .replace(/\{المنصات\}/g, dash(c.vars.platforms))
    .replace(/\{المنشورات\}/g, dash(c.vars.posts))
    .replace(/\{التصاميم\}/g, dash(c.vars.designs))
    .replace(/\{الفيديوهات\}/g, dash(c.vars.videos))
    .replace(/\{المدة\}/g, months > 0 ? monthsWords(months) : '…')
    .replace(/\{الأشهر\}/g, dash(months))
    .replace(/\{مدة_الدعم\}/g, support)
}

export function contractStatusTone(st: Contract['status']): string {
  return st === 'sent' || st === 'opened' ? 'bg-warning-tint text-warning-dark' : st === 'signed' || st === 'completed' ? 'bg-success-tint text-success-dark' : st === 'changes' || st === 'rejected' ? 'bg-danger-tint text-danger-dark' : 'bg-muted-bg text-fg-secondary'
}

/** Contracts a user may see on the board (the database enforces the same with RLS / the client views). */
export function visibleContracts(s: Snapshot, user: User): Contract[] {
  if (user.role === 'admin') return s.contracts
  if (user.role === 'client') return s.contracts.filter((c) => c.party === 'client' && c.clientId === user.clientId && c.status !== 'draft')
  return s.contracts.filter((c) => c.party === 'creative' && c.creativeId === user.id && c.status !== 'draft')
}
export function visibleContractVersions(s: Snapshot, user: User, contractId: string): ContractVersion[] {
  return s.contractVersions.filter((v) => v.contractId === contractId && (user.role === 'admin' || !!v.sentAt)).sort((a, b) => b.number - a.number)
}
/** What needs this role's hand right now (badge on the «العقود» switch). */
export function contractsNeedingAction(cs: Contract[], role: User['role']): number {
  if (role === 'admin') return cs.filter((c) => c.status === 'changes' || c.status === 'signed' || (c.status === 'draft' && c.currentVersion > 0)).length
  return cs.filter((c) => c.status === 'sent' || c.status === 'opened').length
}
/** A client whose admin set the block and whose latest contract is not signed sees the banner. */
export function clientBlocked(s: Snapshot, user: User): boolean {
  if (user.role !== 'client' || !user.clientId) return false
  const c = s.clients.find((x) => x.id === user.clientId)
  return !!c?.contractBlock && c.contract !== 'signed'
}
