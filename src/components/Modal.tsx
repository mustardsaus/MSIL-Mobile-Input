import { Icon as FbIcon } from './Icon'
import { useEffect, useRef } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(2,6,23,.5)] p-5"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className={`w-full ${sizeClasses[size]} rounded-xl bg-white shadow-[0_20px_60px_rgba(2,6,23,.35)] flex flex-col max-h-[90vh]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <h2 id="modal-title" className="text-[15px] font-semibold text-[var(--color-text)]">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
              aria-label="Close"
            >
              <FbIcon name="close" size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
        {footer && (
          <div className="border-t border-[var(--color-border)] px-5 py-3 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
