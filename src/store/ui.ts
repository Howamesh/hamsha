import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '@/lib/i18n'
import type { WeekStart } from '@/lib/dates'
import { todayIso, type IsoDate } from '@/lib/dates'

export type View = 'month' | 'week' | 'day'
export type PanelTab = 'main' | 'messages' | 'alerts' | 'settings' | 'profile'
/** The big area shows the calendar or the social board (the right-side menu switches it instantly). */
export type Workspace = 'calendar' | 'social'

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
  workspace: Workspace
  /** Social: the post opened in the sheet (null = none) */
  postId: string | null

  setLang: (l: Lang) => void
  setTheme: (t: 'light' | 'dark') => void
  setWeekStart: (w: WeekStart) => void
  setView: (v: View) => void
  setFocus: (d: IsoDate) => void
  setCalId: (id: string | null) => void
  togglePanel: (open?: boolean) => void
  setPanelTab: (t: PanelTab) => void
  openTask: (id: string | null) => void
  setWorkspace: (w: Workspace) => void
  openPost: (id: string | null) => void
  setCheckin: (open: boolean) => void
  /** Clear everything tied to the signed-in user (on sign-out / user switch) */
  resetForUser: () => void
  toast: string | null
  toastKind: 'error' | 'info'
  setToast: (m: string | null, kind?: 'error' | 'info') => void
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
      workspace: 'calendar',
      postId: null,

      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setWeekStart: (weekStart) => set({ weekStart }),
      setView: (view) => set({ view }),
      setFocus: (focus) => set({ focus }),
      setCalId: (calId) => set({ calId, panelTab: 'main', taskId: null, postId: null }), // leaving a calendar closes its task/post sheet
      togglePanel: (open) => set((s) => ({ panelOpen: open ?? !s.panelOpen })),
      setPanelTab: (panelTab) => set({ panelTab, panelOpen: true }),
      openTask: (taskId) => set((s) => ({ taskId, workspace: taskId ? 'calendar' : s.workspace })), // a task always opens over the calendar
      setWorkspace: (workspace) => set({ workspace, taskId: null, postId: null }),
      openPost: (postId) => set({ postId }),
      setCheckin: (checkinOpen) => set({ checkinOpen }),
      resetForUser: () => set({ calId: null, taskId: null, postId: null, workspace: 'calendar', panelTab: 'main', checkinOpen: false }),
      toast: null,
      toastKind: 'error',
      setToast: (toast, kind = 'error') => set({ toast, toastKind: kind }),
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
