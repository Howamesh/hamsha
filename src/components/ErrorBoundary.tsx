import { Component, type ReactNode } from 'react'
import { IS_DEMO } from '@/data'
import { MOCK_KEYS } from '@/data/mockKeys'

interface State {
  error: Error | null
}

/** Last line of defence: a bad row must never white-screen the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[hamsha] render error', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    const ar = document.documentElement.lang === 'ar'
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-bg">
        <div className="w-[min(460px,94vw)] rounded-md border border-border bg-card p-6 flex flex-col gap-3 text-center">
          <div className="text-[16px] font-semibold">{ar ? 'حدث خطأ غير متوقع' : 'Something went wrong'}</div>
          <div className="text-[13px] text-fg-secondary">
            {ar ? 'لم تفقد بياناتك. أعد تحميل الصفحة، وإذا تكرر الخطأ أخبر المسؤول.' : 'Your data is safe. Reload the page; if it happens again, tell the admin.'}
          </div>
          <div className="flex justify-center gap-2 pt-1">
            <button type="button" onClick={() => location.reload()} className="h-[34px] px-4 rounded-md bg-fg text-bg text-[13px] font-semibold cursor-pointer">
              {ar ? 'إعادة التحميل' : 'Reload'}
            </button>
            {IS_DEMO && (
              <button
                type="button"
                onClick={() => {
                  // Demo only: clears just the demo store keys — never sessions or preferences.
                  try {
                    MOCK_KEYS.forEach((k) => localStorage.removeItem(k))
                  } catch {
                    /* ignore */
                  }
                  location.reload()
                }}
                className="h-[34px] px-4 rounded-md border border-border text-[13px] font-semibold cursor-pointer"
              >
                {ar ? 'مسح بيانات التجربة' : 'Reset demo data'}
              </button>
            )}
          </div>
          <details className="text-start">
            <summary className="text-[11.5px] text-fg-muted cursor-pointer">{ar ? 'تفاصيل تقنية' : 'Technical details'}</summary>
            <pre className="mt-1 text-[11px] text-fg-secondary whitespace-pre-wrap break-words" dir="ltr">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
