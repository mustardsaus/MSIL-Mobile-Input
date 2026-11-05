import { Icon as FbIcon } from '../../components/Icon'
import { useState, useMemo } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { calculateRYG, resolveInstanceDates, resolveTrackedDates, completionPct, getMilestoneMrd, isWorkableByVendor } from '../../engine'
import { Button, Card, RygDot, StatusPill, ApplicabilityDialog } from '../../components'
import type { RygStatus } from '../../components/RygDot'
import type { StatusValue } from '../../components/StatusPill'
import type { PartRecord } from '../../domain'
import { PartDetailDrawer } from './PartDetailDrawer'
import { listColumnFields, listCellTexts } from '../listColumns'
import { useIsMobile } from '../../hooks/useIsMobile'
import { DEMO_TODAY, fmtDate, fmtOffsetRange, partInScope, rowInScope, toRygStatus, canMarkNotApplicable, canReverseNotApplicable } from '../scope'
import { isUpcoming, useUpcomingOnly, UpcomingToggle } from '../upcoming'

type TypeFilter = 'All' | 'NewPart' | 'ECN'
type StatusFilter = 'All' | 'Draft' | 'Submitted' | 'Sent back' | 'Approved' | 'NotStarted'
type ApplicabilityFilter = 'All' | 'applicable' | 'na'

