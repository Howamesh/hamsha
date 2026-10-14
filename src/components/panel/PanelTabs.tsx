import { cn } from '@/lib/utils'
import { useUi, type PanelTab } from '@/store/ui'

export function PanelTabs({ tabs }: { tabs: Array<{ id: PanelTab; label: string; icon: React.ReactNode; badge?: number }> }) {
  const tab = useUi((s) => s.panelTab)
  const setTab = useUi((s) => s.setPanelTab)
  return (
    <div className="flex gap-1 px-4 pb-3 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cn(
            'relative flex-1 flex flex-col items-center gap-1 rounded-md py-2 cursor-pointer transition-colors',
            tab === t.id ? 'bg-muted-bg text-fg' : 'text-fg-secondary hover:text-fg',
          )}
        >
          {t.icon}
          <span className="text-[10.5px] font-semibold">{t.label}</span>
          {!!t.badge && (
            <span className="absolute top-1 end-[18%] min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-fg text-[10px] font-bold grid place-items-center">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
