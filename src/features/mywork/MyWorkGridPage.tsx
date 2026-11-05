import { Icon as FbIcon } from '../../components/Icon'
import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader, Card, Button, StatusPill, RygDot, Modal } from '../../components'
import type { StatusValue } from '../../components/StatusPill'
import { useQAStore } from '../../store/qaStore'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import { getFilteredData, isWorkableByVendor } from '../../engine'
import type { FilteredInstance } from '../../engine'
import type { FieldDefinition } from '../../domain'
import { DEMO_TODAY, fmtDate, partInScope, toRygStatus } from '../scope'
import { PartDetailDrawer } from '../workspace/PartDetailDrawer'
import { canEnterWork, canValidate, hasMyWork, isWaitingForRole, roleEntersFirst, validatingRole } from './workQueue'
import { buildRowModel, calculatedColumns, entryColumns, formatValue, isEmptyValue, splitApprovable, validateColumns } from './gridModel'
import type { GridMode } from './gridModel'
import type { RowModel } from './gridModel'
import { CellEditor } from './GridCell'
import { AiImportPanel } from './AiImportPanel'
import { downloadCsv } from './csv'
import { UploadReport } from '../excel/UploadReport'
import type { UploadSummary } from '../excel/UploadReport'
import { applyUpload, downloadFillTemplate } from '../excel/fillSheet'
import type { FillColumn, FillRow } from '../excel/fillSheet'
import { downloadBlob } from '../excel/xlsxIO'
import { excelFillable } from '../excel/cellValues'
import { actorLabel } from '../excel/audit'
import { gridCsv, gridCsvFilename } from './gridExport'
import type { CellTone } from './GridCell'
import { DelayReasonDialog } from '../delay/DelayReasonDialog'
import { delayItemFor, delayStateOf, isVendorDelayed, needsVendorReason } from '../delay/delay'
import type { DelayItem } from '../delay/delay'

type Edits = Record<string, Record<string, any>>

interface Notice {
  /** Green line, e.g. "Submitted 3 rows to the PIC." Empty when nothing went through. */
  done: string
  /** Heading for the amber list of rows that were left untouched. */
  skippedHeading: string
  skipped: { id: string; partNo: string; partName: string; missing: string[] }[]
}

const thCls = 'px-2 py-2.5 text-left align-bottom text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)] whitespace-nowrap'
const tdCls = 'px-2 py-1.5 align-middle'

function statusFor(inst: FilteredInstance): StatusValue {
  if (inst.status === 'Sent back') return 'SentBack'
  if (inst.status === 'Submitted' || inst.status === 'Approved' || inst.status === 'Draft' || inst.status === 'NotStarted') return inst.status
  return 'Draft'
}