export function WorkspacePage() {
  // The route param is the template row id (an activity under a milestone for a section).
  const { id } = useParams<{ id: string }>()
  const isMobile = useIsMobile()
  const { activities, entries, templateRows, models: modelRecords, parts, partReleases, partAcks, setNotApplicable } = useQAStore()
  const { currentPersona } = usePersonaStore()

  const row = templateRows.find((r) => r.id === id)
  const activity = row ? activities.find((a) => a.id === row.activityId) : undefined
  const rowAllowed = !!row && rowInScope(row, currentPersona)

  // Filters synced via Search Params
  const [searchParams, setSearchParams] = useSearchParams()

  const modelFilter = searchParams.get('model') || 'All'
  const vendorFilter = searchParams.get('vendor') || 'All'
  const typeFilter = (searchParams.get('type') as TypeFilter) || 'All'
  const statusFilter = (searchParams.get('status') as StatusFilter) || 'All'
  const rygFilter = searchParams.get('ryg') || 'All'
  const applicabilityFilter = (searchParams.get('applicability') as ApplicabilityFilter) || 'All'

  const setModelFilter = (val: string) => {
    setSearchParams((prev) => {
      if (val === 'All') prev.delete('model')
      else prev.set('model', val)
      return prev
    })
  }

  const setVendorFilter = (val: string) => {
    setSearchParams((prev) => {
      if (val === 'All') prev.delete('vendor')
      else prev.set('vendor', val)
      return prev
    })
  }

  const setTypeFilter = (val: TypeFilter) => {
    setSearchParams((prev) => {
      if (val === 'All') prev.delete('type')
      else prev.set('type', val)
      return prev
    })
  }

  const setStatusFilter = (val: StatusFilter) => {
    setSearchParams((prev) => {
      if (val === 'All') prev.delete('status')
      else prev.set('status', val)
      return prev
    })
  }

  const setApplicabilityFilter = (val: ApplicabilityFilter) => {
    setSearchParams((prev) => {
      if (val === 'All') prev.delete('applicability')
      else prev.set('applicability', val)
      return prev
    })
  }

  const setRygFilter = (val: string) => {
    setSearchParams((prev) => {
      if (val === 'All') prev.delete('ryg')
      else prev.set('ryg', val.toLowerCase())
      return prev
    })
  }

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Drawer: the open part lives in the URL (?part=) so a link, for example from the dashboards, opens a part's form
  const partParam = searchParams.get('part')
  const setOpenPartNo = (partNo: string | null) => {
    setSearchParams((prev) => {
      if (partNo) prev.set('part', partNo)
      else prev.delete('part')
      return prev
    })
  }
  const [naDialog, setNaDialog] = useState<'mark' | 'reverse' | null>(null)

  const today = DEMO_TODAY
  const upcomingOnly = useUpcomingOnly()

  // Parts tagged to this row's section, applicable to the activity scope, and visible to the persona
  const applicableParts = useMemo<PartRecord[]>(() => {
    if (!activity || !row || !rowAllowed) return []
    return parts.filter((p) => {
      if (p.supersededBy) return false // superseded by ECN transfer — tracked under the new part
      if (p.section !== row.section) return false
      if (!partInScope(p, currentPersona)) return false
      // Release gate: the vendor works only on parts it has acknowledged after the PIC released them.
      if (currentPersona === 'Vendor' && !isWorkableByVendor(p.partNo, partReleases, partAcks)) return false
      if (activity.scope === 'NewPart') return p.type === 'NewPart'
      if (activity.scope === 'ECN') return p.type === 'ECN'
      return true
    })
  }, [activity, row, rowAllowed, currentPersona, parts, partReleases, partAcks])

  // Tracked dates per part: a vendor-set timeline overrides the template (MRD-offset) dates.
  const datesByPart = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveTrackedDates>>()
    if (!row) return map
    for (const p of applicableParts) {
      const entry = entries.find((e) => e.templateRowId === row.id && e.partNo === p.partNo)
      map.set(p.partNo, resolveTrackedDates(row, modelRecords.find((m) => m.name === p.model), entry, activity, p))
    }
    return map
  }, [row, applicableParts, modelRecords, entries, activity])

  // Template (MRD-offset) dates per part — used to show the superseded range struck through under a vendor override.
  const templateDatesByPart = useMemo(() => {
    const map = new Map<string, string>()
    if (!row) return map
    for (const p of applicableParts) {
      const d = resolveInstanceDates(row, modelRecords.find((m) => m.name === p.model), activity, p)
      if (d.status === 'resolved') map.set(p.partNo, `${fmtDate(d.start)} → ${fmtDate(d.end)}`)
    }
    return map
  }, [row, applicableParts, modelRecords, activity])

  const awaitingCount = useMemo(
    () => applicableParts.filter((p) => datesByPart.get(p.partNo)?.status === 'awaitingMrd').length,
    [applicableParts, datesByPart]
  )

  // Header date range across parts whose MRD is known
  const dateRange = useMemo(() => {
    let start: string | undefined
    let end: string | undefined
    for (const d of datesByPart.values()) {
      if (d.status !== 'resolved') continue
      if (!start || d.start < start) start = d.start
      if (!end || d.end > end) end = d.end
    }
    return start && end ? { start, end } : null
  }, [datesByPart])

  // Unique models + vendors for filter dropdowns
  const models = useMemo(() => Array.from(new Set(applicableParts.map((p) => p.model))).sort(), [applicableParts])
  const vendors = useMemo(() => Array.from(new Set(applicableParts.map((p) => p.vendorName))).sort(), [applicableParts])

  // Entry lookup
  const entryMap = useMemo(() => {
    const map = new Map<string, (typeof entries)[0]>()
    for (const e of entries) {
      if (e.templateRowId === id) map.set(e.partNo, e)
    }
    return map
  }, [entries, id])

  // Filtered parts
  const filteredParts = useMemo(() => {
    return applicableParts.filter((p) => {
      if (modelFilter !== 'All' && p.model !== modelFilter) return false
      if (vendorFilter !== 'All' && p.vendorName !== vendorFilter) return false
      if (typeFilter !== 'All' && p.type !== typeFilter) return false
      // PIC default: only parts whose activity is due or starting in the next 30 days.
      if (upcomingOnly) {
        const d = datesByPart.get(p.partNo)
        if (!d || !isUpcoming(d)) return false
      }
      if (applicabilityFilter !== 'All') {
        const na = !!entryMap.get(p.partNo)?.notApplicable
        if (applicabilityFilter === 'na' ? !na : na) return false
      }
      if (statusFilter !== 'All') {
        const entry = entryMap.get(p.partNo)
        if (entry?.notApplicable) return false // Not applicable is its own bucket, not a validation state
        const state = entry ? entry.validationState : 'NotStarted'
        const normalized = state === 'Sent back' ? 'Sent back' : state
        if (statusFilter === 'NotStarted' && entry) return false
        if (statusFilter !== 'NotStarted' && normalized !== statusFilter) return false
      }
      if (rygFilter !== 'All') {
        const entry = entryMap.get(p.partNo)
        if (entry?.notApplicable) return false // Not applicable has no RYG
        const state = entry?.validationState ?? 'Draft'
        const dates = datesByPart.get(p.partNo)
        if (!dates) return false
        const ryg = calculateRYG(dates, state, today)
        if (ryg.toLowerCase() !== rygFilter.toLowerCase()) return false
      }
      return true
    })
  }, [applicableParts, modelFilter, vendorFilter, typeFilter, applicabilityFilter, statusFilter, rygFilter, entryMap, datesByPart, today, upcomingOnly])

  // RYG summary
  const rygSummary = useMemo(() => {
    let g = 0, y = 0, r = 0, grey = 0, na = 0
    for (const p of applicableParts) {
      const entry = entryMap.get(p.partNo)
      if (entry?.notApplicable) { na++; continue }
      const state = entry?.validationState ?? 'Draft'
      const dates = datesByPart.get(p.partNo)
      if (!dates) continue
      const ryg = calculateRYG(dates, state, today)
      if (ryg === 'Green') g++
      else if (ryg === 'Yellow') y++
      else if (ryg === 'Red') r++
      else grey++
    }
    return { green: g, yellow: y, red: r, grey, na }
  }, [applicableParts, entryMap, datesByPart, today])

  // Completion %
  const completion = useMemo(
    () =>
      completionPct(
        applicableParts.map((p) => {
          const e = entryMap.get(p.partNo)
          return { status: e ? e.validationState : ('NotStarted' as const), notApplicable: !!e?.notApplicable }
        })
      ),
    [applicableParts, entryMap]
  )

  if (!row || !activity) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--color-muted)]">
        <p className="mb-3 text-[var(--color-muted)]"><FbIcon name="search" size={36} /></p>
        <p className="font-medium">Activity not found</p>
        <Link to="/activities" className="mt-4 text-sm text-[var(--color-accent)] hover:underline">← Back to Activities</Link>
      </div>
    )
  }

  if (!rowAllowed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--color-muted)]">
        <p className="mb-3 text-[var(--color-muted)]"><FbIcon name="lock" size={36} /></p>
        <p className="font-medium">Not available for your role</p>
        <p className="text-sm mt-1">This activity belongs to section {row.section}, which is outside your scope.</p>
        <Link to="/activities" className="mt-4 text-sm text-[var(--color-accent)] hover:underline">← Back to Activities</Link>
      </div>
    )
  }

  // Bulk actions
  // Applicability: only for activities Admin allowed; PIC marks, PIC/SIC/Admin reverse
  const allowsNa = activity.allowNotApplicable === true
  // Only a part of this row that the persona may see can be opened by the link
  const openPartNo = partParam && applicableParts.some((p) => p.partNo === partParam) ? partParam : null

  // Activity fields the Admin ticked as extra columns (Builder > Fields > "Part list")
  const extraFields = listColumnFields(activity, 'part', currentPersona)

  const selectedNa = [...selected].filter((n) => entryMap.get(n)?.notApplicable)
  const selectedApplicable = [...selected].filter((n) => !entryMap.get(n)?.notApplicable)
  const canMark = allowsNa && canMarkNotApplicable(currentPersona)
  const canReverse = canReverseNotApplicable(currentPersona)
  const naTargets = naDialog === 'mark' ? selectedApplicable : selectedNa

  function handleNaConfirm(reason: string) {
    if (naDialog) setNotApplicable(row!.id, naTargets, naDialog === 'mark', currentPersona, reason)
    setNaDialog(null)
    setSelected(new Set())
  }

  function toggleSelect(partNo: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(partNo)) next.delete(partNo)
      else next.add(partNo)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filteredParts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredParts.map((p) => p.partNo)))
    }
  }

  function getEntryStatus(partNo: string): StatusValue {
    const entry = entryMap.get(partNo)
    if (!entry) return 'NotStarted'
    const s = entry.validationState
    if (s === 'Draft') return 'Draft'
    if (s === 'Submitted') return 'Submitted'
    if (s === 'Sent back') return 'SentBack'
    if (s === 'Approved') return 'Approved'
    return 'Draft'
  }

  function getRygForPart(partNo: string): RygStatus {
    const entry = entryMap.get(partNo)
    const state = entry?.validationState ?? 'Draft'
    const dates = datesByPart.get(partNo)
    return dates ? toRygStatus(calculateRYG(dates, state, today)) : 'grey'
  }

  const hasFilters = modelFilter !== 'All' || vendorFilter !== 'All' || typeFilter !== 'All' || statusFilter !== 'All' || rygFilter !== 'All' || applicabilityFilter !== 'All'

  return (
    <div className="max-w-[1600px]">
      {/* Breadcrumb */}
      <nav className="mb-3 flex items-center gap-2 text-[11px] text-[#596579]" aria-label="Breadcrumb">
        <Link to="/" className="hover:underline">EPMP</Link>
        <span aria-hidden="true">›</span>
        <Link to="/activities" className="hover:underline">Activities</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[#344054]" aria-current="page">{activity.name}</span>
      </nav>

      {/* Header */}
      <div className="epmp-card px-6 py-5 mb-5 max-sm:px-4 max-sm:py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Mobile: the title block takes the full width; the RYG counts and % sit on their own row below. */}
          <div className="flex-1 min-w-0 max-md:basis-full">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <span className="text-xs font-medium bg-secondary text-primary px-2 py-0.5 rounded">
                {row.milestoneId}
              </span>
              <span className="text-xs font-medium bg-surface text-[var(--color-ink-muted)] px-2 py-0.5 rounded">
                {row.section}
              </span>
              <span className="text-xs text-[var(--color-muted)]">{fmtOffsetRange(row)}</span>
              <span className="text-xs text-[var(--color-muted)]">
                {activity.scope === 'Both' ? 'New Part + ECN' : activity.scope === 'NewPart' ? 'New Part' : 'ECN'}
              </span>
            </div>
            <h1 className="m-0 text-[23px] font-semibold leading-8 tracking-[-0.3px] text-[var(--color-text)] max-sm:text-[20px] max-sm:leading-7">
              {activity.name}
              {row.subType && <span className="ml-2 align-middle rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">{row.milestoneId} · {row.subType}</span>}
            </h1>
            {activity.description && (
              <p className="text-sm text-[var(--color-muted)] mt-1">{activity.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-[var(--color-muted)]">
              <span>
                <FbIcon name="calendar-month" size={16} className="mr-1.5 text-[var(--color-muted)]" />
                {dateRange ? `${fmtDate(dateRange.start)} → ${fmtDate(dateRange.end)}` : <em>Awaiting MRD</em>}
                {awaitingCount > 0 && dateRange && ` (+${awaitingCount} awaiting MRD)`}
              </span>
              <span>Owner: <strong className="text-[var(--color-text)]">{activity.ownerPersona}</strong></span>
              <UpcomingToggle />
            </div>
          </div>

          {/* RYG Summary + Completion */}
          <div className="flex items-center gap-6 flex-shrink-0 max-md:w-full max-md:justify-between max-md:border-t max-md:border-[var(--color-border)] max-md:pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                <RygDot status="green" size={12} />
                <span className="text-sm text-[var(--color-muted)]">{rygSummary.green}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RygDot status="yellow" size={12} />
                <span className="text-sm text-[var(--color-muted)]">{rygSummary.yellow}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RygDot status="red" size={12} />
                <span className="text-sm text-[var(--color-muted)]">{rygSummary.red}</span>
              </div>
              <div className="flex items-center gap-1.5" title="Awaiting MRD">
                <RygDot status="grey" size={12} />
                <span className="text-sm text-[var(--color-muted)]">{rygSummary.grey}</span>
              </div>
              {allowsNa || rygSummary.na > 0 ? (
                <div className="flex items-center gap-1.5" title="Not applicable">
                  <RygDot status="na" size={12} />
                  <span className="text-sm text-[var(--color-muted)]">{rygSummary.na} N/A</span>
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-[var(--color-text)]">{completion}%</div>
              <div className="text-xs text-[var(--color-muted)]">Complete</div>
              <div className="w-20 bg-surface rounded-full h-1.5 mt-1">
                <div
                  className="h-1.5 rounded-full bg-ryg-green transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters row (mobile: an even two-column grid; count and Clear span the full width) */}
      <div className="flex flex-wrap gap-2 mb-3 items-center max-sm:grid max-sm:grid-cols-2 max-sm:[&>select]:w-full max-sm:[&>button]:col-span-2 max-sm:[&>button]:text-left max-sm:[&>span]:col-span-2 max-sm:[&>span]:text-right">
        <select
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          aria-label="Filter by model"
          className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="All">All Models</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          aria-label="Filter by vendor"
          className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="All">All Vendors</option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          aria-label="Filter by part type"
          className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="All">New Part + ECN</option>
          <option value="NewPart">New Part</option>
          <option value="ECN">ECN</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by validation status"
          className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="All">All Statuses</option>
          <option value="NotStarted">Not Started</option>
          <option value="Draft">Draft</option>
          <option value="Submitted">Submitted</option>
          <option value="Sent back">Sent Back</option>
          <option value="Approved">Approved</option>
        </select>
        {(allowsNa || rygSummary.na > 0) && (
          <select
            value={applicabilityFilter}
            onChange={(e) => setApplicabilityFilter(e.target.value as ApplicabilityFilter)}
            aria-label="Filter by applicability"
            className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="All">All Applicability</option>
            <option value="applicable">Applicable</option>
            <option value="na">Not applicable</option>
          </select>
        )}
        <select
          value={rygFilter}
          onChange={(e) => setRygFilter(e.target.value)}
          aria-label="Filter by RYG status"
          className="border border-[var(--color-border)] rounded px-3 py-1.5 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="All">All RYG Statuses</option>
          <option value="green">Green</option>
          <option value="yellow">Yellow</option>
          <option value="red">Red</option>
          <option value="grey">Awaiting MRD</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => setSearchParams(new URLSearchParams())}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto inline-flex items-center whitespace-nowrap rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-primary">
          {filteredParts.length} of {applicableParts.length} parts
        </span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-secondary border border-[#bfdbfe] rounded-lg px-4 py-2 mb-3 text-sm">
          <span className="font-medium text-primary">{selected.size} selected</span>
          {canMark && (
            <Button
              variant="secondary"
              size="sm"
              disabled={selectedApplicable.length === 0}
              onClick={() => setNaDialog('mark')}
            >
              Mark Not applicable ({selectedApplicable.length})
            </Button>
          )}
          {canReverse && (
            <Button
              variant="secondary"
              size="sm"
              disabled={selectedNa.length === 0}
              onClick={() => setNaDialog('reverse')}
            >
              Mark applicable again ({selectedNa.length})
            </Button>
          )}
          {!canMark && !canReverse && (
            <span className="text-xs text-[var(--color-muted)]">
              {allowsNa ? 'Only a PIC can mark parts Not applicable.' : 'This activity applies to every part.'}
            </span>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[var(--color-muted)] hover:text-[var(--color-text)] text-xs"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Part list table */}
      <div data-tour="part-list">
      <Card flush className="!overflow-visible">
        {filteredParts.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-muted)]">
            <p className="mb-3 text-[var(--color-muted)]"><FbIcon name="clipboard-list" size={32} /></p>
            <p className="font-medium">No parts match your filters</p>
          </div>
        ) : (
          // Mobile: sideways scroll with the Open column pinned right (laptop unchanged).
          <div className={`table-scroll ${isMobile ? 'tbl-sleeve tbl-sleeve-r' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filteredParts.length && filteredParts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">Part No.</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">Part Name</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">Model</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">Vendor</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">Dept</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">Planned Start → End</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">Type</th>
                  {extraFields.map((f) => (
                    <th key={f.key} className="text-left px-3 py-3 font-medium text-[var(--color-muted)] whitespace-nowrap">{f.label}</th>
                  ))}
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">Status</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-muted)]">RYG</th>
                  <th className="px-3 py-3 text-right font-medium text-[var(--color-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((part, i) => {
                  const status = getEntryStatus(part.partNo)
                  const ryg = getRygForPart(part.partNo)
                  const isSelected = selected.has(part.partNo)
                  const naMark = entryMap.get(part.partNo)?.notApplicable
                  const isNa = !!naMark
                  const extraTexts = listCellTexts(
                    activity, extraFields, entryMap.get(part.partNo), part,
                    getMilestoneMrd(modelRecords.find((m) => m.name === part.model), row.milestoneId)
                  )
                  return (
                    <tr
                      key={part.partNo}
                      className={`border-b border-[var(--color-border)] hover:bg-secondary/40 transition-colors cursor-pointer ${i % 2 !== 0 ? 'bg-[var(--color-surface)]/30' : ''} ${isSelected ? 'bg-secondary/60' : ''} ${isNa ? 'text-[var(--color-muted)]' : ''}`}
                      onClick={() => setOpenPartNo(part.partNo)}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(part.partNo)}
                          className="rounded"
                          aria-label={`Select ${part.partNo}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text)]">{part.partNo}</td>
                      <td className="px-3 py-2.5 text-[var(--color-text)] max-w-[180px] truncate">{part.partName}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)]">{part.model}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] max-w-[140px] truncate">{part.vendorName}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)]">{part.department}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">
                        {(() => {
                          const d = datesByPart.get(part.partNo)
                          if (!d || d.status !== 'resolved') return <em>Awaiting MRD</em>
                          const vt = entryMap.get(part.partNo)?.vendorTimeline
                          // When the vendor timeline is in force, show the superseded dates struck through.
                          const struck =
                            d.source === 'vendor'
                              ? (vt && vt.history.length > 0
                                  ? `${fmtDate(vt.history[vt.history.length - 1].start)} → ${fmtDate(vt.history[vt.history.length - 1].end)}`
                                  : templateDatesByPart.get(part.partNo))
                              : undefined
                          return (
                            <span className="inline-flex flex-col leading-tight">
                              {struck && (
                                <span className="text-[10px] text-[var(--color-muted)] line-through">{struck}</span>
                              )}
                              <span className={d.source === 'vendor' ? 'text-[var(--color-text)]' : ''}>
                                {fmtDate(d.start)} → {fmtDate(d.end)}
                                {d.source === 'vendor' && (
                                  <span className="ml-1 text-[9px] text-[#1d4ed8]">vendor</span>
                                )}
                              </span>
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${part.type === 'NewPart' ? 'bg-[#f5f3ff] text-[#7c3aed]' : 'bg-[#fff7ed] text-[#c2410c]'}`}>
                          {part.type === 'NewPart' ? 'New' : 'ECN'}
                        </span>
                      </td>
                      {extraTexts.map((text, k) => (
                        <td key={extraFields[k].key} className="px-3 py-2.5 text-[var(--color-muted)] max-w-[160px] truncate" title={text}>{text}</td>
                      ))}
                      <td className="px-3 py-2.5">
                        {isNa ? (
                          <span
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#cbd5e1] bg-[#f1f5f9] px-2 py-1 text-[10px] font-medium text-[#475569]"
                            title={`Marked by ${naMark!.by} on ${fmtDate(naMark!.at.slice(0, 10))}${naMark!.reason ? ` — ${naMark!.reason}` : ''}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
                            Not applicable
                          </span>
                        ) : (
                          <StatusPill status={status} size="sm" />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {isNa ? <span className="text-xs text-[var(--color-muted)]">—</span> : <RygDot status={ryg} size={10} />}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          className="text-xs text-[var(--color-accent)] hover:underline"
                          onClick={(e) => { e.stopPropagation(); setOpenPartNo(part.partNo) }}
                        >
                          Open →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>

      <ApplicabilityDialog
        open={naDialog !== null}
        markNotApplicable={naDialog === 'mark'}
        subject={`${naTargets.length} part${naTargets.length !== 1 ? 's' : ''}`}
        onCancel={() => setNaDialog(null)}
        onConfirm={handleNaConfirm}
      />

      {/* Part detail drawer */}
      {openPartNo && (
        <PartDetailDrawer
          activity={activity}
          row={row}
          partNo={openPartNo}
          onClose={() => setOpenPartNo(null)}
        />
      )}
    </div>
  )
}
