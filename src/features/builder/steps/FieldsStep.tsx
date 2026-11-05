import { Icon as FbIcon } from '../../../components/Icon'
/**
 * Step 2: Fields Designer
 *
 * Table-style field designer with:
 * - Add / remove / reorder (up/down) fields
 * - Group fields into sections
 * - Per field: label, type, options, mandatory, enteredBy, source, validatedBy,
 *   conditionalRule, showOnDashboard, kpiRole, showInPartList, showInDrillList
 * - For fetched sources: pick system + attribute from the mock catalogue
 * - Common part fields always shown (locked, greyed out)
 */

import { useState } from 'react'
import type { BuilderDraft, DerivedRows, ValidationRule, FieldDefinition, FieldType, FieldSource, KpiRole, TableColumn } from '../../../domain'
import { useQAStore } from '../../../store/qaStore'
import { rowsFromCount } from '../../../engine'
import type { PersonaId } from '../../../store/personaStore'
import { PERSONAS } from '../../../store/personaStore'
import { Button } from '../../../components'
import { ATTRIBUTE_CATALOGUE } from '../../../mock/attributeCatalogue'
import { canBeListColumn } from '../../listColumns'

interface FieldsStepProps {
  draft: BuilderDraft
  onChange: (updates: Partial<BuilderDraft>) => void
}

// Common part fields always present (locked)
const COMMON_FIELDS: Array<{ key: string; label: string; type: FieldType }> = [
  { key: 'model', label: 'Model', type: 'text' },
  { key: 'part_no', label: 'Part No.', type: 'text' },
  { key: 'part_name', label: 'Part Name', type: 'text' },
  { key: 'vendor_code', label: 'Vendor Code', type: 'text' },
  { key: 'vendor_name', label: 'Vendor Name', type: 'text' },
  { key: 'department', label: 'Department', type: 'text' },
  { key: 'mrd', label: 'MRD', type: 'date' },
]

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longText', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'percent', label: 'Percent' },
  { value: 'date', label: 'Date' },
  { value: 'yesNo', label: 'Yes / No' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multiSelect', label: 'Multi-select' },
  { value: 'file', label: 'File upload' },
  { value: 'flag', label: 'Flag' },
  { value: 'button', label: 'Action button' },
  { value: 'derived', label: 'Derived (calculated)' },
  { value: 'table', label: 'Table (list of rows)' },
]

const SOURCES: { value: FieldSource; label: string; fetched?: boolean }[] = [
  { value: 'manual', label: 'Manual entry' },
  { value: 'calculated', label: 'Calculated by system' },
  { value: 'upload', label: 'Upload' },
  { value: 'dropdown', label: 'Dropdown mapping' },
  { value: 'mapping', label: 'Mapping table' },
  { value: 'mail', label: 'Via email' },
  { value: 'enovia', label: 'ENOVIA (fetched)', fetched: true },
  { value: 'sap', label: 'SAP (fetched)', fetched: true },
  { value: 'edoc', label: 'E-Doc (fetched)', fetched: true },
  { value: 'regapp', label: 'Regulatory App (fetched)', fetched: true },
]

const FETCHED_SOURCES: FieldSource[] = ['enovia', 'sap', 'edoc', 'regapp']

const KPI_ROLES: { value: KpiRole; label: string }[] = [
  { value: null, label: '— none —' },
  { value: 'status', label: 'Status indicator' },
  { value: 'date', label: 'Date / Timeline' },
  { value: 'count', label: 'Count / Number' },
  { value: 'percentage', label: 'Percentage / Accuracy' },
  { value: 'category', label: 'Category grouping' },
]

function newField(index: number): FieldDefinition {
  return {
    key: `field_${Date.now()}_${index}`,
    label: '',
    type: 'text',
    mandatory: false,
    enteredBy: 'PIC',
    source: 'manual',
    validatedBy: null,
    showOnDashboard: false,
    kpiRole: null,
    options: [],
    conditionalRules: [],
  }
}

const thCls = 'px-2 py-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide bg-[var(--color-surface)] border-b border-[var(--color-border)]'
const tdCls = 'px-2 py-1.5 border-b border-[var(--color-border)] align-top'

const selectCls = 'border border-[var(--color-border)] rounded px-2 py-1 text-xs bg-white text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] w-full'
const inputCls  = 'border border-[var(--color-border)] rounded px-2 py-1 text-xs bg-white text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] w-full'

