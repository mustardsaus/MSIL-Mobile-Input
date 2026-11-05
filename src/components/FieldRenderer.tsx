/**
 * Field Renderer Registry
 *
 * Keyed by FieldType. Each entry provides a read-only preview renderer
 * and (for Sub-task 4) a full editable renderer.
 *
 * Sub-task 4 (Workspace) should:
 *   1. Import `fieldRendererRegistry`
 *   2. Look up `fieldRendererRegistry[field.type]`
 *   3. Render `.editor(props)` when the field is editable by the current persona
 *      or `.preview(props)` for read-only display.
 *
 * API:
 *   fieldRendererRegistry[fieldType].preview({ field, value })
 *   fieldRendererRegistry[fieldType].editor({ field, value, onChange, disabled })
 */

import type { ReactElement } from 'react'
import type { FieldDefinition } from '../domain'

export interface FieldRendererProps {
  field: FieldDefinition
  value: any
  onChange?: (val: any) => void
  disabled?: boolean
  className?: string
  /** Current persona — used by the `table` field so a column can be owned by a different role. */
  currentPersona?: string
}

export type FieldRendererFn = (props: FieldRendererProps) => ReactElement

export interface FieldRendererEntry {
  /** Read-only display (used in preview panel) */
  preview: FieldRendererFn
  /** Editable control (Sub-task 4 workspace) */
  editor: FieldRendererFn
}

// ── Helper atoms ──────────────────────────────────────────────────────────────

function PreviewValue({ value, fallback = '—' }: { value: any; fallback?: string }) {
  const display = value === null || value === undefined || value === '' ? fallback : String(value)
  return <span className="text-[var(--color-text)] text-sm">{display}</span>
}

function FieldWrapper({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <label className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">{label}</label>
      <div>{children}</div>
    </div>
  )
}

