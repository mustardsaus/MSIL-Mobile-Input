import { Icon as FbIcon } from '../../components/Icon'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ActivityDefinition, FieldDefinition, ActivityEntry, TemplateRow, PartRecord } from '../../domain'
import { makeEntryId } from '../../domain'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { fetchFromEnovia, fetchFromSap, fetchFromEdoc, fetchFromRegApp } from '../../mock'
import {
  evaluateConditionalRules,
  evaluateCalculatedFields,
  resolveInstanceDates,
  resolveTrackedDates,
  getMilestoneMrd,
  getPicOn,
  getReleaseState,
  latestReturn,
  actionRyg,
  calculateRYG,
  isNotApplicable,
  mergeDerivedRows,
  evaluateValidationRules,
  rowsFromActivityTable,
  rowsFromCount,
} from '../../engine'
import { fmtDate, fieldVisibleToPersona, DEMO_TODAY, canMarkNotApplicable, canReverseNotApplicable, canPersonaEdit, toRygStatus } from '../scope'
import { getFieldRenderer } from '../../components/FieldRenderer'
import { Button, SourceBadge, StatusPill, Modal, Tabs, ApplicabilityDialog, RygDot } from '../../components'
import type { TabItem } from '../../components/Tabs'
import { DeviationPopup } from './DeviationPopup'
import { HistoryTimeline } from './HistoryTimeline'
import { DelayReasonBlock } from '../delay/DelayReasonBlock'
import { DocumentsTab } from './DocumentsTab'
import { UploadReport } from '../excel/UploadReport'
import type { UploadSummary } from '../excel/UploadReport'
import { applyUpload, downloadFillTemplate } from '../excel/fillSheet'
import type { FillColumn, FillRow } from '../excel/fillSheet'
import { downloadBlob } from '../excel/xlsxIO'
import { excelFillable } from '../excel/cellValues'
import { delayStateOf, needsVendorReason, vendorHoldsDelay } from '../delay/delay'

interface PartDetailDrawerProps {
  activity: ActivityDefinition
  /** The template row (activity under a milestone for a section) this entry belongs to. */
  row: TemplateRow
  partNo: string
  onClose: () => void
}

type FetchEntry = { loading: boolean; error?: string; lastFetched?: string }

function isFetchedSource(source: string): boolean {
  return ['enovia', 'sap', 'edoc', 'regapp'].includes(source)
}

