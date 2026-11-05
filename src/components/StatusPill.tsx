export type StatusValue =
  | 'Draft'
  | 'Submitted'
  | 'SentBack'
  | 'Approved'
  | 'Overdue'
  | 'NotStarted'

// Colours follow EPMP's badge palette (.b-ontrack / .b-atrisk / .b-delayed / .b-completed / .b-notstarted).
const STATUS_META: Record<StatusValue, { label: string; bg: string; text: string; border: string }> = {
  Draft:      { label: 'Draft',       bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' },
  Submitted:  { label: 'Submitted',   bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  SentBack:   { label: 'Sent Back',   bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  Approved:   { label: 'Approved',    bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  Overdue:    { label: 'Overdue',     bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  NotStarted: { label: 'Not Started', bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' },
}

interface StatusPillProps {
  status: StatusValue
  size?: 'sm' | 'md'
}

/** EPMP badge: 6px radius, hairline border, leading status dot. */
export function StatusPill({ status, size = 'md' }: StatusPillProps) {
  const meta = STATUS_META[status]
  const padding = size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]'
  return (
    <span
      className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border font-medium ${padding}`}
      style={{ backgroundColor: meta.bg, color: meta.text, borderColor: meta.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}
