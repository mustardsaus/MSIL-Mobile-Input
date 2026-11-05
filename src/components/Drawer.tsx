import { Icon as FbIcon } from './Icon'
import { useEffect } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  side?: 'left' | 'right'
  width?: string
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
  width = 'w-96',
}: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} z-50 h-full ${width} bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          open
            ? 'translate-x-0'
            : side === 'right'
            ? 'translate-x-full'
            : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
            <button
              onClick={onClose}
              className="text-[var(--color-muted)] hover:text-[var(--color-text)] rounded p-1 focus:outline-none"
              aria-label="Close"
            >
              <FbIcon name="close" size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </>
  )
}