export function PartDetailDrawer({ activity, row, partNo, onClose }: PartDetailDrawerProps) {
  const { entries, activities, models, picAssignments, parts, partReleases, partAcks, delayReasons, updateEntryValues, transitionEntryState, markEntryNg, logAudit, documents, setNotApplicable, releasePart, setVendorTimeline, addAction, updateAction, deleteAction, addDeviation, advanceDeviation } = useQAStore()
  const { currentPersona } = usePersonaStore()

  const part = parts.find((p) => p.partNo === partNo)
  const entryId = makeEntryId(row.id, partNo)
  const entry = entries.find((e) => e.id === entryId)

  // Milestone MRD of this part's model, and the planned dates resolved from the row's offsets
  const model = part ? models.find((m) => m.name === part.model) : undefined
  const milestoneMrd = getMilestoneMrd(model, row.milestoneId)
  const templateDates = resolveInstanceDates(row, model, activity, part)
  // Tracked dates follow a vendor timeline when one is set (and the activity allows it).
  const dates = resolveTrackedDates(row, model, entry, activity, part)

  const [localValues, setLocalValues] = useState<Record<string, any>>(entry?.values ?? {})
  const [fetchState, setFetchState] = useState<Record<string, FetchEntry>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [picComment, setPicComment] = useState('')
  const [showSendBackModal, setShowSendBackModal] = useState(false)
  const [sendBackComment, setSendBackComment] = useState('')
  const [showNgModal, setShowNgModal] = useState(false)
  const [ngReason, setNgReason] = useState('')
  const [ngTarget, setNgTarget] = useState('')
  const [showDeviation, setShowDeviation] = useState(false)
  const [activeTab, setActiveTab] = useState('form')
  const [naDialog, setNaDialog] = useState<'mark' | 'reverse' | null>(null)
  const [releaseComment, setReleaseComment] = useState('')
  const [delayOpenReq, setDelayOpenReq] = useState(0)
  const [tlStart, setTlStart] = useState('')
  const [tlEnd, setTlEnd] = useState('')
  const [tlEditing, setTlEditing] = useState(false)
  const [newActionOpen, setNewActionOpen] = useState(false)
  const [naTitle, setNaTitle] = useState('')
  const [naDesc, setNaDesc] = useState('')
  const [naTarget, setNaTarget] = useState('')
  const [newDevOpen, setNewDevOpen] = useState(false)
  const [devTitle, setDevTitle] = useState('')
  const [devDesc, setDevDesc] = useState('')
  const [devEdoc, setDevEdoc] = useState('')
  const [devTarget, setDevTarget] = useState('')

  const conditionalState = useMemo(() => {
    return evaluateConditionalRules(activity.fields, localValues)
  }, [activity.fields, localValues])

  // Sum-matching rules from the Builder: shown live, and they block Save / Submit while broken.
  const ruleViolations = useMemo(
    () => {
      const vis: Record<string, { visible: boolean }> = {}
      for (const f of activity.fields) vis[f.key] = { visible: conditionalState[f.key]?.visible !== false && fieldVisibleToPersona(f, currentPersona) }
      return evaluateValidationRules(activity, localValues, vis)
    },
    [activity, localValues, conditionalState, currentPersona]
  )
  const calculatedValues = useMemo(() => {
    if (!part) return localValues
    return evaluateCalculatedFields(activity, localValues, part, milestoneMrd)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, localValues, part, milestoneMrd])

  useEffect(() => {
    const keys = activity.fields.filter((f) => f.source === 'calculated').map((f) => f.key)
    const patch: Record<string, any> = {}
    for (const k of keys) {
      if (calculatedValues[k] !== undefined) patch[k] = calculatedValues[k]
    }
    if (Object.keys(patch).length > 0) {
      setLocalValues((prev) => ({ ...prev, ...patch }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(calculatedValues)])

  // Tables derived from another table (PP03 disagreed points follow the Disagree counts) or another activity (e.g. PP05 lists the PP04 rows whose Others status is "New (Unaudited)")
  // follow that activity's rows for this part, keeping what has already been entered per row.
  const derivedSig = JSON.stringify(
    activity.fields.map((f) => {
      const d = f.derivedRows
      if (!d || d.from === 'sap') return null
      if (d.from === 'count') return localValues[d.fieldKey] ?? null
      return entries.find((e) => e.activityId === d.activityId && e.partNo === partNo)?.values[d.fieldKey] ?? null
    })
  )
  useEffect(() => {
    const patch: Record<string, any> = {}
    for (const f of activity.fields) {
      const d = f.derivedRows
      if (!d || d.from === 'sap') continue
      if (d.from === 'count') {
        patch[f.key] = mergeDerivedRows(localValues[f.key], rowsFromCount(localValues[d.fieldKey], d), [d.targetLabelColumn, '_sl'])
        continue
      }
      const src = entries.find((e) => e.activityId === d.activityId && e.partNo === partNo)?.values[d.fieldKey]
      const rows = rowsFromActivityTable(src, d.where, ['code', 'name'])
      patch[f.key] = mergeDerivedRows(localValues[f.key], rows)
    }
    const changed = Object.keys(patch).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(localValues[k] ?? []))
    if (changed.length > 0) setLocalValues((prev) => ({ ...prev, ...Object.fromEntries(changed.map((k) => [k, patch[k]])) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedSig])
  const actualBeyondMrd = useMemo(() => {
    if (!part || !milestoneMrd) return false
    const actual = localValues['actual_otop_date'] || localValues['actual_finish_vendor']
    if (!actual) return false
    return actual > milestoneMrd
  }, [localValues, part, milestoneMrd])

  useEffect(() => {
    if (actualBeyondMrd && currentPersona === 'PIC' && !showDeviation) {
      setShowDeviation(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualBeyondMrd, currentPersona])

  const handleFieldChange = useCallback((key: string, value: any) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  async function handleFetchField(field: FieldDefinition) {
    setFetchState((prev) => ({ ...prev, [field.key]: { loading: true } }))

    let result: { success: boolean; data?: any; error?: string }
    switch (field.source) {
      case 'enovia':
        result = await fetchFromEnovia(partNo)
        break
      case 'sap':
        result = await fetchFromSap(partNo)
        break
      case 'edoc':
        result = await fetchFromEdoc(localValues['edoc_number'] || partNo)
        break
      case 'regapp':
        result = await fetchFromRegApp(partNo)
        break
      default:
        result = { success: false, error: 'Unknown source' }
    }

    const now = new Date().toISOString()
    if (result.success && result.data) {
      const dataKeys = Object.keys(result.data)
      // Match a returned attribute to the field by name, ignoring underscores (target_date_proprietary ~ targetDateProprietary).
      const flat = field.key.toLowerCase().replace(/_/g, '')
      const matched = dataKeys.find((k) => k.toLowerCase() === field.key.toLowerCase() || flat.includes(k.toLowerCase()))
      const fetchedValue = matched ? result.data[matched] : result.data[dataKeys[0]]
      setLocalValues((prev) => ({
        ...prev,
        // A derived table keeps what people already entered in each row (matched on the supplier code).
        [field.key]: field.derivedRows && Array.isArray(fetchedValue) ? mergeDerivedRows(prev[field.key], fetchedValue) : fetchedValue ?? prev[field.key]
      }))
      setFetchState((prev) => ({ ...prev, [field.key]: { loading: false, lastFetched: now } }))
    } else {
      setFetchState((prev) => ({
        ...prev,
        [field.key]: { loading: false, error: result.error ?? 'Not available', lastFetched: now }
      }))
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {}
    for (const field of activity.fields) {
      if (field.dataOnly) continue
      const state = conditionalState[field.key]
      if (!state?.visible) continue
      const isMandatory = state.mandatory
      if (!isMandatory) continue
      if (!canPersonaEdit(field, currentPersona, entry)) continue
      const val = localValues[field.key]
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        errors[field.key] = `${field.label} is required`
      }
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0 && ruleViolations.length === 0
  }

  function handleSave() {
    if (!validateForm()) return
    updateEntryValues(row.id, partNo, localValues, currentPersona)
  }

  // Delay with the vendor: the activity is past its planned end and the vendor has not given an accepted-or-pending reason.
  const plannedEnd = dates.status === 'resolved' ? dates.end : ''
  const rygNow = calculateRYG(dates, entry?.validationState ?? 'Draft', DEMO_TODAY)
  const naNow = isNotApplicable(entry)
  const vendorMustGiveReason =
    currentPersona === 'Vendor' && vendorHoldsDelay(activity, entry, String(rygNow), naNow) && needsVendorReason(delayStateOf(entryId, delayReasons).state)
  function handleSubmit() {
    if (vendorMustGiveReason) {
      setDelayOpenReq((n) => n + 1)
      return
    }
    if (!validateForm()) return
    updateEntryValues(row.id, partNo, localValues, currentPersona)
    transitionEntryState(entryId, 'Submit', undefined, currentPersona)
  }

  function handleApprove() {
    transitionEntryState(entryId, 'Approve', picComment, currentPersona)
    setPicComment('')
  }

  function handleSendBack() {
    transitionEntryState(entryId, 'Send back', sendBackComment, currentPersona)
    setSendBackComment('')
    setShowSendBackModal(false)
  }

  function handlePicEdit() {
    updateEntryValues(row.id, partNo, localValues, currentPersona)
    transitionEntryState(entryId, 'Edit', picComment, currentPersona)
    setPicComment('')
  }

  function handleMarkNg() {
    if (!ngReason.trim()) return
    markEntryNg(entryId, ngReason.trim(), ngTarget || undefined, currentPersona)
    logAudit({
      persona: currentPersona,
      actorName: currentPersona === 'Vendor' ? part!.vendorName : effectivePicName,
      action: 'Submission marked NG',
      partNo,
      activityId: activity.id,
      templateRowId: row.id,
      detail: `Round ${(entry?.ngRounds?.length ?? 0) + 1}: ${ngReason.trim()}${ngTarget ? ` · next by ${ngTarget}` : ''}`
    })
    setShowNgModal(false)
    setNgReason('')
    setNgTarget('')
  }

  const entryState = entry?.validationState ?? 'Draft'
  const isNa = !!entry?.notApplicable
  // A Not-applicable part is frozen: no entering, submitting or validating until it is reversed
  const isSubmitted = entryState === 'Submitted' && !isNa
  const isPic = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'
  const canSubmit = (entryState === 'Draft' || entryState === 'Sent back') && !isNa
  const canVendorEdit = currentPersona === 'Vendor' && canSubmit
  const canPicEnter = isPic && canSubmit
  const showMarkNa = !isNa && activity.allowNotApplicable === true && canMarkNotApplicable(currentPersona)
  const showReverseNa = isNa && canReverseNotApplicable(currentPersona)

  function handleNaConfirm(reason: string) {
    setNotApplicable(row.id, [partNo], naDialog === 'mark', currentPersona, reason)
    setNaDialog(null)
  }

  const actions = entry?.actions ?? []
  const ngRounds = entry?.ngRounds ?? []
  const openNgRound = ngRounds.find((r) => !r.resolvedAt)
  // Other activities of the same part: their NG rounds, deviations and open actions (for the References tab).
  const refs = useMemo(() => {
    if (!activity.canReferenceOtherActivities) return []
    return entries
      .filter((e) => e.partNo === partNo && e.activityId !== activity.id)
      .map((e) => {
        const act = activities.find((a) => a.id === e.activityId)
        return {
          activityName: act?.name ?? e.activityId,
          ngOpen: (e.ngRounds ?? []).filter((r) => !r.resolvedAt).length,
          ngTotal: (e.ngRounds ?? []).length,
          devs: (e.deviations ?? []).filter((d) => d.status !== 'Approved' && d.status !== 'Rejected').length,
          openActions: (e.actions ?? []).filter((a) => a.status !== 'Done').length
        }
      })
      .filter((r) => r.ngTotal > 0 || r.devs > 0 || r.openActions > 0)
  }, [activity.canReferenceOtherActivities, activity.id, entries, activities, partNo])
  const tabs: TabItem[] = [
    { id: 'form', label: 'Form' },
    ...(activity.trackNgRounds ? [{ id: 'ng', label: `NG rounds (${ngRounds.length})` }] : []),
    { id: 'documents', label: `Documents (${documents.filter((d) => d.entryId === entryId && (currentPersona !== 'Vendor' || d.uploadedBy === 'Vendor')).length})` },
    { id: 'actions', label: `Actions (${actions.length})` },
    { id: 'deviations', label: `Deviations (${(entry?.deviations ?? []).length})` },
    ...(activity.canReferenceOtherActivities ? [{ id: 'refs', label: `References (${refs.length})` }] : []),
    { id: 'history', label: `History (${entry?.history?.length ?? 0})` },
  ]

  // ── Excel template for this part's form ──
  const [excelReport, setExcelReport] = useState<UploadSummary | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)
  const excelInput = useRef<HTMLInputElement>(null)
  const effectivePicName = part ? getPicOn(part, picAssignments, DEMO_TODAY).name || currentPersona : currentPersona
  const excelColumns: FillColumn[] = activity.fields
    .filter((f) => excelFillable(f) && fieldVisibleToPersona(f, currentPersona) && f.enteredBy === currentPersona)
    .map((f) => ({ id: f.key, header: f.label, field: f }))
  const excelCanFill = !isNa && (canVendorEdit || canPicEnter)
  const excelMeta = { screen: 'part-form', activityId: activity.id, templateRowId: row.id, partNo, role: currentPersona }
  const excelRow: FillRow | null = part
    ? {
        partNo,
        section: part.section,
        partName: part.partName,
        model: part.model,
        editable: (id) => {
          const f = activity.fields.find((x) => x.key === id)
          return !!f && canPersonaEdit(f, currentPersona, entry) && conditionalState[id]?.visible !== false
        },
        value: (id) => localValues[id]
      }
    : null
  async function downloadExcelTemplate() {
    if (!excelRow) return
    setExcelBusy(true)
    try {
      const blob = await downloadFillTemplate({
        title: `${activity.name} · ${partNo} · ${currentPersona}`,
        note: 'One row for this part. Fill your own fields.',
        meta: excelMeta,
        columns: excelColumns,
        rows: [excelRow]
      })
      downloadBlob(blob, `${activity.id}_${partNo}_${currentPersona}_template.xlsx`)
      logAudit({ persona: currentPersona, actorName: currentPersona === 'Vendor' ? part!.vendorName : effectivePicName, action: 'Excel template downloaded', partNo, activityId: activity.id, templateRowId: row.id, detail: `${activity.name}, part form` })
    } finally {
      setExcelBusy(false)
    }
  }
  async function uploadExcel(file: File | undefined) {
    if (!file || !excelRow) return
    setExcelBusy(true)
    try {
      const summary = await applyUpload(file, excelMeta, excelColumns, [excelRow], (_r, id, value) => handleFieldChange(id, value))
      setExcelReport(summary)
      logAudit({
        persona: currentPersona,
        actorName: currentPersona === 'Vendor' ? part!.vendorName : effectivePicName,
        action: 'Excel upload staged',
        partNo,
        activityId: activity.id,
        templateRowId: row.id,
        detail: `${file.name}: ${summary.cellsStaged} value${summary.cellsStaged !== 1 ? 's' : ''} staged on the form for review, ${summary.issues.length} left out`
      })
    } finally {
      setExcelBusy(false)
      if (excelInput.current) excelInput.current.value = ''
    }
  }
  const visibleFields = activity.fields.filter((f) => !f.dataOnly && conditionalState[f.key]?.visible !== false && fieldVisibleToPersona(f, currentPersona))

  if (!part) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
        <div className="fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl flex items-center justify-center">
          <p className="text-[var(--color-muted)]">Part not found</p>
        </div>
      </>
    )
  }

  const currentPic = getPicOn(part, picAssignments, DEMO_TODAY)

  // Release-to-vendor gate. Only the PIC (and SIC/DPM who cover for the PIC) can release/recall.
  const rstate = getReleaseState(part.partNo, partReleases, partAcks)
  const released = rstate === 'Released' || rstate === 'Acknowledged'
  const returnInfo = rstate === 'Returned' ? latestReturn(part.partNo, partAcks) : undefined
  const canRelease = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  function handleRelease(next: boolean) {
    const actorName = currentPersona === 'PIC' ? currentPic.name || undefined : undefined
    releasePart({ partNo: part!.partNo, released: next, by: currentPersona, actorName, comment: releaseComment })
    setReleaseComment('')
  }

  // Vendor planned timeline. Shown only for activities the Admin opened for it.
  const vtAllowed = activity.allowVendorPlannedTimeline === true
  const vt = entry?.vendorTimeline
  const canEditTimeline =
    currentPersona === 'Vendor' || currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'

  function openTimelineEditor() {
    setTlStart(vt?.current.start ?? (templateDates.status === 'resolved' ? templateDates.start : ''))
    setTlEnd(vt?.current.end ?? (templateDates.status === 'resolved' ? templateDates.end : ''))
    setTlEditing(true)
  }

  function saveTimeline() {
    if (!tlStart || !tlEnd || tlStart > tlEnd) return
    const actorName = currentPersona === 'Vendor' ? part!.vendorName : undefined
    setVendorTimeline(row.id, part!.partNo, tlStart, tlEnd, currentPersona, actorName)
    setTlEditing(false)
  }

  // Actions / recommendations.
  const canManageActions = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'
  const picActorName = currentPersona === 'PIC' ? currentPic.name || undefined : undefined

  function createAction() {
    if (!naTitle.trim()) return
    addAction(
      row.id,
      part!.partNo,
      { title: naTitle, description: naDesc, assignedTo: 'Vendor', assignedToName: part!.vendorName, targetDate: naTarget || undefined },
      currentPersona,
      picActorName
    )
    setNaTitle('')
    setNaDesc('')
    setNaTarget('')
    setNewActionOpen(false)
  }

  function changeActionStatus(actionId: string, status: 'Open' | 'In progress' | 'Done') {
    const actorName = currentPersona === 'Vendor' ? part!.vendorName : picActorName
    updateAction(row.id, part!.partNo, actionId, { status }, currentPersona, actorName)
  }

  function changeActionTarget(actionId: string, targetDate: string) {
    updateAction(row.id, part!.partNo, actionId, { targetDate }, currentPersona, picActorName)
  }

  // Deviations.
  const deviations = entry?.deviations ?? []
  function createDeviation() {
    if (!devTitle.trim()) return
    addDeviation(row.id, part!.partNo, { title: devTitle, description: devDesc, edocNumber: devEdoc, targetDate: devTarget || undefined }, currentPersona, picActorName)
    setDevTitle(''); setDevDesc(''); setDevEdoc(''); setDevTarget(''); setNewDevOpen(false)
  }
  function decideDeviation(id: string, action: 'Approve' | 'Reject' | 'Send back') {
    advanceDeviation(row.id, part!.partNo, id, action, currentPersona, picActorName)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col max-lg:h-[100dvh] max-lg:overflow-y-auto">
        {/* Header (mobile: scrolls away with the form) */}
        <div className="border-b border-[var(--color-border)] px-5 py-4 flex-shrink-0 max-sm:px-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                {isNa && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#cbd5e1] bg-[#f1f5f9] px-2 py-1 text-[10px] font-medium text-[#475569]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
                    Not applicable
                  </span>
                )}
                {!isNa && <StatusPill
                  status={
                    entryState === 'Submitted' ? 'Submitted'
                    : entryState === 'Sent back' ? 'SentBack'
                    : entryState === 'Approved' ? 'Approved'
                    : 'Draft'
                  }
                  size="sm"
                />}
                <span className="text-xs text-[var(--color-muted)]">{part.type === 'NewPart' ? 'New Part' : 'ECN'}</span>
              </div>
              <h2 className="text-base font-semibold text-[var(--color-text)] truncate">{part.partName}</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5 font-mono">{part.partNo}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
              aria-label="Close"
              title="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-[var(--color-muted)]">
            <span>Model: <strong className="text-[var(--color-text)]">{part.model}</strong></span>
            <span>Vendor: <strong className="text-[var(--color-text)]">{part.vendorName}</strong></span>
            <span>Dept: <strong className="text-[var(--color-text)]">{part.department}</strong></span>
            <span>Section: <strong className="text-[var(--color-text)]">{part.section}</strong></span>
            <span>
              PIC:{' '}
              <strong className="text-[var(--color-text)]">{currentPic.name || 'Unassigned'}</strong>
              {currentPic.assignment && (
                <span className="ml-1 text-[10px]">
                  (assigned from {fmtDate(currentPic.assignment.effectiveFrom)})
                </span>
              )}
            </span>
            <span>
              {row.milestoneId} MRD:{' '}
              <strong className="text-[var(--color-text)]">{milestoneMrd ? fmtDate(milestoneMrd) : 'Awaiting MRD'}</strong>
            </span>
            <span>
              Planned:{' '}
              <strong className="text-[var(--color-text)]">
                {dates.status === 'resolved' ? `${fmtDate(dates.start)} → ${fmtDate(dates.end)}` : 'Awaiting MRD'}
              </strong>
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex-shrink-0 border-b border-[var(--color-border)] max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:bg-white max-sm:px-4">
          <Tabs items={tabs} activeId={activeTab} onChange={setActiveTab} className="max-lg:flex-nowrap" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 max-lg:flex-none max-lg:overflow-visible max-sm:p-4">
          {/* Release-to-vendor gate */}
          {released ? (
            <div
              className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                rstate === 'Acknowledged' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'
              }`}
            >
              <span className="font-medium">
                {rstate === 'Acknowledged' ? 'Released to vendor · acknowledged' : 'Released to vendor · awaiting acknowledgement'}
              </span>
              <span className={`text-xs ${rstate === 'Acknowledged' ? 'text-emerald-700' : 'text-blue-700'}`}>
                {rstate === 'Acknowledged'
                  ? 'The vendor has accepted this part and can act on it.'
                  : 'The vendor must acknowledge or return this part before working on it.'}
              </span>
              {canRelease && (
                <div className="ml-auto flex items-center gap-2">
                  <input
                    value={releaseComment}
                    onChange={(e) => setReleaseComment(e.target.value)}
                    placeholder="Reason for recall (optional)"
                    className="h-8 rounded-lg border border-emerald-200 bg-white px-2 text-[11px] text-[#344054] placeholder-[var(--color-muted)]"
                  />
                  <Button variant="secondary" size="sm" onClick={() => handleRelease(false)}>
                    Recall
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`mb-4 rounded-lg border px-3 py-2.5 text-sm ${
                rstate === 'Returned' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{rstate === 'Returned' ? 'Returned by vendor' : 'Not yet released to vendor'}</span>
                <span className={`text-xs ${rstate === 'Returned' ? 'text-red-700' : 'text-amber-700'}`}>
                  {rstate === 'Returned'
                    ? `Reason: ${returnInfo?.reason ?? '—'}. Fix the details and release it again.`
                    : 'Review the details above. The vendor can’t see this part until you release it. You can still do your own updates.'}
                </span>
              </div>
              {canRelease && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={releaseComment}
                    onChange={(e) => setReleaseComment(e.target.value)}
                    placeholder="Note (optional) — e.g. vendor code verified"
                    className="h-8 flex-1 rounded-lg border border-amber-200 bg-white px-2 text-[11px] text-[#344054] placeholder-[var(--color-muted)]"
                  />
                  <Button variant="primary" size="sm" onClick={() => handleRelease(true)}>
                    {rstate === 'Returned' ? 'Release again' : 'Release to vendor'}
                  </Button>
                </div>
              )}
            </div>
          )}
          <DelayReasonBlock
            activity={activity} row={row} partNo={partNo} partName={part?.partName ?? partNo} entry={entry}
            plannedEnd={plannedEnd} ryg={String(rygNow)} notApplicable={naNow} openRequest={delayOpenReq}
          />
          {/* Planned timeline (template vs vendor-set) */}
          {vtAllowed && (
            <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--color-text)]">Planned timeline</span>
                {canEditTimeline && !tlEditing && (
                  <Button variant="secondary" size="sm" onClick={openTimelineEditor}>
                    {vt ? 'Update timeline' : 'Set vendor timeline'}
                  </Button>
                )}
              </div>

              {/* Template baseline */}
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 flex-none text-[var(--color-muted)]">Template</span>
                <span className={vt ? 'text-[var(--color-muted)] line-through' : 'font-medium text-[var(--color-text)]'}>
                  {templateDates.status === 'resolved'
                    ? `${fmtDate(templateDates.start)} → ${fmtDate(templateDates.end)}`
                    : 'Awaiting MRD'}
                </span>
                {!vt && <span className="text-[10px] text-[var(--color-muted)]">· tracking uses this</span>}
              </div>

              {/* Vendor current + superseded versions (strikethrough) */}
              {vt && (
                <div className="mt-1.5 space-y-1 text-xs">
                  {vt.history.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-16 flex-none text-[var(--color-muted)]">Vendor</span>
                      <span className="text-[var(--color-muted)] line-through">
                        {fmtDate(h.start)} → {fmtDate(h.end)}
                      </span>
                      <span className="text-[10px] text-[var(--color-muted)]">· {h.setBy}, {fmtDate(h.at.slice(0, 10))}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="w-16 flex-none text-[var(--color-muted)]">Vendor</span>
                    <span className="font-medium text-[var(--color-text)]">
                      {fmtDate(vt.current.start)} → {fmtDate(vt.current.end)}
                    </span>
                    <span className="rounded-full bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-medium text-[#1d4ed8]">tracking uses this</span>
                  </div>
                </div>
              )}

              {/* Editor */}
              {tlEditing && (
                <div className="mt-2.5 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-2.5">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">Start</span>
                    <input type="date" value={tlStart} onChange={(e) => setTlStart(e.target.value)}
                      className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">End</span>
                    <input type="date" value={tlEnd} onChange={(e) => setTlEnd(e.target.value)}
                      className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" />
                  </label>
                  <Button variant="primary" size="sm" onClick={saveTimeline} disabled={!tlStart || !tlEnd || tlStart > tlEnd}>
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setTlEditing(false)}>Cancel</Button>
                  {tlStart && tlEnd && tlStart > tlEnd && (
                    <span className="w-full text-[10px] text-red-600">Start must not be after end.</span>
                  )}
                </div>
              )}
            </div>
          )}

          {isNa && entry?.notApplicable && (
            <div className="mb-4 rounded-lg border border-[#cbd5e1] bg-[#f1f5f9] px-3 py-2.5 text-sm text-[#334155]">
              <div className="font-medium">Not applicable for this part</div>
              <div className="mt-0.5 text-xs">
                Marked by <strong>{entry.notApplicable.by}</strong> on {fmtDate(entry.notApplicable.at.slice(0, 10))}
                {entry.notApplicable.reason ? <> — “{entry.notApplicable.reason}”</> : ' (no reason given)'}.
                The form is read-only and the part is excluded from completion %.
              </div>
            </div>
          )}
          {activeTab === 'documents' && (
            <DocumentsTab
              entryId={entryId}
              templateRowId={row.id}
              activityId={activity.id}
              partNo={partNo}
              persona={currentPersona}
              actorName={currentPersona === 'Vendor' ? part.vendorName : effectivePicName}
              open={!isNa}
            />
          )}
          {activeTab === 'form' && excelColumns.length > 0 && excelCanFill && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs">
              <span className="mr-auto text-[var(--color-muted)]">Fill this form from Excel: download the template, fill it in, upload it, then review and submit.</span>
              <Button variant="secondary" size="sm" disabled={excelBusy} onClick={downloadExcelTemplate}>Download Excel template</Button>
              <Button variant="secondary" size="sm" disabled={excelBusy} onClick={() => excelInput.current?.click()}>Upload Excel</Button>
              <input ref={excelInput} type="file" accept=".xlsx" className="hidden" aria-label="Upload filled Excel template" onChange={(e) => uploadExcel(e.target.files?.[0])} />
            </div>
          )}
          {activeTab === 'form' && excelReport && <UploadReport summary={excelReport} onClose={() => setExcelReport(null)} />}
          {activeTab === 'form' && ruleViolations.length > 0 && (
            <div role="alert" className="mb-3 rounded-lg border border-[#fcd34d] bg-[#fffbeb] px-3 py-2 text-xs text-[#78350f]">
              <div className="mb-1 font-semibold">Please correct these before saving or submitting</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {ruleViolations.map((v, i) => (
                  <li key={i}>{v.rowLabel ? `Row ${v.rowLabel}: ` : ''}{v.message}</li>
                ))}
              </ul>
            </div>
          )}
          {activeTab === 'form' && (
            <FormTab
              part={part}
              milestoneLabel={row.milestoneId}
              milestoneMrd={milestoneMrd}
              entry={entry}
              localValues={localValues}
              visibleFields={visibleFields}
              conditionalState={conditionalState}
              fetchState={fetchState}
              fieldErrors={fieldErrors}
              currentPersona={isNa ? '' : currentPersona}
              onFieldChange={handleFieldChange}
              onFetchField={handleFetchField}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTimeline history={entry?.history ?? []} />
          )}
          {activeTab === 'ng' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-muted)]">
                Each time the PIC marks a submission NG, a round is recorded here and the part goes back to the vendor to
                submit again. A round closes when a later submission is approved.
              </p>
              {ngRounds.length === 0 ? (
                <div className="rounded border border-dashed border-[var(--color-border)] py-8 text-center text-xs text-[var(--color-muted)]">
                  No NG rounds. {isPic ? 'Use “Mark NG” on a submitted entry to record one.' : ''}
                </div>
              ) : (
                <ol className="space-y-2">
                  {ngRounds.map((r) => (
                    <li key={r.round} className={`rounded-lg border px-3 py-2 ${r.resolvedAt ? 'border-[var(--color-border)] bg-[var(--color-surface)]' : 'border-[#fca5a5] bg-[#fef2f2]'}`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[var(--color-text)]">Round {r.round}</span>
                        <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.resolvedAt ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#b91c1c]'}`}>
                          {r.resolvedAt ? 'Cleared' : 'Open — awaiting resubmission'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-text)]">{r.reason}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
                        <span>Marked by {r.byName} on {fmtDate(r.at.slice(0, 10))}</span>
                        {r.targetDate && <span>Next submission target: {fmtDate(r.targetDate)}</span>}
                        {r.resolvedAt && <span>Cleared on {fmtDate(r.resolvedAt.slice(0, 10))}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {activeTab === 'refs' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-muted)]">
                NG rounds, open deviations and open actions on <strong>{partNo}</strong> from other activities. Read-only.
              </p>
              {refs.length === 0 ? (
                <div className="rounded border border-dashed border-[var(--color-border)] py-8 text-center text-xs text-[var(--color-muted)]">
                  Nothing outstanding on this part in other activities.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                      <th className="py-1.5 pr-2 font-medium">Activity</th>
                      <th className="py-1.5 pr-2 font-medium">NG rounds</th>
                      <th className="py-1.5 pr-2 font-medium">Open deviations</th>
                      <th className="py-1.5 font-medium">Open actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refs.map((r, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)]">
                        <td className="py-2 pr-2 font-medium text-[var(--color-text)]">{r.activityName}</td>
                        <td className="py-2 pr-2">{r.ngTotal > 0 ? `${r.ngTotal}${r.ngOpen > 0 ? ` (${r.ngOpen} open)` : ''}` : '—'}</td>
                        <td className="py-2 pr-2">{r.devs || '—'}</td>
                        <td className="py-2">{r.openActions || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {activeTab === 'actions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--color-muted)]">
                  Actions / recommendations raised on this activity, assigned to the vendor and tracked to a target date.
                </p>
                {canManageActions && !newActionOpen && (
                  <Button variant="primary" size="sm" onClick={() => setNewActionOpen(true)}>+ Add action</Button>
                )}
              </div>

              {/* New-action form */}
              {newActionOpen && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
                  <input
                    value={naTitle}
                    onChange={(e) => setNaTitle(e.target.value)}
                    placeholder="Action title (e.g. Submit revised drawing)"
                    className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-white px-2 text-[12px]"
                  />
                  <textarea
                    value={naDesc}
                    onChange={(e) => setNaDesc(e.target.value)}
                    placeholder="Details (optional)"
                    rows={2}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-[12px] resize-y"
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">Target date</span>
                      <input type="date" value={naTarget} onChange={(e) => setNaTarget(e.target.value)}
                        className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" />
                    </label>
                    <span className="text-[11px] text-[var(--color-muted)]">Assigned to <strong>Vendor</strong> ({part.vendorName})</span>
                    <div className="ml-auto flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setNewActionOpen(false); setNaTitle(''); setNaDesc(''); setNaTarget('') }}>Cancel</Button>
                      <Button variant="primary" size="sm" onClick={createAction} disabled={!naTitle.trim()}>Add</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action list */}
              {actions.length === 0 && !newActionOpen ? (
                <div className="py-8 text-center text-sm text-[var(--color-muted)]">No actions raised yet.</div>
              ) : (
                <ul className="space-y-2">
                  {actions.map((a) => {
                    const ryg = toRygStatus(actionRyg(a, DEMO_TODAY))
                    const lastTarget = a.targetHistory && a.targetHistory.length > 0 ? a.targetHistory[a.targetHistory.length - 1].targetDate : undefined
                    const canAdvance = canManageActions || currentPersona === a.assignedTo
                    return (
                      <li key={a.id} className="rounded-lg border border-[var(--color-border)] bg-white p-3">
                        <div className="flex items-start gap-2">
                          <RygDot status={ryg} size={10} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-[var(--color-text)]">{a.title}</span>
                              <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                a.status === 'Done' ? 'bg-emerald-100 text-emerald-800'
                                : a.status === 'In progress' ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'}`}>{a.status}</span>
                            </div>
                            {a.description && <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{a.description}</p>}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
                              <span>Assigned: <strong className="text-[var(--color-text)]">{a.assignedToName || a.assignedTo}</strong></span>
                              <span>
                                Target:{' '}
                                {lastTarget && <span className="text-[var(--color-muted)] line-through mr-1">{fmtDate(lastTarget)}</span>}
                                <strong className="text-[var(--color-text)]">{a.targetDate ? fmtDate(a.targetDate) : '—'}</strong>
                              </span>
                              {a.status === 'Done' && a.completedAt && <span>Done {fmtDate(a.completedAt.slice(0, 10))}</span>}
                            </div>

                            {/* Controls */}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {canAdvance && a.status !== 'In progress' && a.status !== 'Done' && (
                                <Button variant="secondary" size="sm" onClick={() => changeActionStatus(a.id, 'In progress')}>Start</Button>
                              )}
                              {canAdvance && a.status !== 'Done' && (
                                <Button variant="primary" size="sm" onClick={() => changeActionStatus(a.id, 'Done')}>Mark done</Button>
                              )}
                              {canAdvance && a.status === 'Done' && (
                                <Button variant="secondary" size="sm" onClick={() => changeActionStatus(a.id, 'Open')}>Reopen</Button>
                              )}
                              {canManageActions && (
                                <label className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                                  Reschedule
                                  <input type="date" value={a.targetDate ?? ''} onChange={(e) => changeActionTarget(a.id, e.target.value)}
                                    className="h-7 rounded border border-[var(--color-border)] bg-white px-1.5 text-[10px]" />
                                </label>
                              )}
                              {canManageActions && (
                                <button onClick={() => deleteAction(row.id, part.partNo, a.id, currentPersona)}
                                  className="ml-auto text-[10px] text-[var(--color-destructive)] hover:underline">Delete</button>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'deviations' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--color-muted)]">
                  Deviations move through this activity's approval chain ({(activity.deviationFlow && activity.deviationFlow.length ? activity.deviationFlow : ['PIC', 'SIC', 'DPM']).join(' → ')}).
                </p>
                {canManageActions && !newDevOpen && (
                  <Button variant="primary" size="sm" onClick={() => setNewDevOpen(true)}>+ Raise deviation</Button>
                )}
              </div>

              {newDevOpen && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
                  <input value={devTitle} onChange={(e) => setDevTitle(e.target.value)} placeholder="Deviation title" className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-white px-2 text-[12px]" />
                  <textarea value={devDesc} onChange={(e) => setDevDesc(e.target.value)} placeholder="Details (optional)" rows={2} className="w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-[12px] resize-y" />
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block"><span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">E-Doc no.</span>
                      <input value={devEdoc} onChange={(e) => setDevEdoc(e.target.value)} className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" /></label>
                    <label className="block"><span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">Target date</span>
                      <input type="date" value={devTarget} onChange={(e) => setDevTarget(e.target.value)} className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" /></label>
                    <div className="ml-auto flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setNewDevOpen(false); setDevTitle(''); setDevDesc(''); setDevEdoc(''); setDevTarget('') }}>Cancel</Button>
                      <Button variant="primary" size="sm" onClick={createDeviation} disabled={!devTitle.trim()}>Raise</Button>
                    </div>
                  </div>
                </div>
              )}

              {deviations.length === 0 && !newDevOpen ? (
                <div className="py-8 text-center text-sm text-[var(--color-muted)]">No deviations raised.</div>
              ) : (
                <ul className="space-y-2">
                  {deviations.map((d) => {
                    const open = d.status === 'In progress' || d.status === 'Sent back'
                    const stageRole = open ? d.flow[d.currentStep] : ''
                    const canAct = open && (currentPersona === 'Admin' || stageRole === currentPersona)
                    const statusTone = d.status === 'Approved' ? 'bg-emerald-100 text-emerald-800'
                      : d.status === 'Rejected' ? 'bg-red-100 text-red-700'
                      : d.status === 'Sent back' ? 'bg-slate-100 text-slate-600'
                      : 'bg-amber-100 text-amber-800'
                    return (
                      <li key={d.id} className="rounded-lg border border-[var(--color-border)] bg-white p-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-[var(--color-text)]">{d.title}</span>
                              <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusTone}`}>{d.status}</span>
                            </div>
                            {d.description && <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{d.description}</p>}
                            <div className="mt-1.5 flex items-center gap-1">
                              {d.flow.map((role, i) => {
                                const done = d.status === 'Approved' ? true : i < d.currentStep
                                const active = open && i === d.currentStep
                                return (
                                  <span key={role} className="flex items-center gap-1">
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${done ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : 'bg-slate-100 text-slate-500'}`}>{role}</span>
                                    {i < d.flow.length - 1 && <span className="text-[9px] text-[var(--color-muted)]">→</span>}
                                  </span>
                                )
                              })}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-[var(--color-muted)]">
                              <span>raised by {d.raisedBy}</span>
                              {d.edocNumber && <span>E-Doc {d.edocNumber}</span>}
                              {d.targetDate && <span>target {fmtDate(d.targetDate)}</span>}
                            </div>
                            {canAct && (
                              <div className="mt-2 flex gap-1.5">
                                <Button variant="primary" size="sm" onClick={() => decideDeviation(d.id, 'Approve')}>Approve</Button>
                                <Button variant="secondary" size="sm" onClick={() => decideDeviation(d.id, 'Send back')}>Send back</Button>
                                <button onClick={() => decideDeviation(d.id, 'Reject')} className="text-[10px] text-[var(--color-destructive)] hover:underline">Reject</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-5 py-3 flex-shrink-0 max-lg:sticky max-lg:bottom-0 max-lg:mt-auto max-lg:bg-white max-sm:px-4">
          {/* PIC validation actions */}
          {isPic && isSubmitted && (
            <div className="mb-3">
              <label className="text-xs font-medium text-[var(--color-muted)] block mb-1">
                Comment (optional)
              </label>
              <input
                type="text"
                value={picComment}
                onChange={(e) => setPicComment(e.target.value)}
                placeholder="Add a comment…"
                className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] mb-2"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={handleApprove}><FbIcon name="check" size={14} className="mr-1" />Approve</Button>
                <Button variant="secondary" size="sm" onClick={handlePicEdit}><FbIcon name="pen" size={14} className="mr-1" />Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setShowSendBackModal(true)}><FbIcon name="undo" size={14} className="mr-1" />Send back</Button>
                {activity.trackNgRounds && (
                  <Button variant="danger" size="sm" onClick={() => setShowNgModal(true)} title="Reject this submission as NG and send it back for resubmission">
                    <FbIcon name="close" size={14} className="mr-1" />Mark NG
                  </Button>
                )}
              </div>
            </div>
          )}
          {activity.trackNgRounds && openNgRound && entryState !== 'Approved' && !isNa && (
            <p className="mb-2 rounded-md bg-[#fef2f2] px-2.5 py-1.5 text-[11px] text-[#b91c1c]">
              NG round {openNgRound.round} open — vendor to resubmit{openNgRound.targetDate ? ` by ${fmtDate(openNgRound.targetDate)}` : ''}. “{openNgRound.reason}”
            </p>
          )}

          {/* Vendor / entering persona actions */}
          {(canVendorEdit || canPicEnter) && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleSave}>Save draft</Button>
              <Button variant="primary" size="sm" onClick={handleSubmit}>Submit</Button>
            </div>
          )}

          {(showMarkNa || showReverseNa) && (
            <div className="flex items-center gap-2">
              {showMarkNa && (
                <Button variant="secondary" size="sm" onClick={() => setNaDialog('mark')}>
                  Mark Not applicable
                </Button>
              )}
              {showReverseNa && (
                <Button variant="secondary" size="sm" onClick={() => setNaDialog('reverse')}>
                  Mark applicable again
                </Button>
              )}
            </div>
          )}

          {entryState === 'Approved' && !isNa && (
            <p className="mt-2 text-sm text-[#047857] font-medium"><FbIcon name="check-circle" size={16} className="mr-1" />Entry approved</p>
          )}

          {!isPic && !canVendorEdit && !canPicEnter && entryState !== 'Approved' && !showReverseNa && (
            <p className="text-xs text-[var(--color-muted)]">
              Read-only — you are viewing as <strong>{currentPersona}</strong>.
            </p>
          )}
        </div>
      </div>

      <ApplicabilityDialog
        open={naDialog !== null}
        markNotApplicable={naDialog === 'mark'}
        subject={part.partName}
        onCancel={() => setNaDialog(null)}
        onConfirm={handleNaConfirm}
      />

      {/* Send-back modal */}
      <Modal
        open={showSendBackModal}
        onClose={() => setShowSendBackModal(false)}
        title="Send back to vendor"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowSendBackModal(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleSendBack}>Send back</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-muted)] mb-3">
          Provide a reason so the vendor knows what to correct.
        </p>
        <textarea
          rows={4}
          value={sendBackComment}
          onChange={(e) => setSendBackComment(e.target.value)}
          placeholder="Describe what needs to be fixed…"
          className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-y"
        />
      </Modal>

      {/* Mark NG modal */}
      <Modal
        open={showNgModal}
        onClose={() => setShowNgModal(false)}
        title={`Mark NG — round ${(entry?.ngRounds?.length ?? 0) + 1}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowNgModal(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleMarkNg} disabled={!ngReason.trim()}>Mark NG & send back</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-muted)] mb-3">
          This rejects the vendor's submission as NG (no-go) and sends the part back to be submitted again. The round is
          recorded with the reason and (optionally) a target date for the next submission.
        </p>
        <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">NG reason</label>
        <textarea
          rows={3}
          value={ngReason}
          onChange={(e) => setNgReason(e.target.value)}
          placeholder="What failed and what the vendor must correct…"
          className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-y"
        />
        <label className="mt-3 block text-xs font-medium text-[var(--color-muted)] mb-1">Target date for next submission (optional)</label>
        <input
          type="date"
          value={ngTarget}
          onChange={(e) => setNgTarget(e.target.value)}
          className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </Modal>

      {/* Deviation popup */}
      {showDeviation && (
        <DeviationPopup
          partNo={partNo}
          mrd={milestoneMrd ?? ''}
          activityId={activity.id}
          initialEdocNumber={localValues['edoc_number'] ?? ''}
          onClose={() => setShowDeviation(false)}
          onEdocSave={(edocNo, deviationStatus) => {
            handleFieldChange('edoc_number', edocNo)
            handleFieldChange('deviation_status', deviationStatus)
            setShowDeviation(false)
          }}
        />
      )}
    </>
  )
}

// ── FormTab ────────────────────────────────────────────────────────────────────

interface FormTabProps {
  part: PartRecord | undefined
  milestoneLabel: string
  milestoneMrd: string | undefined
  entry: ActivityEntry | undefined
  localValues: Record<string, any>
  visibleFields: FieldDefinition[]
  conditionalState: Record<string, { visible: boolean; mandatory: boolean }>
  fetchState: Record<string, FetchEntry>
  fieldErrors: Record<string, string>
  currentPersona: string
  onFieldChange: (key: string, value: any) => void
  onFetchField: (field: FieldDefinition) => void
}

function FormTab({
  part,
  milestoneLabel,
  milestoneMrd,
  entry,
  localValues,
  visibleFields,
  conditionalState,
  fetchState,
  fieldErrors,
  currentPersona,
  onFieldChange,
  onFetchField,
}: FormTabProps) {
  const sentBackFields = useMemo(() => {
    if (!entry?.fieldMeta) return {} as Record<string, string>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(entry.fieldMeta)) {
      if (v.status === 'Send back' && v.comment) out[k] = v.comment
    }
    return out
  }, [entry])

  return (
    <div className="space-y-4">
      {/* Common part info */}
      <div className="bg-[var(--color-surface)] rounded-lg p-3 text-xs text-[var(--color-muted)] grid grid-cols-2 gap-x-4 gap-y-1">
        <div><span className="font-medium">Part No:</span> <span className="font-mono">{part?.partNo}</span></div>
        <div><span className="font-medium">Model:</span> {part?.model}</div>
        <div><span className="font-medium">Vendor:</span> {part?.vendorName}</div>
        <div><span className="font-medium">Department:</span> {part?.department}</div>
        <div><span className="font-medium">{milestoneLabel} MRD:</span> {milestoneMrd ? fmtDate(milestoneMrd) : 'Awaiting MRD'}</div>
        <div><span className="font-medium">Type:</span> {part?.type === 'NewPart' ? 'New Part' : 'ECN'}</div>
      </div>

      {visibleFields.map((field) => {
        const fieldState = conditionalState[field.key]
        const isMandatory = fieldState?.mandatory ?? field.mandatory
        const isEditable = canPersonaEdit(field, currentPersona, entry)
        const renderer = getFieldRenderer(field.type)
        const value = localValues[field.key]
        const fs = fetchState[field.key]
        const error = fieldErrors[field.key]
        const sentBackComment = sentBackFields[field.key]

        // A table field can have columns owned by different personas (e.g. Vendor rows + PIC "Reason for
        // acceptance"), so always render its editor and let it gate per column. It is fully disabled only
        // when the entry is locked for everyone (Not applicable), handled by canPersonaEdit on scalar fields.
        const isTable = field.type === 'table'
        const tableOwnsAColumn =
          isTable && (field.columns ?? []).some((c) => (c.enteredBy ?? field.enteredBy) === currentPersona)

        return (
          <div key={field.key}>
            {sentBackComment && (
              <div className="mb-1 px-2 py-1 bg-[#fffbeb] border border-[#fde68a] rounded text-xs text-[#b45309]">
                <FbIcon name="exclamation-circle" size={14} className="mr-1" />Sent back: {sentBackComment}
              </div>
            )}

            <div className={error ? 'ring-1 ring-ryg-red rounded p-1' : ''}>
              {isTable
                ? renderer.editor({
                    field: { ...field, mandatory: isMandatory },
                    value,
                    onChange: (v) => onFieldChange(field.key, v),
                    disabled: !tableOwnsAColumn,
                    currentPersona
                  })
                : isEditable
                ? renderer.editor({
                    field: { ...field, mandatory: isMandatory },
                    value,
                    onChange: (v) => onFieldChange(field.key, v),
                    currentPersona
                  })
                : renderer.preview({ field, value })}
            </div>

            {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <SourceBadge source={field.source as any} size="sm" />
              {isMandatory && <span className="text-xs text-destructive" title="Required">*</span>}

              {isFetchedSource(field.source) && (
                <div className="flex items-center gap-1.5 ml-auto">
                  {fs?.lastFetched && !fs.loading && (
                    <span className="text-[10px] text-[var(--color-muted)]">
                      Fetched {new Date(fs.lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {fs?.error && (
                    <span className="text-[10px] text-[#b45309]"><FbIcon name="exclamation-circle" size={12} className="mr-1" />Not available</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onFetchField(field)}
                    disabled={fs?.loading}
                    className={`text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors ${fs?.loading ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    <><FbIcon name="refresh" size={12} className="mr-1" />{fs?.loading ? 'Fetching…' : 'Refresh'}</>
                  </button>
                </div>
              )}
            </div>

            {isFetchedSource(field.source) && fs?.error && (
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5 italic">
                Not available in {field.source.toUpperCase()} — enter the target date manually if needed.
              </p>
            )}
          </div>
        )
      })}

      {visibleFields.length === 0 && (
        <p className="text-sm text-[var(--color-muted)] text-center py-8">No fields applicable for this entry.</p>
      )}
    </div>
  )
}
