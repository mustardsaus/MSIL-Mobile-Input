import { Icon as FbIcon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import type { HistoryLog } from '../../domain'
import { PERSONAS } from '../../store/personaStore'

interface HistoryTimelineProps {
  history: HistoryLog[]
}

function personaColor(persona: string): string {
  const found = PERSONAS.find((p) => p.id === persona)
  return found?.hex ?? '#9ca3af'
}

function actionIcon(action: string): IconName | null {
  const lower = action.toLowerCase()
  if (lower.includes('approved') || lower.includes('approve')) return 'check'
  if (lower.includes('sent back') || lower.includes('send back')) return 'undo'
  if (lower.includes('submitted') || lower.includes('submit')) return 'chevron-up'
  if (lower.includes('edit')) return 'pen'
  if (lower.includes('draft') || lower.includes('init')) return 'file-lines'
  return null
}

function actionColor(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes('approved') || lower.includes('approve')) return '#15803d'
  if (lower.includes('sent back') || lower.includes('send back')) return '#92400e'
  if (lower.includes('submitted') || lower.includes('submit')) return '#1d4ed8'
  if (lower.includes('edit')) return '#6366f1'
  return '#6b7280'
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ts
  }
}

export function HistoryTimeline({ history }: HistoryTimelineProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--color-muted)]">
        <p className="mb-2 text-[var(--color-muted)]"><FbIcon name="clipboard-list" size={28} /></p>
        <p className="text-sm">No history yet for this entry.</p>
      </div>
    )
  }

  // Show most recent first
  const sorted = [...history].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return (
    <div className="space-y-1">
      {sorted.map((log, i) => {
        const color = personaColor(log.persona)
        const icon = actionIcon(log.action)
        const aColor = actionColor(log.action)
        return (
          <div key={i} className="flex gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: color }}
                title={String(log.persona)}
              >
                {String(log.persona).slice(0, 2).toUpperCase()}
              </div>
              {i < sorted.length - 1 && (
                <div className="w-px flex-1 bg-[var(--color-border)] mt-1 mb-1" style={{ minHeight: 16 }} />
              )}
            </div>

            {/* Content */}
            <div className="pb-4 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium" style={{ color: aColor }}>
                  {icon && <FbIcon name={icon} size={12} className="mr-1" />}{log.action}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: color + '20', color }}
                >
                  {log.persona}
                </span>
                {log.actorName && (
                  <span className="text-xs font-medium text-[var(--color-text)]">{log.actorName}</span>
                )}
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{formatTimestamp(log.timestamp)}</p>
              {log.comment && (
                <p className="text-xs text-[var(--color-text)] mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 italic">
                  "{log.comment}"
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
