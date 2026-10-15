export type Lang = 'ar' | 'en'

/** Every UI string lives here, in both languages, so Arabic is never "left over" English. */
export const STR = {
  brand: { en: 'Hamsha', ar: 'همشة' },
  master: { en: 'Master calendar', ar: 'التقويم الرئيسي' },
  month: { en: 'Month', ar: 'شهر' },
  week: { en: 'Week', ar: 'أسبوع' },
  day: { en: 'Day', ar: 'يوم' },
  today: { en: 'Today', ar: 'اليوم' },
  allDay: { en: 'All day', ar: 'طوال اليوم' },
  deliveries: { en: 'Deliveries', ar: 'التسليمات' },
  delivery: { en: 'delivery', ar: 'تسليم' },
  logout: { en: 'Log out', ar: 'تسجيل الخروج' },
  langLabel: { en: 'عربي', ar: 'EN' },

  // Login
  email: { en: 'Email', ar: 'البريد الإلكتروني' },
  password: { en: 'Password', ar: 'كلمة المرور' },
  signIn: { en: 'Sign in', ar: 'تسجيل الدخول' },
  signingIn: { en: 'Signing in…', ar: 'جارٍ الدخول…' },
  loginTitle: { en: 'Sign in to Hamsha', ar: 'الدخول إلى همشة' },
  loginSub: { en: 'Your studio calendar, tasks and team chat — in one place.', ar: 'تقويم الاستوديو ومهامك ومحادثة الفريق في مكان واحد.' },
  loginError: { en: 'Wrong email or password.', ar: 'البريد أو كلمة المرور غير صحيحة.' },
  forgot: { en: 'Forgot password?', ar: 'نسيت كلمة المرور؟' },
  demoTitle: { en: 'Try it without an account', ar: 'جرّبه بدون حساب' },
  demoAdmin: { en: 'Enter as admin', ar: 'ادخل كمدير' },
  demoCreative: { en: 'Enter as creative', ar: 'ادخل كمبدع' },
  demoClient: { en: 'Enter as client', ar: 'ادخل كعميل' },
  demoNote: { en: 'Demo mode — removed when real accounts arrive.', ar: 'وضع التجربة — يُزال عند تفعيل الحسابات الحقيقية.' },

  // Roles / badges
  roleAdmin: { en: 'Admin', ar: 'مدير' },
  roleCreative: { en: 'Creative', ar: 'مبدع' },
  roleClient: { en: 'Client', ar: 'عميل' },
  badgeMaster: { en: 'ADMIN · ALL CLIENTS', ar: 'مدير · كل العملاء' },
  badgeAdmin: { en: 'ADMIN', ar: 'مدير' },
  badgeCreative: { en: 'CREATIVE', ar: 'مبدع' },
  badgeClient: { en: 'CLIENT · READ-ONLY', ar: 'عميل · للعرض فقط' },

  // Presence
  live: { en: 'Live', ar: 'متصل' },
  notLive: { en: 'Not live', ar: 'غير متصل' },

  // Panel
  panelMaster: { en: 'Studio PMO', ar: 'إدارة الاستوديو' },
  panelSetup: { en: 'Calendar setup', ar: 'إعداد التقويم' },
  panelCreative: { en: 'My dashboard', ar: 'لوحتي' },
  panelClient: { en: 'Project dashboard', ar: 'لوحة المشروع' },
  hidePanel: { en: 'Hide panel', ar: 'إخفاء اللوحة' },
  showPanel: { en: 'Show panel', ar: 'إظهار اللوحة' },
  tabClients: { en: 'Clients', ar: 'العملاء' },
  tabSetup: { en: 'Setup', ar: 'الإعداد' },
  tabMessages: { en: 'Messages', ar: 'الرسائل' },
  tabAlerts: { en: 'Alerts', ar: 'التنبيهات' },
  tabSettings: { en: 'Settings', ar: 'الإعدادات' },
  tabHome: { en: 'Home', ar: 'الرئيسية' },
  tabProfile: { en: 'Profile', ar: 'ملفي' },
  tabInbox: { en: 'Inbox', ar: 'الوارد' },
  tabProgress: { en: 'Progress', ar: 'التقدم' },

  // KPIs
  activeClients: { en: 'Active clients', ar: 'عملاء نشطون' },
  tasksInFlight: { en: 'Tasks in flight', ar: 'مهام جارية' },
  delivered: { en: 'Delivered', ar: 'تم تسليمها' },
  overdue: { en: 'Overdue', ar: 'متأخرة' },
  clientProgress: { en: 'Client progress', ar: 'تقدم العملاء' },
  teamWorkload: { en: 'Team workload · open parts', ar: 'ضغط الفريق · أجزاء مفتوحة' },
  newClientPh: { en: 'New client calendar name…', ar: 'اسم تقويم عميل جديد…' },
  create: { en: 'Create', ar: 'إنشاء' },
  tasks: { en: 'tasks', ar: 'مهام' },
  projects: { en: 'projects', ar: 'مشاريع' },
  owner: { en: 'owner', ar: 'المسؤول' },

  // Creative home
  spark: { en: "Today's spark", ar: 'إلهام اليوم' },
  location: { en: 'Location', ar: 'الموقع' },
  myTasks: { en: 'My tasks', ar: 'مهامي' },
  dueSoon: { en: 'Due soon', ar: 'قريبة التسليم' },
  late: { en: 'Late', ar: 'متأخرة' },
  progressByClient: { en: 'Your progress by client', ar: 'تقدمك حسب العميل' },
  teamChat: { en: 'Team chat', ar: 'محادثة الفريق' },
  messagePh: { en: 'Write a message…', ar: 'اكتب رسالة…' },
  send: { en: 'Send', ar: 'إرسال' },
  partsDone: { en: 'parts done', ar: 'أجزاء منجزة' },
  of: { en: 'of', ar: 'من' },

  // Check-in
  checkinTitle: { en: 'Hi {name} — are you on?', ar: 'أهلاً {name} — جاهز تبدأ؟' },
  checkinSub: { en: 'Quick check-in before you start.', ar: 'تسجيل حضور سريع قبل البدء.' },
  liveToday: { en: 'Live today', ar: 'متصل اليوم' },
  imLive: { en: "I'm live", ar: 'أنا متصل' },
  focusFirst: { en: 'Focus on this first', ar: 'ركّز على هذا أولاً' },
  tasksToday: { en: 'Your tasks today', ar: 'مهامك اليوم' },
  openParts: { en: 'open parts', ar: 'أجزاء مفتوحة' },
  nothingToday: { en: 'Nothing scheduled for today — check the week ahead.', ar: 'لا شيء مجدول اليوم — راجع الأسبوع القادم.' },
  askTeam: { en: 'Not clear? Ask the team', ar: 'شيء غير واضح؟ اسأل الفريق' },
  imAway: { en: "I'm away", ar: 'أنا بعيد' },
  allClear: { en: 'All clear — start ✓', ar: 'كل شيء واضح — ابدأ ✓' },
  open: { en: 'Open', ar: 'فتح' },

  // Calendar
  blocked: { en: 'blocked', ar: 'محجوز' },
  energy: { en: 'Energy · from Fajr', ar: 'الطاقة · من الفجر' },
  more: { en: '+{n} more', ar: '+{n} أخرى' },
  emptyMaster: { en: 'No tasks anywhere yet — open a client calendar and drag a range to create the first one.', ar: 'لا توجد مهام بعد — افتح تقويم عميل واسحب على الأيام لإنشاء أول مهمة.' },
  emptyCreative: { en: 'Nothing assigned to you yet. New tasks will appear here.', ar: 'لم تُسند إليك مهام بعد. ستظهر المهام الجديدة هنا.' },
  emptyClient: { en: 'Your calendar is being prepared.', ar: 'تقويمك قيد التجهيز.' },
  hintAdmin: { en: 'Drag across days to create a task · drag a card to move it', ar: 'اسحب على الأيام لإنشاء مهمة · اسحب البطاقة لنقلها' },
  hintCreative: { en: 'Dates are locked — open a card to see parts and ask for help', ar: 'المواعيد مقفلة — افتح البطاقة لرؤية الأجزاء وطلب المساعدة' },

  // Alerts
  alertLate: { en: 'Overdue: {task} — {who} missed {date}', ar: 'متأخرة: {task} — {who} فات موعد {date}' },
  alertDue: { en: 'Due soon: {task} — {who} delivers by {date}', ar: 'قريبة: {task} — {who} يسلّم بحلول {date}' },
  allClearAlerts: { en: 'All clear — nothing needs you right now.', ar: 'كل شيء على ما يرام — لا شيء يحتاجك الآن.' },

  // Settings
  language: { en: 'Language', ar: 'اللغة' },
  weekStart: { en: 'Week starts on', ar: 'بداية الأسبوع' },
  monday: { en: 'Monday', ar: 'الاثنين' },
  sunday: { en: 'Sunday', ar: 'الأحد' },
  defaultView: { en: 'Default view', ar: 'العرض الافتراضي' },
  mode: { en: 'Mode', ar: 'المظهر' },
  light: { en: 'Light', ar: 'فاتح' },
  dark: { en: 'Dark', ar: 'داكن' },

  // Client setup
  allClients: { en: 'All clients', ar: 'كل العملاء' },
  calendarName: { en: 'Calendar name', ar: 'اسم التقويم' },
  projectOwner: { en: 'Project owner', ar: 'مسؤول المشروع' },
  runsFromTo: { en: 'Runs from → to', ar: 'المدة من → إلى' },
  projectsInside: { en: 'Projects inside', ar: 'المشاريع' },
  newProjectPh: { en: 'New project name…', ar: 'اسم مشروع جديد…' },
  add: { en: 'Add', ar: 'إضافة' },
  lead: { en: 'Lead', ar: 'القائد' },
  clientAccount: { en: 'Client account', ar: 'حساب العميل' },
  clientAccountHint: { en: 'Who signs in as this client', ar: 'من يدخل بصفة هذا العميل' },
  contract: { en: 'Contract', ar: 'العقد' },
  contractDraft: { en: 'Draft', ar: 'مسودة' },
  contractSent: { en: 'Sent', ar: 'مُرسل' },
  contractSigned: { en: 'Signed', ar: 'موقّع' },
  deleteClient: { en: 'Delete this client calendar', ar: 'حذف تقويم هذا العميل' },
  confirmDeleteClient: { en: 'Delete this client and all its tasks?', ar: 'حذف هذا العميل وكل مهامه؟' },
  confirmDeleteProject: { en: 'Delete this project and its tasks?', ar: 'حذف هذا المشروع ومهامه؟' },
  howToAddTasks: { en: 'To add a task: click any day on the calendar.', ar: 'لإضافة مهمة: اضغط على أي يوم في التقويم.' },

  // New task dialog
  newTask: { en: 'New task', ar: 'مهمة جديدة' },
  taskTitle: { en: 'Task title', ar: 'عنوان المهمة' },
  client: { en: 'Client', ar: 'العميل' },
  project: { en: 'Project', ar: 'المشروع' },
  taskType: { en: 'Type of task', ar: 'نوع المهمة' },
  ownerLabel: { en: 'Owner', ar: 'المسؤول' },
  startDate: { en: 'Start', ar: 'البداية' },
  deliveryDate: { en: 'Client delivery', ar: 'تسليم العميل' },
  cancel: { en: 'Cancel', ar: 'إلغاء' },
  createTask: { en: 'Create task', ar: 'إنشاء المهمة' },
  firstPart: { en: 'First part (e.g. Design)', ar: 'الجزء الأول (مثلاً: التصميم)' },

  days: { en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], ar: ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'] },
  daysLong: { en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], ar: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'] },
} as const

export type StrKey = keyof typeof STR

export const QUOTES = {
  en: [
    'Ship the small thing today — momentum beats perfection.',
    'Great work is a chain of finished parts.',
    'Deadlines are promises. Keep yours golden.',
    'One card at a time — that’s how calendars get green.',
    'Done well today beats perfect next week.',
  ],
  ar: [
    'أنجز الشيء الصغير اليوم — الاستمرارية تغلب الكمال.',
    'العمل العظيم سلسلة من الأجزاء المكتملة.',
    'المواعيد وعود — حافظ على وعدك.',
    'ركّز على بطاقة واحدة في كل مرة.',
    'إنجاز اليوم الجيد خير من كمال الأسبوع القادم.',
  ],
}

export function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