function inputClass(disabled?: boolean) {
  return `w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-sm max-md:text-base bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] ${disabled ? 'opacity-60 cursor-not-allowed bg-[var(--color-surface)]' : ''}`
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const fieldRendererRegistry: Record<string, FieldRendererEntry> = {
  text: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <PreviewValue value={value} />
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={inputClass(disabled)}
        />
      </FieldWrapper>
    ),
  },

  longText: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <PreviewValue value={value} />
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          rows={3}
          className={`${inputClass(disabled)} resize-y`}
        />
      </FieldWrapper>
    ),
  },

  number: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <PreviewValue value={value} />
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.valueAsNumber)}
          disabled={disabled}
          className={inputClass(disabled)}
        />
      </FieldWrapper>
    ),
  },

  percent: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <PreviewValue value={value !== null && value !== undefined ? `${value}%` : null} />
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.valueAsNumber)}
            disabled={disabled}
            className={`${inputClass(disabled)} w-24`}
          />
          <span className="text-sm text-[var(--color-muted)]">%</span>
        </div>
      </FieldWrapper>
    ),
  },

  date: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <PreviewValue value={value} />
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={inputClass(disabled)}
        />
      </FieldWrapper>
    ),
  },

  yesNo: {
    preview: ({ field, value }) => {
      const display = value === 'Y' ? 'Yes' : value === 'N' ? 'No' : value ?? '—'
      const color = value === 'Y' ? '#15803d' : value === 'N' ? '#b91c1c' : '#57606a'
      return (
        <FieldWrapper label={field.label}>
          <span className="text-sm font-medium" style={{ color }}>{display}</span>
        </FieldWrapper>
      )
    },
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <select
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={inputClass(disabled)}
        >
          <option value="">— Select —</option>
          <option value="Y">Yes</option>
          <option value="N">No</option>
        </select>
      </FieldWrapper>
    ),
  },

  dropdown: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <PreviewValue value={value} />
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <select
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={inputClass(disabled)}
        >
          <option value="">— Select —</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </FieldWrapper>
    ),
  },

  multiSelect: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <PreviewValue value={Array.isArray(value) ? value.join(', ') : value} />
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => {
      const selected: string[] = Array.isArray(value) ? value : []
      function toggle(opt: string) {
        if (disabled) return
        const next = selected.includes(opt)
          ? selected.filter((s) => s !== opt)
          : [...selected, opt]
        onChange?.(next)
      }
      return (
        <FieldWrapper label={field.label}>
          <div className="flex flex-wrap gap-1.5">
            {field.options?.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                disabled={disabled}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${selected.includes(opt) ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'bg-white text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </FieldWrapper>
      )
    },
  },

  file: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        {value ? (
          <span className="text-xs text-primary underline">{value}</span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">No file uploaded</span>
        )}
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(`mock-upload-${field.key}-${Date.now()}.pdf`)}
            className={`px-3 py-1.5 text-xs border border-[var(--color-border)] rounded bg-white text-[var(--color-text)] hover:bg-[var(--color-surface)] ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Upload file
          </button>
          {value && <span className="text-xs text-[var(--color-muted)]">{value}</span>}
        </div>
      </FieldWrapper>
    ),
  },

  flag: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <span className={`text-sm font-medium ${value ? 'text-destructive' : 'text-[var(--color-muted)]'}`}>
          {value ? 'Flagged' : 'Clear'}
        </span>
      </FieldWrapper>
    ),
    editor: ({ field, value, onChange, disabled }) => (
      <FieldWrapper label={field.label}>
        <button
          type="button"
          onClick={() => onChange?.(!value)}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs rounded border transition-colors ${value ? 'bg-[#fef2f2] border-[#fca5a5] text-destructive' : 'bg-white border-[var(--color-border)] text-[var(--color-muted)]'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {value ? 'Flagged ✕' : 'Flag'}
        </button>
      </FieldWrapper>
    ),
  },

  button: {
    preview: ({ field }) => (
      <FieldWrapper label={field.label}>
        <button type="button" disabled className="px-3 py-1 text-xs border border-[var(--color-border)] rounded text-[var(--color-muted)] bg-[var(--color-surface)]">
          {field.label}
        </button>
      </FieldWrapper>
    ),
    editor: ({ field, onChange }) => (
      <FieldWrapper label={field.label}>
        <button
          type="button"
          onClick={() => onChange?.(true)}
          className="px-3 py-1 text-xs bg-[var(--color-accent)] text-white rounded hover:opacity-90"
        >
          {field.label}
        </button>
      </FieldWrapper>
    ),
  },

  table: {
    preview: ({ field, value }) => {
      const cols = field.columns ?? []
      const rows: Record<string, any>[] = Array.isArray(value) ? value : []
      return (
        <FieldWrapper label={field.label}>
          {rows.length === 0 ? (
            <span className="text-xs text-[var(--color-muted)]">No rows</span>
          ) : (
            <div className="overflow-x-auto rounded border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--color-surface)]">
                    <th className="px-2 py-1 text-left font-medium text-[var(--color-muted)] w-12">Sl.</th>
                    {cols.map((c) => (
                      <th key={c.key} className="px-2 py-1 text-left font-medium text-[var(--color-muted)] max-md:min-w-[128px]">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1 text-[var(--color-muted)] whitespace-nowrap">{r._sl ?? i + 1}</td>
                      {cols.map((c) => (
                        <td key={c.key} className="px-2 py-1 text-[var(--color-text)]">{r[c.key] ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FieldWrapper>
      )
    },
    editor: ({ field, value, onChange, disabled, currentPersona }) => {
      const cols = field.columns ?? []
      const rows: Record<string, any>[] = Array.isArray(value) ? value : []
      const fieldOwner = field.enteredBy
      // A column is editable when its owner (its own enteredBy, else the field's) matches the current persona,
      // and the field itself isn't disabled by the workflow.
      const colEditable = (c: typeof cols[number]) => {
        if (disabled) return false
        const owner = c.enteredBy ?? fieldOwner
        return !currentPersona || owner === currentPersona || owner === undefined
      }
      // The current persona may add/remove rows only if it owns at least one non-System column.
      const canAddRows = !disabled && !field.derivedRows && cols.some((c) => colEditable(c) && (c.enteredBy ?? fieldOwner) !== 'System')

      const update = (next: Record<string, any>[]) => onChange?.(next)
      const addRow = () => update([...rows, Object.fromEntries(cols.map((c) => [c.key, '']))])
      const removeRow = (i: number) => update(rows.filter((_, idx) => idx !== i))
      const setCell = (i: number, key: string, v: any) =>
        update(rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)))

      return (
        <FieldWrapper label={field.label}>
          <div className="overflow-x-auto rounded border border-[var(--color-border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--color-surface)]">
                  <th className="px-2 py-1 text-left font-medium text-[var(--color-muted)] w-12">Sl.</th>
                  {cols.map((c) => (
                    <th key={c.key} className="px-2 py-1 text-left font-medium text-[var(--color-muted)] max-md:min-w-[128px]">{c.label}</th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={cols.length + 2} className="px-2 py-3 text-center text-[var(--color-muted)]">{field.derivedRows ? (field.derivedRows.from === 'sap' ? 'No rows yet. They come from SAP: use Fetch.' : field.derivedRows.from === 'count' ? 'No rows yet. Enter a Disagree count above and one row appears for each disagreed point.' : 'No rows. Rows come from the matching rows of the earlier activity.') : 'No rows yet.'}</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1 text-[var(--color-muted)] whitespace-nowrap">{r._sl ?? i + 1}</td>
                    {cols.map((c) => {
                      const editable = colEditable(c)
                      return (
                        <td key={c.key} className="px-1 py-1 max-md:min-w-[128px]">
                          {c.type === 'dropdown' ? (
                            <select
                              value={r[c.key] ?? ''}
                              disabled={!editable}
                              onChange={(e) => setCell(i, c.key, e.target.value)}
                              className="w-full rounded border border-[var(--color-border)] bg-white px-1.5 py-1 text-xs disabled:bg-[var(--color-surface)] disabled:opacity-70"
                            >
                              <option value="">—</option>
                              {(c.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                              value={r[c.key] ?? ''}
                              disabled={!editable}
                              onChange={(e) => setCell(i, c.key, e.target.value)}
                              className="w-full rounded border border-[var(--color-border)] bg-white px-1.5 py-1 text-xs disabled:bg-[var(--color-surface)] disabled:opacity-70"
                            />
                          )}
                        </td>
                      )
                    })}
                    <td className="px-1 py-1 text-center">
                      {canAddRows && (
                        <button type="button" onClick={() => removeRow(i)} className="text-[var(--color-destructive)] hover:underline text-xs" title="Remove row">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canAddRows && (
            <button type="button" onClick={addRow} className="mt-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)]">
              + Add row
            </button>
          )}
        </FieldWrapper>
      )
    },
  },

  derived: {
    preview: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <div className="flex items-center gap-1.5">
          <PreviewValue value={value} />
          <span className="text-xs text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">calculated</span>
        </div>
      </FieldWrapper>
    ),
    editor: ({ field, value }) => (
      <FieldWrapper label={field.label}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-[var(--color-text)]">{value ?? '—'}</span>
          <span className="text-xs text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">calculated</span>
        </div>
      </FieldWrapper>
    ),
  },
}

/** Convenience: get renderer entry, falling back to text if unknown */
export function getFieldRenderer(type: string): FieldRendererEntry {
  return fieldRendererRegistry[type] ?? fieldRendererRegistry['text']
}
