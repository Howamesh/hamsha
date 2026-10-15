import { Component, type ReactNode } from 'react'

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
          <div className="text-[12.5px] text-fg-secondary break-words" dir="ltr">
            {this.state.error.message}
          </div>
          <div className="flex justify-center gap-2 pt-1">
            <button type="button" onClick={() => location.reload()} className="h-[34px] px-4 rounded-md bg-fg text-bg text-[13px] font-semibold cursor-pointer">
              {ar ? 'إعادة التحميل' : 'Reload'}
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.clear()
                } catch {
                  /* ignore */
                }
                location.reload()
              }}
              className="h-[34px] px-4 rounded-md border border-border text-[13px] font-semibold cursor-pointer"
            >
              {ar ? 'مسح بيانات التجربة' : 'Reset demo data'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
