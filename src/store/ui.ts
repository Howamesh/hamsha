import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '@/lib/i18n'
import type { WeekStart } from '@/lib/dates'
import { todayIso, type IsoDate } from '@/lib/dates'

export type View = 'month' | 'week' | 'day'
export type PanelTab = 'main' | 'messages' | 'alerts' | 'settings' | 'profile'

interface UiState {
  lang: Lang
  theme: 'light' | 'dark'
  weekStart: WeekStart
  view: View
  /** Focused date (drives month/week/day) */
  focus: IsoDate
  /** Admin: which client calendar is open (null = master) */
  calId: string | null
  panelOpen: boolean
  panelTab: PanelTab
  taskId: string | null
  checkinOpen: boolean

  setLang: (l: Lang) => void
  setTheme: (t: 'light' | 'dark') => void
  setWeekStart: (w: WeekStart) => void
  setView: (v: View) => void
  setFocus: (d: IsoDate) => void
  setCalId: (id: string | null) => void
  togglePanel: (open?: boolean) => void
  setPanelTab: (t: PanelTab) => void
  openTask: (id: string | null) => void
  setCheckin: (open: boolean) => void
  /** Clear everything tied to the signed-in user (on sign-out / user switch) */
  resetForUser: () => void
  toast: string | null
  setToast: (m: string | null) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      lang: 'ar',
      theme: 'light',
      weekStart: 'monday',
      view: 'month',
      focus: todayIso(),
      calId: null,
      panelOpen: true,
      panelTab: 'main',
      taskId: null,
      checkinOpen: false,

      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setWeekStart: (weekStart) => set({ weekStart }),
      setView: (view) => set({ view }),
      setFocus: (focus) => set({ focus }),
      setCalId: (calId) => set({ calId, panelTab: 'main' }),
      togglePanel: (open) => set((s) => ({ panelOpen: open ?? !s.panelOpen })),
      setPanelTab: (panelTab) => set({ panelTab, panelOpen: true }),
      openTask: (taskId) => set({ taskId }),
      setCheckin: (checkinOpen) => set({ checkinOpen }),
      resetForUser: () => set({ calId: null, taskId: null, panelTab: 'main', checkinOpen: false }),
      toast: null,
      setToast: (toast) => set({ toast }),
    }),
    {
      name: 'hamsha.ui',
      partialize: (s) => ({ lang: s.lang, theme: s.theme, weekStart: s.weekStart, view: s.view, panelOpen: s.panelOpen }),
    },
  ),
)

/** Translate helper bound to the current language. */
export function useT() {
  const lang = useUi((s) => s.lang)
  return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' } as const
}
