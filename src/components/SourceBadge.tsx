
export type SourceType =
  | 'manual'
  | 'calculated'
  | 'upload'
  | 'dropdown'
  | 'mapping'
  | 'mail'
  | 'enovia'
  | 'sap'
  | 'edoc'
  | 'regapp'

const SOURCE_META: Record<SourceType, { label: string; color: string }> = {
  manual:     { label: 'Manual',     color: '#9ca3af' },
  calculated: { label: 'Calculated', color: '#6366f1' },
  upload:     { label: 'Upload',     color: '#0891b2' },
  dropdown:   { label: 'Dropdown',   color: '#8b5cf6' },
  mapping:    { label: 'Mapping',    color: '#7c3aed' },
  mail:       { label: 'Mail',       color: '#f59e0b' },
  enovia:     { label: 'ENOVIA',     color: '#3b82f6' },
  sap:        { label: 'SAP',        color: '#1d4ed8' },
  edoc:       { label: 'E-Doc',      color: '#059669' },
  regapp:     { label: 'Reg. App',   color: '#dc2626' },
}

interface SourceBadgeProps {
  source: SourceType
  size?: 'sm' | 'md'
}

export function SourceBadge({ source, size = 'md' }: SourceBadgeProps) {
  const meta = SOURCE_META[source]
  const cls = size === 'sm' ? 'text-[10px] px-1 py-0.5' : 'text-xs px-1.5 py-0.5'
  return (
    <span
      className={`inline-flex flex-none items-center whitespace-nowrap rounded font-medium ${cls}`}
      style={{
        backgroundColor: meta.color + '20',
        color: meta.color,
        border: `1px solid ${meta.color}50`,
      }}
    >
      {meta.label}
    </span>
  )
}
