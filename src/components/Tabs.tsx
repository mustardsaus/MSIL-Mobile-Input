import { useEffect, useRef } from 'react'

export interface TabItem {
  id: string
  label: string
  badge?: number | string
}

interface TabsProps {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
  className?: string
}

/** EPMP tab bar: white rounded strip, active tab is a pale-blue pill with a blue border. */
export function Tabs({ items, activeId, onChange, className = '' }: TabsProps) {
  // Pivot: when the strip scrolls sideways (phones), the selected tab slides to the centre so its
  // neighbours on both sides come into view.
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const bar = ref.current
    const btn = bar?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!bar || !btn || bar.scrollWidth <= bar.clientWidth) return
    bar.scrollTo({ left: btn.offsetLeft - bar.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' })
  }, [activeId])
  return (
    <div
      ref={ref}
      className={`relative flex w-fit max-w-full flex-wrap gap-1 overflow-x-auto rounded-xl bg-white p-1.5 [scrollbar-width:none] ${className}`}
      role="tablist"
    >
      {items.map((item) => {
        const isActive = item.id === activeId
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={`flex-none whitespace-nowrap rounded-lg border px-4 py-2.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] ${
              isActive
                ? 'border-[#bfdbfe] bg-[var(--color-secondary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-muted)] hover:bg-[#f4f4f7]'
            }`}
          >
            {item.label}
            {item.badge !== undefined && (
              <span
                className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] ${
                  isActive ? 'bg-white text-[var(--color-primary)]' : 'bg-[#f3f4f6] text-[var(--color-ink-muted)]'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
