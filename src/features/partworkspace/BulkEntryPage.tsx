import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Button } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore, getPersonaScope } from '../../store/personaStore'
import type { PersonaId } from '../../store/personaStore'
import { getFilteredData } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { buildRowModel, entryColumns, formatValue, isEmptyValue } from '../mywork/gridModel'
import type { RowModel } from '../mywork/gridModel'
import { CellEditor } from '../mywork/GridCell'
import { EMPTY_FILTERS } from '../dashboard/drill'
import type { GlobalFilters, FieldDefinition, PartRecord } from '../../domain'
import { DEMO_TODAY } from '../scope'
import { isUpcoming, useUpcomingOnly, UpcomingToggle } from '../upcoming'
import { UploadReport } from '../excel/UploadReport'
import type { UploadSummary } from '../excel/UploadReport'
import { applyUpload, downloadFillTemplate } from '../excel/fillSheet'
import type { FillColumn, FillRow } from '../excel/fillSheet'
import { downloadBlob } from '../excel/xlsxIO'
import { excelFillable } from '../excel/cellValues'
import { actorLabel } from '../excel/audit'

const selCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] text-[#344054]'

/** One activity's contribution to the flat column list: its definition + the PIC-entered fields. */
interface ActivityCols {
  rowId: string // template row id
  activityId: string
  name: string
  milestoneId: string
  columns: FieldDefinition[]
}

export function BulkEntryPage() {
  const { activities, entries, templateRows, models, parts, updateEntryValues, logAudit } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const role = currentPersona as PersonaId
  const isPic = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'
  const scope = getPersonaScope(currentPersona)
  const upcomingOnly = useUpcomingOnly()

  // ── Filters ────────────────────────────────────────────────────────────────
  const [modelFilter, setModelFilter] = useState('All')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [milestoneFilter, setMilestoneFilter] = useState('All')
  const [partFilter, setPartFilter] = useState('All')

  const scopeParts = useMemo(
    () => parts.filter((p) => !p.supersededBy && (!scope.section || p.section === scope.section) && (!scope.vendor || p.vendorName === scope.vendor)),
    [parts, scope.section, scope.vendor]
  )
  const modelOpts = useMemo(() => Array.from(new Set(scopeParts.map((p) => p.model).filter(Boolean))).sort(), [scopeParts])
  const vendorOpts = useMemo(() => Array.from(new Set(scopeParts.map((p) => p.vendorName).filter(Boolean))).sort(), [scopeParts])
  const milestoneOpts = useMemo(() => Array.from(new Set(templateRows.map((r) => r.milestoneId))).sort(), [templateRows])
  const partOpts = useMemo(
    () =>
      scopeParts
        .filter((p) => (modelFilter === 'All' || p.model === modelFilter) && (vendorFilter === 'All' || p.vendorName === vendorFilter))
        .sort((a, b) => a.partNo.localeCompare(b.partNo)),
    [scopeParts, modelFilter, vendorFilter]
  )

  const filters = useMemo<GlobalFilters>(
    () => ({ ...EMPTY_FILTERS, model: modelFilter, vendor: vendorFilter, milestone: milestoneFilter, section: scope.section ?? 'All' }),
    [modelFilter, vendorFilter, milestoneFilter, scope.section]
  )

  // All (part × activity) instances for the current filters.
  const instances = useMemo<FilteredInstance[]>(() => {
    let out = getFilteredData(entries, activities, parts, templateRows, models, filters, 'overview', DEMO_TODAY)
    if (partFilter !== 'All') out = out.filter((i) => i.part.partNo === partFilter)
    // PIC default: only activities due or starting in the next 30 days (the checkbox turns this off).
    if (upcomingOnly) out = out.filter((i) => isUpcoming(i.dates))
    return out
  }, [entries, activities, parts, templateRows, models, filters, partFilter, upcomingOnly])

  const order = ['PP', 'MPP', 'Pilot', 'SOP']

  // The flat, ordered list of activities (template rows) present in the data, each with its PIC columns.
  const activityCols = useMemo<ActivityCols[]>(() => {
    const seen = new Map<string, FilteredInstance>()
    for (const inst of instances) if (!seen.has(inst.row.id)) seen.set(inst.row.id, inst)
    return Array.from(seen.values())
      .sort(
        (a, b) =>
          (order.indexOf(a.row.milestoneId) + 1 || 99) - (order.indexOf(b.row.milestoneId) + 1 || 99) ||
          a.activity.id.localeCompare(b.activity.id, undefined, { numeric: true })
      )
      .map((inst) => ({
        rowId: inst.row.id,
        activityId: inst.activity.id,
        name: inst.activity.name,
        milestoneId: inst.row.milestoneId,
        columns: entryColumns(inst.activity, role)
      }))
      .filter((a) => a.columns.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, role])

  // Parts (rows). For each part, a map of its instance per activity template row.
  const partRows = useMemo(() => {
    const byPart = new Map<string, { part: PartRecord; byRow: Map<string, FilteredInstance> }>()
    for (const inst of instances) {
      const e = byPart.get(inst.part.partNo) ?? { part: inst.part, byRow: new Map() }
      e.byRow.set(inst.row.id, inst)
      byPart.set(inst.part.partNo, e)
    }
    return Array.from(byPart.values()).sort((a, b) => a.part.partNo.localeCompare(b.part.partNo))
  }, [instances])

  // ── Staged edits, keyed "<rowId>|<partNo>" ──────────────────────────────────
  const [edits, setEdits] = useState<Record<string, Record<string, any>>>({})
  const [toast, setToast] = useState<string | null>(null)

  const setCell = (rowId: string, partNo: string, key: string, value: any) =>
    setEdits((prev) => {
      const k = `${rowId}|${partNo}`
      return { ...prev, [k]: { ...prev[k], [key]: value } }
    })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function saveAll() {
    let saved = 0
    for (const [k, e] of Object.entries(edits)) {
      if (!e || Object.keys(e).length === 0) continue
      const [rowId, partNo] = k.split('|')
      updateEntryValues(rowId, partNo, e, role)
      saved += 1
    }
    setEdits({})
    showToast(saved === 0 ? 'Nothing to save.' : `Saved ${saved} entr${saved === 1 ? 'y' : 'ies'}.`)
  }

  // ── Excel template and bulk upload: one sheet row per part, every activity's fields as columns ──
  const [upload, setUpload] = useState<UploadSummary | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)
  const excelInput = useRef<HTMLInputElement>(null)
  const excelColumns: FillColumn[] = activityCols.flatMap((a) =>
    a.columns.filter(excelFillable).map((c) => ({ id: `${a.rowId}:${c.key}`, header: `${a.name} · ${c.label}`, field: c }))
  )
  const excelRows: FillRow[] = partRows.map(({ part, byRow }) => {
    const models = new Map<string, RowModel>()
    for (const [rowId, inst] of byRow) models.set(rowId, buildRowModel(inst, role, edits[`${rowId}|${part.partNo}`] ?? {}, 'enter'))
    const split = (colId: string) => {
      const i = colId.lastIndexOf(':')
      return { rowId: colId.slice(0, i), key: colId.slice(i + 1) }
    }
    return {
      partNo: part.partNo,
      section: part.section,
      partName: part.partName,
      model: part.model,
      editable: (colId) => {
        const { rowId, key } = split(colId)
        const m = models.get(rowId)
        return !!m && !!m.editable[key] && m.cond[key]?.visible !== false
      },
      value: (colId) => {
        const { rowId, key } = split(colId)
        return models.get(rowId)?.values[key]
      }
    }
  })
  const excelMeta = { screen: 'bulk-entry', role }
  async function downloadExcelTemplate() {
    setExcelBusy(true)
    try {
      const blob = await downloadFillTemplate({
        title: 'Bulk Entry Grid · all activities',
        note: 'One row per part; each activity\'s fields are columns named "Activity · Field". A grey cell is not editable for that part.',
        meta: excelMeta,
        columns: excelColumns,
        rows: excelRows
      })
      downloadBlob(blob, `bulk-entry_${role}_template.xlsx`)
      logAudit({ persona: role, actorName: actorLabel(role), action: 'Excel template downloaded', detail: `Bulk Entry Grid, ${excelRows.length} part${excelRows.length !== 1 ? 's' : ''}, ${excelColumns.length} columns` })
    } finally {
      setExcelBusy(false)
    }
  }
  async function uploadExcel(file: File | undefined) {
    if (!file) return
    setExcelBusy(true)
    try {
      const summary = await applyUpload(file, excelMeta, excelColumns, excelRows, (row, colId, value) => {
        const i = colId.lastIndexOf(':')
        setCell(colId.slice(0, i), row.partNo, colId.slice(i + 1), value)
      })
      setUpload(summary)
      logAudit({
        persona: role,
        actorName: actorLabel(role),
        action: 'Excel upload staged',
        detail: `Bulk Entry Grid, ${file.name}: ${summary.cellsStaged} value${summary.cellsStaged !== 1 ? 's' : ''} on ${summary.rowsApplied} part${summary.rowsApplied !== 1 ? 's' : ''} staged for review, ${summary.issues.length} left out`
      })
    } finally {
      setExcelBusy(false)
      if (excelInput.current) excelInput.current.value = ''
    }
  }
  const dirtyCount = Object.values(edits).filter((e) => e && Object.keys(e).length > 0).length
  const totalCols = activityCols.reduce((n, a) => n + a.columns.length, 0)

  if (!isPic) {
    return (
      <div>
        <PageHeader title="Bulk Entry Grid" section="Workspace" description="Fill every activity of every part in one grid." />
        <Card><p className="py-8 text-center text-sm text-[var(--color-muted)]">This screen is for the PIC role.</p></Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Bulk Entry Grid"
        section="Workspace"
        description="One grid — parts down the rows, every activity's fields across the columns. The Part column and headers stay fixed; scroll right for more activities."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <UpcomingToggle />
            <Link to="/data-entry" className="inline-flex items-center rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text)] hover:bg-[#fafafa]">
              ← Parts Data Entry
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <section className="epmp-card mb-4 px-4 py-3.5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Model</span>
            <select value={modelFilter} onChange={(e) => { setModelFilter(e.target.value); setPartFilter('All') }} className={selCls}>
              <option value="All">All models</option>
              {modelOpts.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Vendor</span>
            <select value={vendorFilter} onChange={(e) => { setVendorFilter(e.target.value); setPartFilter('All') }} className={selCls}>
              <option value="All">All vendors</option>
              {vendorOpts.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Milestone</span>
            <select value={milestoneFilter} onChange={(e) => setMilestoneFilter(e.target.value)} className={selCls}>
              <option value="All">All milestones</option>
              {milestoneOpts.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Part</span>
            <select value={partFilter} onChange={(e) => setPartFilter(e.target.value)} className={selCls}>
              <option value="All">All parts</option>
              {partOpts.map((p) => <option key={p.partNo} value={p.partNo}>{p.partNo}</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* Toolbar */}
      <div className="epmp-card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="text-[12px] font-semibold text-[#101828]">
          {partRows.length} parts · {activityCols.length} activities · {totalCols} fields
        </span>
        <div className="flex items-center gap-2">
          {toast && <span className="text-[11px] font-medium text-emerald-700">{toast}</span>}
          <Button variant="secondary" size="sm" disabled={excelBusy || partRows.length === 0} onClick={downloadExcelTemplate} title="Downloads an Excel template: one row per part, every activity's fields as columns">
            Download Excel template
          </Button>
          <Button variant="secondary" size="sm" disabled={excelBusy || partRows.length === 0} onClick={() => excelInput.current?.click()} title="Loads a filled template. Values are staged for review; nothing is saved until you click Save all changes.">
            Upload Excel
          </Button>
          <input ref={excelInput} type="file" accept=".xlsx" className="hidden" aria-label="Upload filled Excel template" onChange={(e) => uploadExcel(e.target.files?.[0])} />
          <Button variant="primary" size="sm" onClick={saveAll} disabled={dirtyCount === 0}>
            Save all changes{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
          </Button>
        </div>
      </div>

      {upload && <UploadReport summary={upload} onClose={() => setUpload(null)} />}
      {partRows.length === 0 || activityCols.length === 0 ? (
        <Card><p className="py-10 text-center text-sm text-[var(--color-muted)]">No activities match the filters.</p></Card>
      ) : (
        /* Single scrollable grid: sticky header row + sticky Part column. */
        <div className="epmp-card overflow-auto p-0" style={{ maxHeight: 'calc(100vh - 290px)' }}>
          <table className="border-separate border-spacing-0 text-[11px]">
            <thead>
              {/* Tier 1: activity group headers */}
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-30 min-w-[180px] border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left align-bottom text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]"
                >
                  Part
                </th>
                {activityCols.map((a, ai) => (
                  <th
                    key={a.rowId}
                    colSpan={a.columns.length}
                    className={`sticky top-0 z-20 whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2 text-left text-[11px] font-semibold text-[#101828] ${ai % 2 ? 'bg-[#eef2ff]' : 'bg-[#f3f4f6]'}`}
                  >
                    {a.name} <span className="font-normal text-[var(--color-muted)]">· {a.milestoneId}</span>
                  </th>
                ))}
              </tr>
              {/* Tier 2: field headers */}
              <tr>
                {activityCols.flatMap((a, ai) =>
                  a.columns.map((c) => (
                    <th
                      key={`${a.rowId}:${c.key}`}
                      className={`sticky z-20 min-w-[130px] whitespace-nowrap border-b border-[var(--color-border)] px-3 py-1.5 text-left text-[10px] font-medium text-[var(--color-muted)] ${ai % 2 ? 'bg-[#f5f7ff]' : 'bg-[var(--color-surface)]'}`}
                      style={{ top: 35 }}
                      title={c.label}
                    >
                      {c.label}{c.mandatory && <span className="text-red-500"> *</span>}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {partRows.map(({ part, byRow }) => (
                <tr key={part.partNo} className="hover:bg-[#fafbff]">
                  <td className="sticky left-0 z-10 min-w-[180px] border-b border-r border-[var(--color-border)] bg-white px-3 py-2">
                    <div className="font-medium text-[#101828]">{part.partNo}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">{part.model} · {part.vendorName}</div>
                  </td>
                  {activityCols.flatMap((a) => {
                    const inst = byRow.get(a.rowId)
                    if (!inst) {
                      // This activity doesn't apply to this part (scope) — blank spanned cells.
                      return a.columns.map((c) => (
                        <td key={`${a.rowId}:${c.key}`} className="border-b border-[var(--color-border)] bg-[#fcfcfd] px-3 py-2 text-center text-[var(--color-muted)]">·</td>
                      ))
                    }
                    const m: RowModel = buildRowModel(inst, role, edits[`${a.rowId}|${part.partNo}`] ?? {}, 'enter')
                    return a.columns.map((c) => {
                      const editable = m.editable[c.key]
                      const visible = m.cond[c.key]?.visible !== false
                      return (
                        <td key={`${a.rowId}:${c.key}`} className="border-b border-r border-[var(--color-border)] px-2 py-1.5 align-top">
                          {!visible ? (
                            <span className="text-[var(--color-muted)]">—</span>
                          ) : editable ? (
                            <CellEditor field={c} value={m.values[c.key]} onChange={(v) => setCell(a.rowId, part.partNo, c.key, v)} label={`${part.partNo} · ${a.name} · ${c.label}`} />
                          ) : (
                            <span className={isEmptyValue(m.values[c.key]) ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'}>
                              {m.lock && isEmptyValue(m.values[c.key]) ? m.lock : formatValue(c, m.values[c.key])}
                            </span>
                          )}
                        </td>
                      )
                    })
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