export function MyWorkGridPage() {
  const { activityId = '', milestoneId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { activities, entries, templateRows, models, parts, partReleases, partAcks, delayReasons, submitDelayReasons, updateEntryValues, transitionEntryState, logAudit } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const mode: GridMode = searchParams.get('mode') === 'validate' ? 'validate' : 'enter'
  const validating = mode === 'validate'

  const [edits, setEdits] = useState<Edits>({})
  const [delayOpen, setDelayOpen] = useState(false)
  const [delayItems, setDelayItems] = useState<DelayItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<Notice | null>(null)
  const [upload, setUpload] = useState<UploadSummary | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)
  const excelInput = useRef<HTMLInputElement>(null)
  const [sectionFilter, setSectionFilter] = useState(searchParams.get('section') ?? 'All')
  const [modelFilter, setModelFilter] = useState('All')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [hideLocked, setHideLocked] = useState(false)
  const [fillKey, setFillKey] = useState('')
  const [fillValue, setFillValue] = useState<any>('')
  const [drawerFor, setDrawerFor] = useState<FilteredInstance | null>(null)
  const [dialog, setDialog] = useState<'approve' | 'sendback' | null>(null)
  const [comment, setComment] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  const activity = activities.find((a) => a.id === activityId)
  const role = currentPersona

  const instances = useMemo(() => {
    if (!activity) return []
    return getFilteredData(
      entries,
      activities,
      parts,
      templateRows,
      models,
      { milestone: milestoneId, section: 'All', model: 'All', vendor: 'All', type: 'All' },
      activityId,
      DEMO_TODAY
    )
      .filter((i) => partInScope(i.part, role))
      // Release gate: the vendor works only on parts it has acknowledged after the PIC released them.
      .filter((i) => role !== 'Vendor' || isWorkableByVendor(i.part.partNo, partReleases, partAcks))
      .filter((i) => (validating ? isWaitingForRole(i, role) : true))
      .sort((a, b) => a.row.section.localeCompare(b.row.section) || a.part.partNo.localeCompare(b.part.partNo))
  }, [activity, entries, activities, parts, templateRows, models, partReleases, partAcks, milestoneId, activityId, role, validating])

  const rowModels = useMemo(
    () => instances.map((inst) => buildRowModel(inst, role, edits[`${inst.row.id}|${inst.part.partNo}`] ?? {}, mode)),
    [instances, role, edits, mode]
  )

  const sections = useMemo(() => Array.from(new Set(instances.map((i) => i.row.section))).sort(), [instances])
  const modelOptions = useMemo(() => Array.from(new Set(instances.map((i) => i.part.model))).sort(), [instances])
  const vendorOptions = useMemo(() => Array.from(new Set(instances.map((i) => i.part.vendorName))).sort(), [instances])
  const shown = useMemo(
    () =>
      rowModels.filter(
        (m) =>
          (sectionFilter === 'All' || m.inst.row.section === sectionFilter) &&
          (modelFilter === 'All' || m.inst.part.model === modelFilter) &&
          (vendorFilter === 'All' || m.inst.part.vendorName === vendorFilter) &&
          !(hideLocked && m.lock)
      ),
    [rowModels, sectionFilter, modelFilter, vendorFilter, hideLocked]
  )
  const openShown = shown.filter((m) => !m.lock)

  const gate = !hasMyWork(role)
    ? 'The entry and validation grids are available to the Vendor, PIC, SIC and DPM roles. Switch persona to use it.'
    : !activity
      ? 'This activity was not found.'
      : validating
        ? !canValidate(role) || !activity.flow.steps.some((st) => st.role === validatingRole(role))
          ? `${role} does not validate ${activity.name}, so there is no validation grid for it.`
          : null
        : !canEnterWork(role)
          ? `${role} has no fields to enter, so there is no entry grid. Open the validation grid to review submissions.`
          : !roleEntersFirst(activity, role)
            ? `${activity.name} is not entered by the ${role}, so there is no entry grid for it. Open the validation grid to review submissions.`
            : null

  if (gate || !activity) {
    return (
      <div>
        <PageHeader title="Entry grid" section="My Work" description="Update many parts of one activity in a single table." />
        <Card>
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">{gate}</p>
        </Card>
      </div>
    )
  }

  const inputCols = validating ? validateColumns(activity) : entryColumns(activity, role)
  const calcCols = calculatedColumns(activity)
  const canType = (f: FieldDefinition) => f.type !== 'file' && f.type !== 'table' && f.enteredBy === role
  const fillCols = inputCols.filter(canType)
  // The SIC and DPM have no fields of their own, so fill, copy-down and Save PIC edits would have nothing to act on
  const hasOwnFields = fillCols.length > 0 || inputCols.some((f) => f.enteredBy === role)
  const fillField = fillCols.find((f) => f.key === fillKey)

  const unsavedRows = shown.filter((m) => m.dirty && !m.lock)
  const readyRows = openShown.filter((m) => m.ready)
  const selectedOpen = openShown.filter((m) => selected.has(m.id))

  // ── Edit helpers ──
  function setCell(m: RowModel, key: string, value: any) {
    setEdits((prev) => ({ ...prev, [m.id]: { ...prev[m.id], [key]: value } }))
    setFlagged((prev) => {
      if (!prev.has(m.id)) return prev
      const next = new Set(prev)
      next.delete(m.id)
      return next
    })
  }

  function applyToRows(rows: RowModel[], key: string, value: any) {
    setEdits((prev) => {
      const next = { ...prev }
      for (const m of rows) if (m.editable[key]) next[m.id] = { ...next[m.id], [key]: value }
      return next
    })
    setNotice(null)
  }

  /** Copies the first editable value in the target rows down to the others (selected rows, or every open row). */
  function copyDown(field: FieldDefinition) {
    const targets = selectedOpen.length > 0 ? selectedOpen : openShown
    const source = targets.find((m) => m.editable[field.key])
    if (!source || isEmptyValue(source.values[field.key])) return
    applyToRows(targets.filter((m) => m !== source), field.key, source.values[field.key])
  }

  // ── Excel template and bulk upload ──
  // Columns the current role can fill from Excel, and one sheet row per part-row of this grid.
  const excelColumns: FillColumn[] = inputCols.filter((f) => f.enteredBy === role && excelFillable(f)).map((f) => ({ id: f.key, header: f.label, field: f }))
  const toFillRow = (m: RowModel): FillRow => ({
    partNo: m.inst.part.partNo,
    section: m.inst.row.section,
    partName: m.inst.part.partName,
    model: m.inst.part.model,
    locked: m.lock,
    editable: (id) => !!m.editable[id],
    value: (id) => m.values[id]
  })
  const excelMeta = { screen: 'entry-grid', activityId, milestoneId, role, mode }
  async function downloadExcelTemplate() {
    setExcelBusy(true)
    try {
      const blob = await downloadFillTemplate({
        title: `${activity!.name} · ${milestoneId} ${validating ? 'validation' : 'entry'} grid · ${role}`,
        note: 'One row per part. Fill your own fields; other columns are for reference.',
        meta: excelMeta,
        columns: excelColumns,
        rows: shown.map(toFillRow)
      })
      downloadBlob(blob, `${[activityId, milestoneId, role, mode, 'template'].join('_')}.xlsx`)
      logAudit({ persona: role, actorName: actorLabel(role), action: 'Excel template downloaded', activityId, detail: `${activity!.name} (${milestoneId}), ${shown.length} part row${shown.length !== 1 ? 's' : ''}` })
    } finally {
      setExcelBusy(false)
    }
  }
  async function uploadExcel(file: File | undefined) {
    if (!file) return
    setExcelBusy(true)
    try {
      const staged: Record<string, Record<string, any>> = {}
      const byFillRow = new Map(rowModels.map((m) => [`${m.inst.row.section}|${m.inst.part.partNo}`, m]))
      const summary = await applyUpload(file, excelMeta, excelColumns, rowModels.map(toFillRow), (row, colId, value) => {
        const m = byFillRow.get(`${row.section}|${row.partNo}`)
        if (m) staged[m.id] = { ...staged[m.id], [colId]: value }
      })
      if (Object.keys(staged).length > 0) {
        setEdits((prev) => {
          const next = { ...prev }
          for (const [id, vals] of Object.entries(staged)) next[id] = { ...next[id], ...vals }
          return next
        })
        setNotice(null)
      }
      setUpload(summary)
      logAudit({
        persona: role,
        actorName: actorLabel(role),
        action: 'Excel upload staged',
        activityId,
        detail: `${file.name}: ${summary.cellsStaged} value${summary.cellsStaged !== 1 ? 's' : ''} on ${summary.rowsApplied} row${summary.rowsApplied !== 1 ? 's' : ''} staged for review, ${summary.issues.length} left out`
      })
    } finally {
      setExcelBusy(false)
      if (excelInput.current) excelInput.current.value = ''
    }
  }
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allOpenSelected = openShown.length > 0 && openShown.every((m) => selected.has(m.id))
  function toggleAll() {
    setSelected(allOpenSelected ? new Set() : new Set(openShown.map((m) => m.id)))
  }

  // ── Store actions: the same calls the part form makes ──
  function clearEdits(ids: string[]) {
    setEdits((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
  }

  /** Saves staged edits of the given rows as drafts. Unlike the part form it does not require mandatory fields, so partial work is kept. */
  function persist(m: RowModel) {
    updateEntryValues(m.inst.row.id, m.inst.part.partNo, edits[m.id] ?? {}, role)
  }

  function saveDrafts() {
    for (const m of unsavedRows) persist(m)
    clearEdits(unsavedRows.map((m) => m.id))
    setNotice(null)
  }

  /** Submits the complete rows; incomplete ones are left untouched and reported with what is missing. */
  function submitRows(rows: RowModel[]) {
    const candidates = rows.filter((m) => !m.lock && (m.hasValue || m.dirty))
    // Late activities held by the vendor cannot be submitted until a reason for the delay is given (pop-up).
    const held = role === 'Vendor' ? candidates.filter((m) => isVendorDelayed(m.inst) && needsVendorReason(delayStateOf(m.id, delayReasons).state)) : []
    const heldIds = new Set(held.map((m) => m.id))
    const ready = candidates.filter((m) => m.ready && !heldIds.has(m.id))
    const skipped = candidates.filter((m) => !m.ready && !heldIds.has(m.id))
    if (held.length) {
      setDelayItems(held.map((m) => delayItemFor(m.inst, delayReasons)))
      setDelayOpen(true)
    }
    for (const m of ready) {
      persist(m)
      transitionEntryState(m.id, 'Submit', undefined, role)
    }
    clearEdits(ready.map((m) => m.id))
    setSelected((prev) => new Set(Array.from(prev).filter((id) => !ready.some((m) => m.id === id))))
    setFlagged(new Set(skipped.map((m) => m.id)))
    setNotice({
      done: ready.length ? `Submitted ${ready.length} row${ready.length !== 1 ? 's' : ''}${role === 'Vendor' ? ' to the PIC' : ''}.` : '',
      skippedHeading: `${skipped.length} row${skipped.length !== 1 ? 's were' : ' was'} not submitted — complete the highlighted cells or give the delay reason first. Nothing was partly submitted.`,
      skipped: skipped.map((m) => ({
        id: m.id,
        partNo: m.inst.part.partNo,
        partName: m.inst.part.partName,
        missing: m.missing.map((f) => f.label)
      }))
    })
  }

  /** Validate mode: saves the PIC's edits to Submitted rows and logs them as an edit, like the part form's Edit button. */
  function savePicEdits(rows: RowModel[]) {
    const dirty = rows.filter((m) => m.dirty)
    for (const m of dirty) {
      persist(m)
      transitionEntryState(m.id, 'Edit', undefined, role)
    }
    clearEdits(dirty.map((m) => m.id))
    setNotice(dirty.length ? { done: `Saved PIC edits on ${dirty.length} row${dirty.length !== 1 ? 's' : ''}.`, skippedHeading: '', skipped: [] } : null)
  }

  /**
   * Validate mode: approves rows whose visible mandatory PIC fields are all filled (stricter than the part form,
   * which approves regardless). Edits made in the grid are saved and logged first. Incomplete rows are left untouched.
   */
  function approveRows(rows: RowModel[], approveComment?: string) {
    const { ready, skipped } = splitApprovable(rows)
    for (const m of ready) {
      if (m.dirty) {
        persist(m)
        transitionEntryState(m.id, 'Edit', undefined, role)
      }
      transitionEntryState(m.id, 'Approve', approveComment || undefined, role)
    }
    clearEdits(ready.map((m) => m.id))
    setSelected((prev) => new Set(Array.from(prev).filter((id) => !ready.some((m) => m.id === id))))
    setFlagged(new Set(skipped.map((m) => m.id)))
    setNotice({
      done: ready.length ? `Approved ${ready.length} row${ready.length !== 1 ? 's' : ''}.` : '',
      skippedHeading: skipped.length
        ? `${skipped.length} row${skipped.length !== 1 ? 's were' : ' was'} not approved — ${
            role === 'PIC' ? 'fill the highlighted PIC fields first' : 'the PIC has to fill the highlighted fields first'
          }. Nothing was partly approved.`
        : '',
      skipped: skipped.map((m) => ({
        id: m.id,
        partNo: m.inst.part.partNo,
        partName: m.inst.part.partName,
        missing: m.missing.map((f) => f.label)
      }))
    })
  }

  /**
   * Validate mode: returns the rows to the Vendor with one reason recorded in each row's history. Edits staged in the
   * grid on these rows are discarded, as in the part form where Send back saves nothing.
   */
  function sendBackRows(rows: RowModel[], reason: string) {
    const targets = rows.filter((m) => !m.lock)
    for (const m of targets) transitionEntryState(m.id, 'Send back', reason.trim(), role)
    clearEdits(targets.map((m) => m.id))
    setSelected((prev) => new Set(Array.from(prev).filter((id) => !targets.some((m) => m.id === id))))
    setFlagged(new Set())
    setNotice({
      done: targets.length ? `Sent back ${targets.length} row${targets.length !== 1 ? 's' : ''} to the Vendor.` : '',
      skippedHeading: '',
      skipped: []
    })
  }

  function closeDialog() {
    setDialog(null)
    setComment('')
  }

  function confirmDialog() {
    if (dialog === 'approve') approveRows(selectedOpen, comment.trim())
    else if (dialog === 'sendback') sendBackRows(selectedOpen, comment)
    closeDialog()
  }

  function openForm(m: RowModel) {
    // Save staged edits first so the part form shows them (in validate mode they are logged as a PIC edit, like Save PIC edits)
    if (m.dirty && !m.lock) {
      persist(m)
      if (validating) transitionEntryState(m.id, 'Edit', undefined, role)
      clearEdits([m.id])
    }
    setDrawerFor(m.inst)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    if (e.key !== 'Enter') return
    const t = e.target
    if (!(t instanceof HTMLInputElement) || t.type === 'checkbox' || !t.dataset.cell) return
    const [r, c] = t.dataset.cell.split('|')
    const step = e.shiftKey ? -1 : 1
    for (let i = Number(r) + step; i >= 0 && i < shown.length; i += step) {
      const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${i}|${c}"]`)
      if (el) {
        e.preventDefault()
        el.focus()
        return
      }
    }
  }

  const sentBackTotal = shown.filter((m) => m.inst.status === 'Sent back').length

  return (
    <div>
      <PageHeader
        title={activity.name}
        section="My Work"
        crumb={`${milestoneId} ${validating ? 'validation' : 'entry'} grid`}
        description={
          validating
            ? 'Vendor submissions waiting for you, one row per part. Vendor values are read-only; fill your own fields, then approve the rows that are complete. The same rules as the part form apply.'
            : 'One row per part, combined across sections. Type or fill values, then save drafts or submit the rows that are complete. The same rules as the part form apply.'
        }
        actions={
          <Link
            to="/mywork"
            className="inline-flex items-center rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text)] hover:bg-[#fafafa]"
          >
            ← My Work
          </Link>
        }
      />

      {!validating && <AiImportPanel role={role} defaultOpen={false} />}
      {upload && <UploadReport summary={upload} onClose={() => setUpload(null)} />}

      {/* Summary + filters */}
      <div className="epmp-card mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[11px] text-[var(--color-muted)]">
        <span>
          <strong className="text-[var(--color-text)]">{milestoneId}</strong> · {shown.length} part{shown.length !== 1 ? 's' : ''}
        </span>
        <span>{openShown.length} open</span>
        {sentBackTotal > 0 && <span className="font-medium text-[var(--color-ryg-red)]">{sentBackTotal} sent back</span>}
        <span>{readyRows.length} ready to {validating ? 'approve' : 'submit'}</span>
        <span>{unsavedRows.length} with unsaved edits</span>
        <span className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            Section
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="h-8 rounded-md border border-[var(--color-border)] bg-[#f9fafb] px-2 text-[11px] text-[#344054]"
            >
              <option value="All">All sections</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Model
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="h-8 rounded-md border border-[var(--color-border)] bg-[#f9fafb] px-2 text-[11px] text-[#344054]"
            >
              <option value="All">All models</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Vendor
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="h-8 rounded-md border border-[var(--color-border)] bg-[#f9fafb] px-2 text-[11px] text-[#344054]"
            >
              <option value="All">All vendors</option>
              {vendorOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={hideLocked} onChange={(e) => setHideLocked(e.target.checked)} />
            Hide locked rows
          </label>
        </span>
      </div>

      {/* Bulk fill + actions */}
      <div className="epmp-card mb-3 flex flex-wrap items-end gap-3 px-4 py-3">
        {hasOwnFields && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Fill column
            <select
              value={fillKey}
              onChange={(e) => {
                setFillKey(e.target.value)
                setFillValue('')
              }}
              className="h-8 min-w-[160px] rounded-md border border-[var(--color-border)] bg-white px-2 text-[11px] normal-case tracking-normal text-[var(--color-text)]"
            >
              <option value="">Choose a column…</option>
              {fillCols.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {fillField && (
            <div className="flex flex-col gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Value
              <CellEditor field={fillField} value={fillValue} onChange={setFillValue} label="Value to fill" />
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!fillField || selectedOpen.length === 0 || isEmptyValue(fillValue)}
            onClick={() => fillField && applyToRows(selectedOpen, fillField.key, fillValue)}
            title="Applies the value to the selected rows where the field is editable"
          >
            Apply to {selectedOpen.length} selected
          </Button>
        </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={shown.length === 0}
            onClick={() =>
              downloadCsv(gridCsvFilename(activityId, milestoneId, role, mode, DEMO_TODAY), gridCsv(shown, inputCols, calcCols, role, mode))
            }
            title="Downloads the rows shown as a CSV file. Export only: changes made in the file cannot be loaded back."
          >
            Download CSV ({shown.length})
          </Button>
          {excelColumns.length > 0 && (
            <>
              <Button variant="secondary" size="sm" disabled={shown.length === 0 || excelBusy} onClick={downloadExcelTemplate} title="Downloads an Excel template with one row per part and your fields as columns">
                Download Excel template
              </Button>
              <Button variant="secondary" size="sm" disabled={excelBusy} onClick={() => excelInput.current?.click()} title="Loads a filled template. Values are staged for you to review; nothing is submitted by the upload.">
                Upload Excel
              </Button>
              <input ref={excelInput} type="file" accept=".xlsx" className="hidden" aria-label="Upload filled Excel template" onChange={(e) => uploadExcel(e.target.files?.[0])} />
            </>
          )}
          {validating ? (
            <>
              {hasOwnFields && (
                <Button variant="secondary" size="sm" disabled={unsavedRows.length === 0} onClick={() => savePicEdits(unsavedRows)}>
                  Save {role} edits ({unsavedRows.length})
                </Button>
              )}
              <Button variant="danger" size="sm" disabled={selectedOpen.length === 0} onClick={() => setDialog('sendback')}>
                Send back selected ({selectedOpen.length})
              </Button>
              <Button variant="primary" size="sm" disabled={selectedOpen.length === 0} onClick={() => setDialog('approve')}>
                Approve selected ({selectedOpen.length})
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" disabled={unsavedRows.length === 0} onClick={saveDrafts}>
                Save drafts ({unsavedRows.length})
              </Button>
              <Button variant="primary" size="sm" disabled={readyRows.length === 0} onClick={() => submitRows(readyRows)}>
                Submit all ready ({readyRows.length})
              </Button>
            </>
          )}
        </div>
        <p className="w-full text-[10.5px] text-[var(--color-muted)]">
          Download CSV is one-way: it exports the rows shown, and edits made in the file cannot be loaded back.
          {!validating && ' To bring in data from a file, use Import with AI above.'}
        </p>
      </div>

      {notice && (
        <div className="mb-3 space-y-2">
          {notice.done && (
            <div className="rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-xs text-[#047857]" role="status">
              {notice.done}
            </div>
          )}
          {notice.skipped.length > 0 && (
            <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs text-[#b45309]" role="alert">
              <p className="font-semibold">{notice.skippedHeading}</p>
              <ul className="mt-1 list-disc pl-5">
                {notice.skipped.map((s) => (
                  <li key={s.id}>
                    {s.partName} <span className="font-mono">({s.partNo})</span>: missing {s.missing.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="epmp-card overflow-x-auto" data-tour="grid-table">
        <table ref={tableRef} onKeyDown={onKeyDown} className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className={`${thCls} sticky left-0 z-10 bg-[var(--color-surface)]`}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allOpenSelected} onChange={toggleAll} aria-label="Select all open rows" />
                  Part
                </label>
              </th>
              <th className={thCls}>Model</th>
              <th className={thCls}>Section</th>
              <th className={thCls}>Due</th>
              <th className={thCls}>State</th>
              {inputCols.map((f) => (
                <th key={f.key} className={thCls}>
                  <div className="flex items-center gap-1">
                    <span title={validating && f.enteredBy !== role ? `${f.label} — entered by ${f.enteredBy}, read-only` : f.label}>
                      {f.label}
                      {f.mandatory && <span className="ml-0.5 text-[var(--color-ryg-red)]">*</span>}
                      {validating && f.enteredBy !== role && (
                        <span className="ml-1 normal-case font-normal">({f.enteredBy === 'System' ? 'system' : f.enteredBy.toLowerCase()})</span>
                      )}
                    </span>
                    {canType(f) && (
                      <button
                        type="button"
                        onClick={() => copyDown(f)}
                        className="rounded border border-[var(--color-border)] bg-white px-1 text-[10px] normal-case text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                        title="Copy the top value down — to the selected rows, or to every open row if none are selected"
                        aria-label={`Copy ${f.label} down`}
                      >
                        <FbIcon name="chevron-down" size={12} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {calcCols.map((f) => (
                <th key={f.key} className={`${thCls} bg-[#f3f4f6]`} title="Calculated — updates as you type">
                  {f.label} <span className="normal-case">(calc.)</span>
                </th>
              ))}
              <th className={thCls}>Row</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7 + inputCols.length + calcCols.length} className="px-4 py-8 text-center text-[var(--color-muted)]">
                  No parts match these filters.
                </td>
              </tr>
            )}
            {shown.map((m, idx) => {
              const inst = m.inst
              const locked = !!m.lock
              const rowTone = locked ? 'bg-[var(--color-surface)] text-[var(--color-muted)]' : m.dirty ? 'bg-[#f8fbff]' : 'bg-white'
              return (
                <tr key={m.id} className={`border-b border-[var(--color-border)] ${rowTone}`}>
                  <td className={`${tdCls} sticky left-0 z-10 ${locked ? 'bg-[var(--color-surface)]' : m.dirty ? 'bg-[#f8fbff]' : 'bg-white'}`}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={!locked && selected.has(m.id)}
                        onChange={() => toggleRow(m.id)}
                        aria-label={`Select ${inst.part.partName}`}
                      />
                      <span>
                        <span className="block max-w-[190px] truncate font-medium text-[var(--color-text)]" title={inst.part.partName}>
                          {m.dirty && <span className="mr-1 text-[var(--color-accent)]" title="Unsaved edits"><span className="inline-block h-2 w-2 rounded-full bg-current align-middle" /></span>}
                          {inst.part.partName}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--color-muted)]">{inst.part.partNo}</span>
                      </span>
                    </label>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>{inst.part.model}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{inst.row.section}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1.5">
                      <RygDot status={inst.notApplicable ? 'na' : toRygStatus(inst.ryg)} />
                      {inst.dates.status === 'resolved' ? fmtDate(inst.dates.end) : 'Awaiting MRD'}
                    </span>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {inst.notApplicable ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-[#cbd5e1] bg-[#f1f5f9] px-2 py-1 text-[10px] font-medium text-[#475569]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
                        Not applicable
                      </span>
                    ) : (
                      <StatusPill status={statusFor(inst)} size="sm" />
                    )}
                    {inst.status === 'Sent back' && Object.keys(m.sentBackNotes).length > 0 && (
                      <span
                        className="ml-1.5 cursor-help text-[#b45309]"
                        title={Object.entries(m.sentBackNotes)
                          .map(([k, c]) => `${activity.fields.find((f) => f.key === k)?.label ?? k}: ${c}`)
                          .join('\n')}
                      >
                        <FbIcon name="exclamation-circle" size={14} />
                      </span>
                    )}
                    {locked && !inst.notApplicable && <div className="mt-0.5 text-[10px]">{m.lock}</div>}
                  </td>

                  {inputCols.map((f) => {
                    const state = m.cond[f.key]
                    const value = m.values[f.key]
                    if (state?.visible === false) {
                      return (
                        <td key={f.key} className={`${tdCls} text-[var(--color-muted)]`} title="Hidden by a rule for this row">
                          <span className="block text-center">n/a</span>
                        </td>
                      )
                    }
                    if (f.type === 'file') {
                      return (
                        <td key={f.key} className={tdCls}>
                          <button
                            type="button"
                            onClick={() => openForm(m)}
                            className="text-[11px] text-[var(--color-accent)] underline"
                            title="Attachments are added and opened in the part form. Your edits to this row are saved first."
                          >
                            {value ? String(value) : locked || f.enteredBy !== role ? '—' : 'Add in part form'}
                          </button>
                        </td>
                      )
                    }
                    if (f.type === 'table') {
                      const n = Array.isArray(value) ? value.length : 0
                      return (
                        <td key={f.key} className={tdCls}>
                          <button
                            type="button"
                            onClick={() => openForm(m)}
                            className="text-[11px] text-[var(--color-accent)] underline"
                            title="This list is entered and reviewed in the part form."
                          >
                            {n > 0 ? `${n} row${n === 1 ? '' : 's'} — open` : locked ? '—' : 'Add in part form'}
                          </button>
                        </td>
                      )
                    }
                    if (!m.editable[f.key]) {
                      return (
                        <td key={f.key} className={`${tdCls} whitespace-nowrap`}>
                          {formatValue(f, value)}
                        </td>
                      )
                    }
                    const empty = isEmptyValue(value)
                    const isMissing = m.missing.some((x) => x.key === f.key)
                    const tone: CellTone =
                      flagged.has(m.id) && isMissing ? 'error' : state?.mandatory && !f.mandatory && empty ? 'rule' : 'none'
                    return (
                      <td key={f.key} className={tdCls} title={tone === 'rule' ? 'Required because of another answer in this row' : undefined}>
                        <CellEditor
                          field={f}
                          value={value}
                          onChange={(v) => setCell(m, f.key, v)}
                          cellId={`${idx}|${f.key}`}
                          tone={tone}
                        />
                      </td>
                    )
                  })}

                  {calcCols.map((f) => (
                    <td key={f.key} className={`${tdCls} whitespace-nowrap bg-[#f9fafb] text-[var(--color-muted)]`}>
                      {formatValue(f, m.values[f.key])}
                    </td>
                  ))}

                  <td className={`${tdCls} whitespace-nowrap`}>
                    <div className="flex items-center gap-1.5">
                      <Button variant="primary" size="sm" disabled={locked} onClick={() => (validating ? approveRows([m]) : submitRows([m]))}>
                        {validating ? 'Approve' : 'Submit'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openForm(m)} title="Open the full part form">
                        Form
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-[var(--color-muted)]">
        Enter moves down a column (Shift+Enter up). Amber cells become required because of another answer in the row.{' '}
        {validating
          ? 'Only rows waiting for you are listed; Vendor-entered values are read-only. Tick rows to approve or send back several at once; nothing is pre-ticked and you confirm first.'
          : 'Rows that are submitted, approved or not applicable are read-only.'}
      </p>

      {validating && (() => {
        const { ready, skipped } = splitApprovable(selectedOpen)
        const sendBack = dialog === 'sendback'
        const dirtyCount = selectedOpen.filter((m) => m.dirty).length
        return (
          <Modal
            open={dialog !== null}
            onClose={closeDialog}
            title={sendBack ? 'Send back to the Vendor' : 'Approve selected rows'}
            size="md"
            footer={
              <>
                <Button variant="secondary" size="sm" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  variant={sendBack ? 'danger' : 'primary'}
                  size="sm"
                  disabled={sendBack ? comment.trim() === '' || selectedOpen.length === 0 : ready.length === 0}
                  onClick={confirmDialog}
                >
                  {sendBack ? `Send back ${selectedOpen.length}` : `Approve ${ready.length}`}
                </Button>
              </>
            }
          >
            {sendBack ? (
              <div className="space-y-3 text-sm">
                <p className="text-[var(--color-muted)]">
                  {selectedOpen.length} row{selectedOpen.length !== 1 ? 's go' : ' goes'} back to the Vendor for correction. The reason below is recorded on every row.
                </p>
                <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs">
                  {selectedOpen.map((m) => (
                    <li key={m.id}>
                      {m.inst.part.partName} <span className="font-mono text-[var(--color-muted)]">({m.inst.part.partNo})</span>
                    </li>
                  ))}
                </ul>
                {dirtyCount > 0 && (
                  <p className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs text-[#b45309]">
                    Unsaved edits on {dirtyCount} of these row{dirtyCount !== 1 ? 's' : ''} will be discarded.
                  </p>
                )}
                <label className="block text-xs font-medium text-[var(--color-muted)]">
                  Reason (required)
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Describe what needs to be fixed…"
                    className="mt-1 w-full resize-y rounded border border-[var(--color-border)] px-2.5 py-1.5 text-sm font-normal text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-[var(--color-text)]">
                  Approve <strong>{ready.length}</strong> of {selectedOpen.length} selected row{selectedOpen.length !== 1 ? 's' : ''}?
                </p>
                {ready.length > 0 && (
                  <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs">
                    {ready.map((m) => (
                      <li key={m.id}>
                        {m.inst.part.partName} <span className="font-mono text-[var(--color-muted)]">({m.inst.part.partNo})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {skipped.length > 0 && (
                  <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs text-[#b45309]">
                    <p className="font-semibold">
                      {skipped.length} will be skipped — required fields of the PIC are empty:
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {skipped.map((m) => (
                        <li key={m.id}>
                          {m.inst.part.partName}: {m.missing.map((f) => f.label).join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <label className="block text-xs font-medium text-[var(--color-muted)]">
                  Comment (optional)
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment…"
                    className="mt-1 w-full rounded border border-[var(--color-border)] px-2.5 py-1.5 text-sm font-normal text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </label>
              </div>
            )}
          </Modal>
        )
      })()}

      <DelayReasonDialog
        open={delayOpen}
        onClose={() => setDelayOpen(false)}
        items={delayItems}
        onSubmit={(items, category, remark, revisedDate) => {
          submitDelayReasons({
            items: items.map((i) => ({ rowId: i.rowId, partNo: i.partNo, activityId: i.activityId, plannedEnd: i.plannedEnd })),
            category, remark, revisedDate, by: currentPersona, actorName: FIXED_VENDOR_NAME
          })
          setDelayOpen(false)
        }}
      />
      {drawerFor && (
        <PartDetailDrawer
          activity={drawerFor.activity}
          row={drawerFor.row}
          partNo={drawerFor.part.partNo}
          onClose={() => setDrawerFor(null)}
        />
      )}
    </div>
  )
}