export function FieldsStep({ draft, onChange }: FieldsStepProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [optionsInput, setOptionsInput] = useState<Record<string, string>>({})

  const fields = draft.fields

  function setFields(next: FieldDefinition[]) {
    onChange({ fields: next })
  }

  function addField() {
    setFields([...fields, newField(fields.length)])
  }

  function removeField(key: string) {
    setFields(fields.filter((f) => f.key !== key))
    if (expandedKey === key) setExpandedKey(null)
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...fields]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setFields(next)
  }

  function moveDown(idx: number) {
    if (idx === fields.length - 1) return
    const next = [...fields]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setFields(next)
  }

  function updateField(key: string, updates: Partial<FieldDefinition>) {
    setFields(fields.map((f) => (f.key === key ? { ...f, ...updates } : f)))
  }

  function parseOptions(key: string, raw: string) {
    setOptionsInput((prev) => ({ ...prev, [key]: raw }))
    const opts = raw.split(',').map((s) => s.trim()).filter(Boolean)
    updateField(key, { options: opts })
  }

  return (
    <div className="space-y-4">
      {/* Common fields (locked) */}
      <div>
        <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
          Common Part Fields <span className="font-normal normal-case">(always included, locked)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {COMMON_FIELDS.map((cf) => (
            <span key={cf.key} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-muted)]">
              <FbIcon name="lock" size={12} className="mr-1" />{cf.label}
            </span>
          ))}
        </div>
      </div>

      {/* Activity fields */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">
            Activity Fields ({fields.length})
          </div>
          <Button variant="secondary" size="sm" onClick={addField}>
            + Add Field
          </Button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded text-sm">
            No fields yet. Click "+ Add Field" to start.
          </div>
        ) : (
          <div className="border border-[var(--color-border)] rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr>
                    <th className={`${thCls} w-6`}>#</th>
                    <th className={`${thCls} w-32`}>Source *</th>
                    <th className={`${thCls} w-48`}>Name / Attribute *</th>
                    <th className={`${thCls} w-28`}>Type</th>
                    <th className={`${thCls} w-24`}>Entered By</th>
                    <th className={`${thCls} w-24`}>Validated By</th>
                    <th className={`${thCls} w-14 text-center`}>Req.</th>
                    <th className={`${thCls} w-16 text-center`} title="Vendor can see this field (read-only). Vendors always see fields they enter; PIC sees all fields.">Vendor sees</th>
                    <th className={`${thCls} w-16 text-center`} title="Data only: fed by SAP / ENOVIA per part and used by dashboards; never shown on an input form.">Data only</th>
                    <th className={`${thCls} w-14 text-center`}>Dash.</th>
                    <th
                      className={`${thCls} w-16 text-center`}
                      title="Also show this field as a column in the Workspace part list"
                    >
                      Part list
                    </th>
                    <th
                      className={`${thCls} w-16 text-center`}
                      title="Also show this field as a column in the dashboard drill-down View parts list"
                    >
                      Drill-down
                    </th>
                    <th className={`${thCls} w-24`}>KPI Role</th>
                    <th className={`${thCls} w-16 text-center`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, idx) => (
                    <>
                      <tr
                        key={field.key}
                        className={expandedKey === field.key ? 'bg-secondary/70' : 'hover:bg-[var(--color-surface)]/60'}
                      >
                        {/* Row number + reorder */}
                        <td className={tdCls}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs text-[var(--color-muted)]">{idx + 1}</span>
                            <button
                              onClick={() => moveUp(idx)}
                              disabled={idx === 0}
                              className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 leading-none"
                              title="Move up"
                            ><FbIcon name="chevron-up" size={14} /></button>
                            <button
                              onClick={() => moveDown(idx)}
                              disabled={idx === fields.length - 1}
                              className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 leading-none"
                              title="Move down"
                            ><FbIcon name="chevron-down" size={14} /></button>
                          </div>
                        </td>

                        {/* Source — chosen first; it drives how the name is entered */}
                        <td className={tdCls}>
                          <select
                            value={field.source}
                            onChange={(e) => {
                              const nextSource = e.target.value as FieldSource
                              // Switching away from a fetched source drops the fetched attribute + label so
                              // the user re-enters a manual name; switching between fetched sources also resets it.
                              const wasFetched = FETCHED_SOURCES.includes(field.source)
                              const nowFetched = FETCHED_SOURCES.includes(nextSource)
                              updateField(field.key, {
                                source: nextSource,
                                ...(wasFetched || nowFetched
                                  ? { fetchedAttributeKey: undefined, label: '' } as any
                                  : {})
                              })
                            }}
                            className={selectCls}
                          >
                            {SOURCES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Name / Attribute — a text label for manual sources, a catalogue dropdown for fetched ones */}
                        <td className={tdCls}>
                          {FETCHED_SOURCES.includes(field.source) ? (
                            (() => {
                              const cat = ATTRIBUTE_CATALOGUE.filter((a) => a.system === field.source)
                              const picked = (field as any).fetchedAttributeKey ?? ''
                              return (
                                <select
                                  value={picked}
                                  onChange={(e) => {
                                    const entry = cat.find((a) => a.key === e.target.value)
                                    updateField(field.key, {
                                      fetchedAttributeKey: e.target.value,
                                      ...(entry ? { type: entry.type, label: entry.label, ...(entry.options ? { options: entry.options } : {}) } : {})
                                    } as any)
                                  }}
                                  className={`${selectCls} ${!picked ? 'border-[#fca5a5]' : ''}`}
                                >
                                  <option value="">— pick field —</option>
                                  {cat.map((a) => (
                                    <option key={a.key} value={a.key}>{a.label}</option>
                                  ))}
                                </select>
                              )
                            })()
                          ) : (
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => updateField(field.key, { label: e.target.value })}
                              placeholder="Field name"
                              className={`${inputCls} ${!field.label.trim() ? 'border-[#fca5a5]' : ''}`}
                            />
                          )}
                        </td>

                        {/* Type — auto-set for fetched fields (locked), chosen for manual ones */}
                        <td className={tdCls}>
                          <select
                            value={field.type}
                            onChange={(e) => updateField(field.key, { type: e.target.value as FieldType })}
                            className={selectCls}
                            disabled={FETCHED_SOURCES.includes(field.source)}
                            title={FETCHED_SOURCES.includes(field.source) ? 'Type comes from the selected attribute' : undefined}
                          >
                            {FIELD_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Entered By */}
                        <td className={tdCls}>
                          <select
                            value={field.enteredBy}
                            onChange={(e) => updateField(field.key, { enteredBy: e.target.value as PersonaId | 'System' })}
                            className={selectCls}
                          >
                            <option value="System">System</option>
                            {PERSONAS.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Validated By */}
                        <td className={tdCls}>
                          <select
                            value={field.validatedBy ?? ''}
                            onChange={(e) => updateField(field.key, { validatedBy: (e.target.value || null) as PersonaId | null })}
                            className={selectCls}
                          >
                            <option value="">— none —</option>
                            {PERSONAS.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Mandatory */}
                        <td className={`${tdCls} text-center`}>
                          <input
                            type="checkbox"
                            checked={field.mandatory}
                            onChange={(e) => updateField(field.key, { mandatory: e.target.checked })}
                            className="w-4 h-4 accent-[var(--color-accent)]"
                          />
                        </td>

                        {/* Visible to vendor */}
                        <td className={`${tdCls} text-center`}>
                          <input
                            type="checkbox"
                            checked={field.enteredBy === 'Vendor' || field.visibleToVendor === true}
                            disabled={field.enteredBy === 'Vendor'}
                            onChange={(e) => updateField(field.key, { visibleToVendor: e.target.checked })}
                            className="w-4 h-4 accent-[var(--color-accent)]"
                            aria-label={`Vendor can see ${field.label || 'field'}`}
                            title={field.enteredBy === 'Vendor' ? 'Vendors always see the fields they enter' : 'Let the vendor see this field (read-only)'}
                          />
                        </td>
                        {/* Data only (system-fed, not on the form) */}
                        <td className={`${tdCls} text-center`}>
                          <input
                            type="checkbox"
                            checked={field.dataOnly === true}
                            onChange={(e) =>
                              updateField(
                                field.key,
                                e.target.checked
                                  ? { dataOnly: true, enteredBy: 'System', mandatory: false, validatedBy: null, visibleToVendor: false, showOnDashboard: true, source: field.source === 'manual' ? 'sap' : field.source }
                                  : { dataOnly: false }
                              )
                            }
                            className="w-4 h-4 accent-[var(--color-accent)]"
                            aria-label={`${field.label || 'Field'} is data only, not shown on the form`}
                            title="Fed by the system per part for dashboards; never shown on an input form"
                          />
                        </td>
                        {/* Show on dashboard */}
                        <td className={`${tdCls} text-center`}>
                          <input
                            type="checkbox"
                            checked={field.showOnDashboard}
                            onChange={(e) => updateField(field.key, { showOnDashboard: e.target.checked })}
                            className="w-4 h-4 accent-[var(--color-accent)]"
                          />
                        </td>

                        {/* Show as a column in the Workspace part list */}
                        <td className={`${tdCls} text-center`}>
                          <input
                            type="checkbox"
                            checked={canBeListColumn(field) && !field.dataOnly && field.showInPartList === true}
                            disabled={!canBeListColumn(field) || field.dataOnly === true}
                            onChange={(e) => updateField(field.key, { showInPartList: e.target.checked })}
                            className="w-4 h-4 accent-[var(--color-accent)]"
                            aria-label={`Show ${field.label || 'field'} in the part list`}
                            title={canBeListColumn(field) ? undefined : 'File and button fields cannot be list columns'}
                          />
                        </td>

                        {/* Show as a column in the dashboard drill-down list */}
                        <td className={`${tdCls} text-center`}>
                          <input
                            type="checkbox"
                            checked={canBeListColumn(field) && field.showInDrillList === true}
                            disabled={!canBeListColumn(field)}
                            onChange={(e) => updateField(field.key, { showInDrillList: e.target.checked })}
                            className="w-4 h-4 accent-[var(--color-accent)]"
                            aria-label={`Show ${field.label || 'field'} in the drill-down list`}
                            title={canBeListColumn(field) ? undefined : 'File and button fields cannot be list columns'}
                          />
                        </td>

                        {/* KPI Role */}
                        <td className={tdCls}>
                          <select
                            value={field.kpiRole ?? ''}
                            onChange={(e) => updateField(field.key, { kpiRole: (e.target.value || null) as KpiRole })}
                            className={selectCls}
                            disabled={!field.showOnDashboard}
                          >
                            {KPI_ROLES.map((r) => (
                              <option key={String(r.value)} value={r.value ?? ''}>{r.label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Actions */}
                        <td className={`${tdCls} text-center`}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setExpandedKey(expandedKey === field.key ? null : field.key)}
                              className="text-xs text-[var(--color-accent)] hover:underline"
                              title="More options"
                            >
                              {expandedKey === field.key ? 'Less' : 'More'}
                            </button>
                            <button
                              onClick={() => removeField(field.key)}
                              className="text-xs text-destructive hover:text-destructive"
                              title="Remove field"
                            >
                              <FbIcon name="close" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row: options, fetched attribute, conditional rule */}
                      {expandedKey === field.key && (
                        <tr key={`${field.key}-expanded`} className="bg-secondary/50">
                          <td colSpan={12} className="px-4 py-3 border-b border-[var(--color-border)]">
                            <FieldExpandedOptions
                              field={field}
                              onUpdate={(u) => updateField(field.key, u)}
                              optionsRaw={optionsInput[field.key] ?? field.options?.join(', ') ?? ''}
                              onOptionsChange={(raw) => parseOptions(field.key, raw)}
                              allFields={fields}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <ValidationRulesEditor
        fields={fields}
        rules={draft.validationRules ?? []}
        onChange={(next) => onChange({ validationRules: next })}
      />
    </div>
  )
}
/** Builder UI for sum-matching validation rules (e.g. Agree + Disagree = Total). */
function ValidationRulesEditor({ fields, rules, onChange }: { fields: FieldDefinition[]; rules: ValidationRule[]; onChange: (next: ValidationRule[]) => void }) {
  const tables = fields.filter((f) => f.type === 'table' && (f.columns ?? []).some((c) => c.type === 'number'))
  const numberFields = fields.filter((f) => f.type === 'number' || f.type === 'percent')
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<string>('fields') // 'fields' or a table field key
  const [left, setLeft] = useState<string[]>([])
  const [right, setRight] = useState<string[]>([])
  const [op, setOp] = useState<ValidationRule['op']>('=')
  const [message, setMessage] = useState('')
  const sel = 'rounded border border-[var(--color-border)] bg-white px-1.5 py-1 text-xs'

  // What can be picked as an operand in the chosen scope.
  const options: { key: string; label: string }[] =
    scope === 'fields'
      ? [
          ...numberFields.map((f) => ({ key: f.key, label: f.label || f.key })),
          ...tables.flatMap((t) =>
            (t.columns ?? []).filter((c) => c.type === 'number').map((c) => ({ key: `${t.key}.${c.key}`, label: `${t.label} › ${c.label} (total of all rows)` }))
          )
        ]
      : (tables.find((t) => t.key === scope)?.columns ?? []).filter((c) => c.type === 'number').map((c) => ({ key: c.key, label: c.label }))
  const labelOf = (k: string, sc: ValidationRule['scope']) => {
    if (sc === 'fields') {
      const [fk, col] = k.split('.')
      const f = fields.find((x) => x.key === fk)
      return col ? `${f?.label ?? fk} › ${f?.columns?.find((c) => c.key === col)?.label ?? col}` : f?.label ?? fk
    }
    const t = fields.find((x) => x.key === sc.tableField)
    return t?.columns?.find((c) => c.key === k)?.label ?? k
  }
  const sentence = (r: ValidationRule) =>
    `${r.left.map((k) => labelOf(k, r.scope)).join(' + ')} ${r.op === '=' ? '=' : r.op === '<=' ? '≤' : '≥'} ${r.right.map((k) => labelOf(k, r.scope)).join(' + ')}` +
    (r.scope === 'fields' ? '' : ` — checked on every row of “${fields.find((f) => f.key === (r.scope as { tableField: string }).tableField)?.label}”`)
  const reset = () => { setLeft([]); setRight([]); setOp('='); setMessage(''); setOpen(false) }
  const canAdd = left.length > 0 && right.length > 0
  const chips = (list: string[], set: (v: string[]) => void) => (
    <div className="flex flex-wrap items-center gap-1">
      {list.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[11px] ring-1 ring-[var(--color-border)]">
          {i > 0 && <span className="text-[var(--color-muted)]">+</span>}
          {options.find((o) => o.key === k)?.label ?? k}
          <button type="button" onClick={() => set(list.filter((x) => x !== k))} aria-label="Remove" className="text-[var(--color-destructive)]"><FbIcon name="close" size={14} /></button>
        </span>
      ))}
      <select value="" onChange={(e) => e.target.value && set([...list, e.target.value])} className={sel} aria-label="Add a field to this side">
        <option value="">+ add</option>
        {options.filter((o) => !list.includes(o.key)).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  )
  return (
    <div className="mt-5 rounded-lg border border-[var(--color-border)] bg-white p-3.5" data-tour="validation-rules">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--color-text)]">Validation rules ({rules.length})</h3>
        {!open && <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>+ Add rule</Button>}
      </div>
      <p className="mb-2 text-[11px] text-[var(--color-muted)]">
        Make numbers add up, e.g. Agree + Disagree = Total. Users see the message while editing and cannot Save or Submit until it holds.
      </p>
      {rules.length === 0 && !open && <p className="text-xs italic text-[var(--color-muted)]">No rules yet.</p>}
      <ul className="space-y-1.5">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded bg-[var(--color-surface)] px-2.5 py-1.5 text-xs">
            <span><span className="mr-1.5 rounded bg-[#dbeafe] px-1.5 py-0.5 text-[10px] font-semibold text-[#1e40af]">SUM</span>{sentence(r)}{r.message && <em className="ml-2 text-[var(--color-muted)]">“{r.message}”</em>}</span>
            <button type="button" onClick={() => onChange(rules.filter((x) => x.id !== r.id))} className="text-[var(--color-destructive)] hover:underline">Remove</button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="mt-2.5 space-y-2 rounded border border-dashed border-[var(--color-border)] p-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 font-medium">Applies to</span>
            <select value={scope} onChange={(e) => { setScope(e.target.value); setLeft([]); setRight([]) }} className={sel} aria-label="Rule scope">
              <option value="fields">Fields of the activity (and column totals)</option>
              {tables.map((t) => <option key={t.key} value={t.key}>Each row of “{t.label}”</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 font-medium">Sum of</span>
            {chips(left, setLeft)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 font-medium">must be</span>
            <select value={op} onChange={(e) => setOp(e.target.value as ValidationRule['op'])} className={sel} aria-label="Comparison">
              <option value="=">equal to</option>
              <option value="<=">not more than</option>
              <option value=">=">at least</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 font-medium">the sum of</span>
            {chips(right, setRight)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 font-medium">Message</span>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional. Leave blank to show the sums, e.g. “Agree + Disagree (7) must equal Total (5)”" className={`${sel} min-w-[320px] flex-1`} />
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!canAdd}
              onClick={() => {
                onChange([...rules, { id: `rule-${Date.now().toString(36)}`, scope: scope === 'fields' ? 'fields' : { tableField: scope }, left, op, right, ...(message.trim() ? { message: message.trim() } : {}) }])
                reset()
              }}
            >
              Add rule
            </Button>
            <Button variant="secondary" size="sm" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Expanded options row ──────────────────────────────────────────────────────

interface ExpandedProps {
  field: FieldDefinition
  onUpdate: (u: Partial<FieldDefinition>) => void
  optionsRaw: string
  onOptionsChange: (raw: string) => void
  allFields: FieldDefinition[]
}

/** "Count rows of a table where a column equals a value", e.g. Tier-2 suppliers whose status is Red. */
function CountRowsEditor({ field, onUpdate, allFields }: { field: FieldDefinition; onUpdate: (u: Partial<FieldDefinition>) => void; allFields: FieldDefinition[] }) {
  const c = field.countRows
  const tables = allFields.filter((f) => f.type === 'table')
  const table = tables.find((t) => t.key === c?.tableField)
  const col = table?.columns?.find((x) => x.key === c?.column)
  const sel = 'rounded border border-[var(--color-border)] bg-white px-1.5 py-1 text-xs'
  const set = (next: Partial<NonNullable<FieldDefinition['countRows']>>) =>
    onUpdate({ countRows: { tableField: c?.tableField ?? '', column: c?.column ?? '', equals: c?.equals ?? '', ...next } })
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="mb-1 font-medium text-[var(--color-text)]">Calculated as: count of table rows</div>
      {tables.length === 0 ? (
        <p className="text-[var(--color-muted)]">Add a table field first.</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span>Rows of</span>
            <select value={c?.tableField ?? ''} onChange={(e) => set({ tableField: e.target.value, column: '', equals: '' })} className={sel} aria-label="Table to count">
              <option value="">— pick table —</option>
              {tables.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span>where</span>
            <select value={c?.column ?? ''} onChange={(e) => set({ column: e.target.value, equals: '' })} className={sel} aria-label="Column to match">
              <option value="">— pick column —</option>
              {(table?.columns ?? []).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <span>is</span>
            {col?.type === 'dropdown' ? (
              <select value={c?.equals ?? ''} onChange={(e) => set({ equals: e.target.value })} className={sel} aria-label="Value to match">
                <option value="">(blank)</option>
                {(col.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input value={c?.equals ?? ''} onChange={(e) => set({ equals: e.target.value })} placeholder="(blank)" className={`${sel} w-32`} aria-label="Value to match" />
            )}
          </div>
          {c?.tableField && c.column && (
            <p className="text-[11px] text-[var(--color-muted)]">
              Count of rows in “{table?.label}” where “{col?.label}” is {c.equals ? `“${c.equals}”` : 'blank'}. Updates itself as the table changes.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
function FieldExpandedOptions({ field, onUpdate, optionsRaw, onOptionsChange, allFields }: ExpandedProps) {
  const isFetched = FETCHED_SOURCES.includes(field.source)
  const needsOptions = ['dropdown', 'multiSelect'].includes(field.type)
  const catalogueForSource = ATTRIBUTE_CATALOGUE.filter((a) => a.system === field.source)

  // Conditional rule (one rule per field for simplicity in builder)
  const rule = field.conditionalRules?.[0]

  function updateRule(updates: Partial<NonNullable<typeof rule>>) {
    const base = rule ?? { dependsOn: '', operator: 'equals' as const, value: '', action: 'show' as const }
    onUpdate({ conditionalRules: [{ ...base, ...updates }] })
  }

  function clearRule() {
    onUpdate({ conditionalRules: [] })
  }

  if (field.type === 'table') {
    return <TableColumnsEditor field={field} onUpdate={onUpdate} allFields={allFields} />
  }

  return (
    <div className="grid grid-cols-3 gap-4 text-xs">
      {/* Column 1: Options / Fetched attribute */}
      <div className="space-y-2">
        {field.type === 'number' && field.source === 'calculated' && <CountRowsEditor field={field} onUpdate={onUpdate} allFields={allFields} />}
        {needsOptions && !isFetched && (
          <div>
            <div className="font-medium text-[var(--color-text)] mb-1">Options (comma-separated)</div>
            <input
              type="text"
              value={optionsRaw}
              onChange={(e) => onOptionsChange(e.target.value)}
              placeholder="e.g. Available, Not available"
              className={inputCls}
            />
            {field.options && field.options.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {field.options.map((opt) => (
                  <span key={opt} className="px-2 py-0.5 bg-white border border-[var(--color-border)] rounded text-[10px]">{opt}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {isFetched && (
          <div>
            <div className="font-medium text-[var(--color-text)] mb-1">Fetched Attribute</div>
            {catalogueForSource.length === 0 ? (
              <span className="text-[var(--color-muted)]">No attributes in catalogue for this source.</span>
            ) : (field as any).fetchedAttributeKey ? (
              <div className="text-[var(--color-muted)]">
                Pulling <strong className="text-[var(--color-text)]">{field.label || (field as any).fetchedAttributeKey}</strong> from{' '}
                {field.source.toUpperCase()} ({field.type}). Change it from the <strong>Name / Attribute</strong> dropdown in the row.
              </div>
            ) : (
              <span className="text-[var(--color-muted)]">Pick the field from the <strong>Name / Attribute</strong> dropdown in the row.</span>
            )}
          </div>
        )}
      </div>

      {/* Column 2: Conditional rule */}
      <div className="space-y-2">
        <div className="font-medium text-[var(--color-text)] mb-1">
          Conditional Rule
          {rule && (
            <button onClick={clearRule} className="ml-2 text-destructive hover:text-destructive font-normal">remove</button>
          )}
        </div>

        {!rule ? (
          <button
            onClick={() => updateRule({ dependsOn: '', operator: 'equals', value: '', action: 'show' })}
            className="text-[var(--color-accent)] hover:underline"
          >
            + Add rule
          </button>
        ) : (
          <div className="space-y-1.5">
            <div>
              <div className="text-[var(--color-muted)] mb-0.5">Depends on field</div>
              <select
                value={rule.dependsOn}
                onChange={(e) => updateRule({ dependsOn: e.target.value })}
                className={selectCls}
              >
                <option value="">— select field —</option>
                {allFields.filter((f) => f.key !== field.key).map((f) => (
                  <option key={f.key} value={f.key}>{f.label || f.key}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <div className="text-[var(--color-muted)] mb-0.5">Operator</div>
                <select
                  value={rule.operator}
                  onChange={(e) => updateRule({ operator: e.target.value as any })}
                  className={selectCls}
                >
                  <option value="equals">equals</option>
                  <option value="notEquals">not equals</option>
                  <option value="greaterThan">&gt;</option>
                  <option value="lessThan">&lt;</option>
                  <option value="contains">contains</option>
                </select>
              </div>
              <div>
                <div className="text-[var(--color-muted)] mb-0.5">Value</div>
                <input
                  type="text"
                  value={rule.value ?? ''}
                  onChange={(e) => updateRule({ value: e.target.value })}
                  placeholder="value"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <div className="text-[var(--color-muted)] mb-0.5">Then</div>
              <select
                value={rule.action}
                onChange={(e) => updateRule({ action: e.target.value as any })}
                className={selectCls}
              >
                <option value="show">Show this field</option>
                <option value="hide">Hide this field</option>
                <option value="makeMandatory">Make mandatory</option>
                <option value="makeOptional">Make optional</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Column 3: Section label */}
      <div className="space-y-2">
        <div className="font-medium text-[var(--color-text)] mb-1">Section / Group</div>
        <input
          type="text"
          value={(field as any).section ?? ''}
          onChange={(e) => onUpdate({ section: e.target.value } as any)}
          placeholder="e.g. Vendor Input, PIC Review"
          className={inputCls}
        />
        <div className="text-[var(--color-muted)]">
          Fields with the same section label are grouped together in the workspace form.
        </div>
      </div>
    </div>
  )
}

// ── Table columns editor (for a `table` field) ────────────────────────────────

const COL_TYPES: { value: TableColumn['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longText', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
]

const otherTableLabel = (all: FieldDefinition[], key: string) => all.find((f) => f.key === key)?.label ?? key
const otherColLabel = (all: FieldDefinition[], key: string, col: string) =>
  all.find((f) => f.key === key)?.columns?.find((c) => c.key === col)?.label ?? col
/** Builder UI for "where do this table's rows come from": typed in, or derived from SAP / a count / another activity. */
function DerivedRowsEditor({ field, onUpdate, allFields }: { field: FieldDefinition; onUpdate: (u: Partial<FieldDefinition>) => void; allFields: FieldDefinition[] }) {
  const activities = useQAStore((st) => st.activities)
  const d = field.derivedRows
  const mode = d?.from ?? 'typed'
  const otherTables = allFields.filter((f) => f.type === 'table' && f.key !== field.key)
  const set = (next: DerivedRows | undefined) => onUpdate({ derivedRows: next })
  const changeMode = (m: string) => {
    if (m === 'typed') set(undefined)
    else if (m === 'sap') onUpdate({ derivedRows: { from: 'sap' }, source: 'sap' })
    else if (m === 'count') {
      const src = otherTables[0]
      set({ from: 'count', fieldKey: src?.key ?? '', countColumn: '', labelColumn: '', targetLabelColumn: '' })
    } else set({ from: 'activity', activityId: '', fieldKey: '', where: { column: '', equals: '' } })
  }
  const sel = 'rounded border border-[var(--color-border)] bg-white px-1.5 py-1 text-xs'
  const srcTable = d?.from === 'count' ? otherTables.find((t) => t.key === d.fieldKey) : undefined
  const srcCols = srcTable?.columns ?? []
  const otherAct = d?.from === 'activity' ? activities.find((a) => a.id === d.activityId) : undefined
  const otherActTables = (otherAct?.fields ?? []).filter((f) => f.type === 'table')
  const otherActCols = otherActTables.find((t) => t.key === (d?.from === 'activity' ? d.fieldKey : ''))?.columns ?? []
  const myCols = field.columns ?? []
  // Live proof for the "count" rule: sample counts 2 and 1 give 3 rows, numbered per category.
  const sample =
    d?.from === 'count' && d.countColumn && d.labelColumn && d.targetLabelColumn
      ? rowsFromCount(
          [{ [d.labelColumn]: 'Category A', [d.countColumn]: 2 }, { [d.labelColumn]: 'Category B', [d.countColumn]: 1 }],
          d
        )
      : []
  return (
    <div className="mb-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="font-medium text-[var(--color-text)]">Rows come from</span>
        <select value={mode} onChange={(e) => changeMode(e.target.value)} className={sel} aria-label="Where the table rows come from">
          <option value="typed">Typed in by the user (Add row)</option>
          <option value="count" disabled={otherTables.length === 0}>One row per count in another table of this activity</option>
          <option value="sap">Fetched from SAP</option>
          <option value="activity">Rows of another activity’s table</option>
        </select>
        {d && <span className="rounded bg-[#dcfce7] px-1.5 py-0.5 text-[10px] font-semibold text-[#166534]">Derived rows on · no Add / Remove row</span>}
      </div>
      {d?.from === 'count' && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-medium">Count rows from</span>
            <select value={d.fieldKey} onChange={(e) => set({ ...d, fieldKey: e.target.value, countColumn: '', labelColumn: '' })} className={sel} aria-label="Source table">
              {otherTables.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <span>using the number in</span>
            <select value={d.countColumn} onChange={(e) => set({ ...d, countColumn: e.target.value })} className={sel} aria-label="Count column">
              <option value="">— pick count column —</option>
              {srcCols.filter((c) => c.type === 'number').map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-medium">Link to the row</span>
            <span>Copy</span>
            <select value={d.labelColumn} onChange={(e) => set({ ...d, labelColumn: e.target.value })} className={sel} aria-label="Source label column">
              <option value="">— pick source column —</option>
              {srcCols.filter((c) => c.type === 'text').map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <span>into</span>
            <select value={d.targetLabelColumn} onChange={(e) => set({ ...d, targetLabelColumn: e.target.value })} className={sel} aria-label="Column that receives the label">
              <option value="">— pick this table’s column —</option>
              {myCols.filter((c) => c.type === 'text' && true).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        </div>
      )}
      {d?.from === 'sap' && <p className="text-[var(--color-muted)]">Rows are loaded with the field’s Fetch button (source set to SAP). Columns marked “System” are filled from SAP.</p>}
      {d?.from === 'activity' && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Activity</span>
          <select value={d.activityId} onChange={(e) => set({ ...d, activityId: e.target.value, fieldKey: '', where: { column: '', equals: '' } })} className={sel}>
            <option value="">— pick —</option>
            {activities.filter((a) => a.fields.some((f) => f.type === 'table')).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span>Table</span>
          <select value={d.fieldKey} onChange={(e) => set({ ...d, fieldKey: e.target.value, where: { column: '', equals: '' } })} className={sel}>
            <option value="">— pick —</option>
            {otherActTables.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <span>Only rows where</span>
          <select value={d.where.column} onChange={(e) => set({ ...d, where: { ...d.where, column: e.target.value } })} className={sel}>
            <option value="">— pick —</option>
            {otherActCols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <span>=</span>
          <input value={d.where.equals} onChange={(e) => set({ ...d, where: { ...d.where, equals: e.target.value } })} placeholder="value" className={`${sel} w-40`} />
        </div>
      )}
      {d?.from === 'count' && (
        <div className="mt-2">
          {sample.length > 0 ? (
            <>
              <div className="mb-1 text-[11px] text-[var(--color-muted)]">Check: if “{srcTable?.label}” has Category A = 2 and Category B = 1, this table gets {sample.length} rows —</div>
              <table className="text-[11px]">
                <thead>
                  <tr className="text-[var(--color-muted)]">
                    <th className="px-2 text-left">Sl.</th>
                    <th className="px-2 text-left">{myCols.find((c) => c.key === d.targetLabelColumn)?.label}</th>
                  </tr>
                </thead>
                <tbody>{sample.map((r, i) => <tr key={i}><td className="px-2">{r._sl}</td><td className="px-2">{r[d.targetLabelColumn]}</td></tr>)}</tbody>
              </table>
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">Serial numbers (1.1, 1.2, 2.1…) are added by the system and follow the source rows. The linked column is read-only; the other columns are filled per row.</p>
            </>
          ) : (
            <p className="text-[11px] text-[#b45309]">Pick all four settings above to see how the rows will be generated.</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Comma-separated options for a dropdown column. It keeps what is being typed (including a trailing comma or space)
 * and only turns it into the options list as you type; re-joining the list on every keystroke would swallow the comma.
 */
function ColumnOptionsInput({ options, onCommit }: { options: string[]; onCommit: (options: string[]) => void }) {
  const [raw, setRaw] = useState(options.join(', '))
  return (
    <input
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value)
        onCommit(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))
      }}
      placeholder="e.g. Safety, Emission, Durability"
      className={inputCls}
      aria-label="Dropdown options, separated by commas"
    />
  )
}

function TableColumnsEditor({ field, onUpdate, allFields }: { field: FieldDefinition; onUpdate: (u: Partial<FieldDefinition>) => void; allFields: FieldDefinition[] }) {
  const cols = field.columns ?? []
  const d = field.derivedRows
  const setCols = (next: TableColumn[]) => onUpdate({ columns: next })

  const addCol = () =>
    setCols([...cols, { key: `col_${Date.now().toString(36)}`, label: '', type: 'text' }])
  const removeCol = (key: string) => setCols(cols.filter((c) => c.key !== key))
  const updateCol = (key: string, u: Partial<TableColumn>) =>
    setCols(cols.map((c) => (c.key === key ? { ...c, ...u } : c)))

  return (
    <div className="text-xs">
      <DerivedRowsEditor field={field} onUpdate={onUpdate} allFields={allFields} />
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-medium text-[var(--color-text)]">Table columns</span>
        <Button variant="secondary" size="sm" onClick={addCol}>+ Add column</Button>
      </div>
      <p className="mb-2 text-[11px] text-[var(--color-muted)]">
        Each row the user adds has these columns. A column can be owned by a different persona than the field —
        e.g. the Vendor lists the rows while the PIC fills a “Reason for acceptance” column.
      </p>
      {cols.length === 0 ? (
        <div className="rounded border border-dashed border-[var(--color-border)] py-4 text-center text-[var(--color-muted)]">
          No columns yet. Click “+ Add column”.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-[var(--color-border)]">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--color-surface)] text-[var(--color-muted)]">
                <th className="px-2 py-1.5 text-left font-medium">Column label</th>
                <th className="px-2 py-1.5 text-left font-medium w-28">Type</th>
                <th className="px-2 py-1.5 text-left font-medium">Options (if dropdown)</th>
                <th className="px-2 py-1.5 text-left font-medium w-28">Filled by</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {cols.map((c) => (
                <tr key={c.key} className="border-t border-[var(--color-border)]">
                  <td className="px-1 py-1">
                    <input
                      value={c.label}
                      onChange={(e) => updateCol(c.key, { label: e.target.value })}
                      placeholder="e.g. SOR point"
                      className={`${inputCls} ${!c.label.trim() ? 'border-[#fca5a5]' : ''}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select value={c.type} onChange={(e) => updateCol(c.key, { type: e.target.value as TableColumn['type'] })} className={selectCls}>
                      {COL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    {c.type === 'dropdown' ? (
                      <ColumnOptionsInput
                        options={c.options ?? []}
                        onCommit={(options) => updateCol(c.key, { options })}
                      />
                    ) : (
                      <span className="text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    {d?.from === 'count' && c.key === d.targetLabelColumn ? (
                      <span className="inline-block rounded bg-[#dcfce7] px-1.5 py-1 text-[10px] font-medium text-[#166534]" title="Filled by the system">
                        <><FbIcon name="link" size={12} className="mr-1" />{`from ${otherTableLabel(allFields, d.fieldKey)} › ${otherColLabel(allFields, d.fieldKey, d.labelColumn)}`}</>
                      </span>
                    ) : (
                    <select
                      value={c.enteredBy ?? ''}
                      onChange={(e) => updateCol(c.key, { enteredBy: (e.target.value || undefined) as PersonaId | 'System' | undefined })}
                      className={selectCls}
                    >
                      <option value="">Same as field</option>
                      <option value="System">System</option>
                      {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    )}
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button type="button" onClick={() => removeCol(c.key)} className="text-destructive hover:underline" aria-label="Remove column"><FbIcon name="close" size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
