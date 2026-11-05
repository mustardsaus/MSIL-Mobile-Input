import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts'
import { PageHeader, Card, Tabs, RygDot } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import {
  getFilteredData, isWorkableByVendor, getPicOn,
  workBucket, bucketTotals, workspaceGroups,
  WORK_BUCKETS, WORK_BUCKET_COLORS, WORK_BUCKET_DESC
} from '../../engine'
import type { WorkBucket } from '../../engine'
import { DEMO_TODAY, fmtDate, partInScope } from '../scope'
import { isUpcoming, useUpcomingOnly, UpcomingToggle } from '../upcoming'
import { buildWorkGroups, canEnterWork, canValidate, countWork, hasMyWork } from './workQueue'
import { AiImportPanel } from './AiImportPanel'
import { ReleasePanel } from './ReleasePanel'
import { DelayPanel } from '../delay/DelayPanel'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { WorkGroup, WorkMode } from './workQueue'

const filterCls =
  'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'
const thCls = 'text-left px-3 py-2.5 font-medium text-[var(--color-muted)] whitespace-nowrap'

// Detail-table columns: sortable + per-column filterable.
type TableColKey = 'status' | 'partNo' | 'partName' | 'model' | 'department' | 'vendorName' | 'milestoneId' | 'activity' | 'planned'
const TABLE_COLS: { key: TableColKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'partNo', label: 'Part code' },
  { key: 'partName', label: 'Part name' },
  { key: 'model', label: 'Model' },
  { key: 'department', label: 'Dept' },
  { key: 'vendorName', label: 'Vendor' },
  { key: 'milestoneId', label: 'Trial' },
  { key: 'activity', label: 'Activity' },
  { key: 'planned', label: 'Planned' }
]

// ── Worklist (existing grouped cards) ─────────────────────────────────────────

function Chip({ n, label, tone }: { n: number; label: string; tone: string }) {
  if (n === 0) return null
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>{n} {label}</span>
}

function GroupCard({ group, mode }: { group: WorkGroup; mode: WorkMode }) {
  const parts = group.instances.length
  return (
    <section className="epmp-card px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <RygDot status={group.ryg} size={12} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">{group.activity.name}</h3>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            <span className="mr-2 rounded bg-secondary px-2 py-0.5 font-medium text-primary">{group.milestoneId}</span>
            {group.start && group.end ? `${fmtDate(group.start)} → ${fmtDate(group.end)}` : <em>Awaiting MRD</em>}
            {group.awaitingMrd > 0 && group.start ? ` · +${group.awaitingMrd} awaiting MRD` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to={`/mywork/${group.activity.id}/${group.milestoneId}${mode === 'validate' ? '?mode=validate' : ''}`}
            className="mr-1 inline-flex items-center rounded-[10px] border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
          >
            {mode === 'validate' ? 'Open validation grid' : 'Open entry grid'}
          </Link>
          <Chip n={group.sentBack} label="sent back" tone="bg-[#fef2f2] text-[#b91c1c]" />
          <Chip n={group.draft} label="draft" tone="bg-[#eff6ff] text-[#1d4ed8]" />
          <Chip n={group.notStarted} label="not started" tone="bg-[#f3f4f6] text-[#4b5563]" />
          <Chip n={group.submitted} label="submitted" tone="bg-[#fffbeb] text-[#b45309]" />
          <span className="text-[11px] text-[var(--color-muted)]">{parts} part{parts !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {group.rows.map((wr) => (
          <Link
            key={wr.row.id}
            to={`/mywork/${group.activity.id}/${group.milestoneId}?${mode === 'validate' ? 'mode=validate&' : ''}section=${encodeURIComponent(wr.row.section)}`}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] text-[var(--color-text)] hover:border-[#bfdbfe] hover:bg-secondary"
          >
            <span className="font-semibold">{wr.row.section}</span>
            <span className="ml-1.5 text-[var(--color-muted)]">{wr.instances.length} part{wr.instances.length !== 1 ? 's' : ''}</span>
            <span className="ml-1.5 text-[var(--color-accent)]" aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── Workspace tile ────────────────────────────────────────────────────────────

function BucketTile({ bucket, count, active, onClick }: { bucket: WorkBucket; count: number; active: boolean; onClick: () => void }) {
  const color = WORK_BUCKET_COLORS[bucket]
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`epmp-card flex flex-col items-start px-4 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] ${active ? 'ring-2' : 'hover:shadow-sm'}`}
      style={active ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color }}>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {bucket}
        </span>
        {bucket === 'NG' && count > 0 && <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--color-ryg-red)]">action</span>}
      </div>
      <span className="mt-1 text-[28px] font-bold leading-[32px]" style={{ color }}>{count}</span>
      <span className="text-[10px] text-[var(--color-muted)]">{WORK_BUCKET_DESC[bucket]}</span>
    </button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function MyWorkPage() {
  const { activities, entries, templateRows, models, parts, partReleases, partAcks, picAssignments } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canEnter = canEnterWork(currentPersona)
  const canValidateWork = canValidate(currentPersona)
  const upcomingOnly = useUpcomingOnly()

  // Top-level view toggle: the client's graphical "Workspace", or the proven "Worklist" of grouped cards.
  const [view, setView] = useState<'workspace' | 'worklist'>('workspace')
  // Worklist enter/validate mode.
  const [tab, setTab] = useState<WorkMode>('enter')

  // Filters (the client's set). 'All' by default.
  const [fModel, setFModel] = useState('All')
  const [fDept, setFDept] = useState('All')
  const [fMilestone, setFMilestone] = useState('All')
  const [fPic, setFPic] = useState('All')
  const [fPart, setFPart] = useState('') // Part name (free text)
  const [fPartCode, setFPartCode] = useState('') // Part code (free text)
  const [fVendorCode, setFVendorCode] = useState('All')
  const [fVendor, setFVendor] = useState('All')
  // Workspace drill state.
  const [groupDim, setGroupDim] = useState<'model' | 'vendor' | 'department' | 'milestone'>('model')
  const [selectedBucket, setSelectedBucket] = useState<WorkBucket | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  // Detail-table sort + per-column filter.
  const [sortKey, setSortKey] = useState<TableColKey>('partNo')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [colFilters, setColFilters] = useState<Record<TableColKey, string>>({
    status: '', partNo: '', partName: '', model: '', department: '', vendorName: '', milestoneId: '', activity: '', planned: ''
  })

  // Every in-scope instance (before filters).
  const allInstances = useMemo(
    () =>
      getFilteredData(
        entries, activities, parts, templateRows, models,
        { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' },
        'overview', DEMO_TODAY
      )
        .filter((i) => partInScope(i.part, currentPersona))
        .filter((i) => currentPersona !== 'Vendor' || isWorkableByVendor(i.part.partNo, partReleases, partAcks))
        .filter((i) => !i.notApplicable)
        // PIC default: only activities due or starting in the next 30 days (the checkbox turns this off).
        .filter((i) => !upcomingOnly || isUpcoming(i.dates)),
    [entries, activities, parts, templateRows, models, currentPersona, partReleases, partAcks, upcomingOnly]
  )

  // Filter option lists (stable across selections).
  const opt = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort()
  const modelOptions = useMemo(() => opt(allInstances.map((i) => i.part.model)), [allInstances])
  const deptOptions = useMemo(() => opt(allInstances.map((i) => i.part.department || 'Other')), [allInstances])
  const milestoneOptions = useMemo(() => opt(allInstances.map((i) => i.row.milestoneId)), [allInstances])
  const vendorOptions = useMemo(() => opt(allInstances.map((i) => i.part.vendorName)), [allInstances])
  const vendorCodeOptions = useMemo(() => opt(allInstances.map((i) => i.part.vendorCode)), [allInstances])
  const picOptions = useMemo(
    () => opt(allInstances.map((i) => getPicOn(i.part, picAssignments, DEMO_TODAY).name)),
    [allInstances, picAssignments]
  )

  const hasFilters = [fModel, fDept, fMilestone, fPic, fVendorCode, fVendor].some((v) => v !== 'All') || fPart !== '' || fPartCode !== ''
  function clearFilters() {
    setFModel('All'); setFDept('All'); setFMilestone('All'); setFPic('All')
    setFPart(''); setFPartCode(''); setFVendorCode('All'); setFVendor('All')
  }

  // Apply the filters.
  const instances = useMemo(
    () =>
      allInstances.filter((i) => {
        if (fModel !== 'All' && i.part.model !== fModel) return false
        if (fDept !== 'All' && (i.part.department || 'Other') !== fDept) return false
        if (fMilestone !== 'All' && i.row.milestoneId !== fMilestone) return false
        if (fVendor !== 'All' && i.part.vendorName !== fVendor) return false
        if (fVendorCode !== 'All' && i.part.vendorCode !== fVendorCode) return false
        if (fPic !== 'All' && getPicOn(i.part, picAssignments, DEMO_TODAY).name !== fPic) return false
        if (fPart && !i.part.partName.toLowerCase().includes(fPart.toLowerCase())) return false
        if (fPartCode && !i.part.partNo.toLowerCase().includes(fPartCode.toLowerCase())) return false
        return true
      }),
    [allInstances, fModel, fDept, fMilestone, fVendor, fVendorCode, fPic, fPart, fPartCode, picAssignments]
  )

  // Workspace rollups.
  const totals = useMemo(() => bucketTotals(instances), [instances])
  const groups = useMemo(() => workspaceGroups(instances, groupDim), [instances, groupDim])

  // Value shown/sorted/filtered for a given column of an instance.
  const plannedText = (i: typeof allInstances[number]) =>
    i.dates.status === 'resolved' ? `${fmtDate(i.dates.start)} → ${fmtDate(i.dates.end)}` : 'Awaiting MRD'
  const cellValue = (i: typeof allInstances[number], key: TableColKey): string => {
    switch (key) {
      case 'status': return workBucket(i) ?? ''
      case 'partNo': return i.part.partNo
      case 'partName': return i.part.partName
      case 'model': return i.part.model
      case 'department': return i.part.department || 'Other'
      case 'vendorName': return i.part.vendorName
      case 'milestoneId': return i.row.milestoneId
      case 'activity': return i.activity.name
      case 'planned': return i.dates.status === 'resolved' ? i.dates.end : 'zzzz' // sort by end date; awaiting MRD last
    }
  }

  // Mobile: Activity is the first column (pinned left); laptop keeps the original order.
  const isMobile = useIsMobile()
  const tableCols = isMobile ? [TABLE_COLS.find((c) => c.key === 'activity')!, ...TABLE_COLS.filter((c) => c.key !== 'activity')] : TABLE_COLS

  // The detail table respects the selected bucket/group, then the per-column filters, then the sort.
  const tableRows = useMemo(() => {
    let rows = instances
    if (selectedBucket) rows = rows.filter((i) => workBucket(i) === selectedBucket)
    if (selectedGroup) {
      rows = rows.filter((i) => {
        const k = groupDim === 'model' ? i.part.model
          : groupDim === 'vendor' ? i.part.vendorName
          : groupDim === 'department' ? (i.part.department || 'Other')
          : i.row.milestoneId
        return k === selectedGroup
      })
    }
    // Per-column filters (case-insensitive substring; 'planned' matches the displayed range text).
    rows = rows.filter((i) =>
      TABLE_COLS.every(({ key }) => {
        const f = colFilters[key]
        if (!f) return true
        const hay = (key === 'planned' ? plannedText(i) : cellValue(i, key)).toLowerCase()
        return hay.includes(f.toLowerCase())
      })
    )
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = cellValue(a, sortKey)
      const vb = cellValue(b, sortKey)
      const cmp = va.localeCompare(vb, undefined, { numeric: true })
      return (cmp || a.part.partNo.localeCompare(b.part.partNo)) * dir
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, selectedBucket, selectedGroup, groupDim, colFilters, sortKey, sortDir])

  function toggleSort(key: TableColKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const anyColFilter = Object.values(colFilters).some(Boolean)

  // Worklist (card) data.
  const counts = useMemo(() => countWork(instances, currentPersona), [instances, currentPersona])
  const enterGroups = useMemo(() => (canEnter ? buildWorkGroups(instances, currentPersona, 'enter') : []), [instances, currentPersona, canEnter])
  const validateGroups = useMemo(() => (canValidateWork ? buildWorkGroups(instances, currentPersona, 'validate') : []), [instances, currentPersona, canValidateWork])

  if (!hasMyWork(currentPersona)) {
    return (
      <div>
        <PageHeader title="My Workspace" section="Workspace" description="A worklist for Vendors and PICs." />
        <Card><p className="py-6 text-center text-sm text-[var(--color-muted)]">My Work is available to the Vendor, PIC, SIC and DPM roles. Switch persona to see it.</p></Card>
      </div>
    )
  }

  const activeMode: WorkMode = canEnter && canValidateWork ? tab : canValidateWork ? 'validate' : 'enter'
  const cardGroups = activeMode === 'enter' ? enterGroups : validateGroups

  const groupDimLabel = { model: 'Model', vendor: 'Vendor', department: 'Department', milestone: 'Trial status' }[groupDim]

  return (
    <div>
      <PageHeader
        title="My Workspace"
        section="Workspace"
        description="Your parts at a glance — graphical and as tiles. Filter, then click a bar or a tile (NG especially) to pull up the exact parts to work on."
        actions={<UpcomingToggle />}
      />

      {/* Release handshake: released / pending / returned (PIC side) or acknowledge / return (vendor side) */}
      <ReleasePanel />
      {/* Delay reasons: vendor gives them, PIC accepts or sends back */}
      <DelayPanel />
      {/* View toggle */}
      <Tabs
        className="mb-4"
        activeId={view}
        onChange={(id) => setView(id as 'workspace' | 'worklist')}
        items={[
          { id: 'workspace', label: 'Workspace' },
          { id: 'worklist', label: 'Worklist' }
        ]}
      />

      {/* Filters — the client's set */}
      <section className="epmp-card mb-4 px-4 py-3.5">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[var(--color-muted)]">Model</span>
            <select value={fModel} onChange={(e) => setFModel(e.target.value)} className={filterCls}><option value="All">All</option>{modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[var(--color-muted)]">Department</span>
            <select value={fDept} onChange={(e) => setFDept(e.target.value)} className={filterCls}><option value="All">All</option>{deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[var(--color-muted)]">Trial status</span>
            <select value={fMilestone} onChange={(e) => setFMilestone(e.target.value)} className={filterCls}><option value="All">All</option>{milestoneOptions.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[var(--color-muted)]">PIC name</span>
            <select value={fPic} onChange={(e) => setFPic(e.target.value)} className={filterCls}><option value="All">All</option>{picOptions.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[var(--color-muted)]">Part name</span>
            <input value={fPart} onChange={(e) => setFPart(e.target.value)} placeholder="All" className={filterCls} /></label>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[var(--color-muted)]">Part code</span>
            <input value={fPartCode} onChange={(e) => setFPartCode(e.target.value)} placeholder="All" className={filterCls} /></label>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[var(--color-muted)]">Vendor code</span>
            <select value={fVendorCode} onChange={(e) => setFVendorCode(e.target.value)} className={filterCls}><option value="All">All</option>{vendorCodeOptions.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[var(--color-muted)]">Vendor name</span>
            <select value={fVendor} onChange={(e) => setFVendor(e.target.value)} className={filterCls}><option value="All">All</option>{vendorOptions.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        </div>
        {hasFilters && (
          <div className="mt-2.5">
            <button onClick={clearFilters} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Clear all filters</button>
          </div>
        )}
      </section>

      {view === 'workspace' ? (
        <>
          {/* Tiles: Upcoming / Completed / Delayed / NG */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {WORK_BUCKETS.map((b) => (
              <BucketTile
                key={b} bucket={b} count={totals[b]}
                active={selectedBucket === b}
                onClick={() => setSelectedBucket(selectedBucket === b ? null : b)}
              />
            ))}
          </div>

          {/* Graphical: stacked bars by the chosen dimension */}
          <Card className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[var(--color-text)]">Workspace by {groupDimLabel}</h3>
              <select value={groupDim} onChange={(e) => { setGroupDim(e.target.value as any); setSelectedGroup(null) }} className={`${filterCls} w-auto`}>
                <option value="model">By Model</option>
                <option value="vendor">By Vendor</option>
                <option value="department">By Department</option>
                <option value="milestone">By Trial status</option>
              </select>
            </div>
            {groups.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--color-muted)]">No parts match the current filters.</p>
            ) : (
              <div style={{ height: Math.max(180, groups.length * 34 + 60) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    barCategoryGap={8}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                    <YAxis type="category" dataKey="key" stroke="#667085" fontSize={11} width={110} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '6px' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    {WORK_BUCKETS.map((b) => (
                      <Bar key={b} dataKey={b} name={b} stackId="s" fill={WORK_BUCKET_COLORS[b]}
                        cursor="pointer"
                        onClick={(d: any) => { setSelectedBucket(b); setSelectedGroup(d?.key ?? null) }}>
                        {groups.map((g) => <Cell key={g.key} />)}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-1 text-[10px] text-[var(--color-muted)]">Click a segment to open those parts below. {groupDimLabel}-wise · Upcoming → Completed → Delayed → NG.</p>
          </Card>

          {/* Detail table — appears for the selected bucket/group (NG drill lands here) */}
          <Card flush className="!overflow-visible">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <h3 className="text-[13px] font-semibold text-[var(--color-text)]">
                {selectedBucket ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: WORK_BUCKET_COLORS[selectedBucket] }} />
                    {selectedBucket} parts
                  </span>
                ) : 'All parts'}
                {selectedGroup ? <span className="text-[var(--color-muted)]"> · {selectedGroup}</span> : ''}
                <span className="ml-2 text-[11px] font-normal text-[var(--color-muted)]">{tableRows.length} row{tableRows.length === 1 ? '' : 's'}</span>
              </h3>
              <div className="ml-auto flex items-center gap-3">
                {anyColFilter && (
                  <button onClick={() => setColFilters({ status: '', partNo: '', partName: '', model: '', department: '', vendorName: '', milestoneId: '', activity: '', planned: '' })}
                    className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Clear column filters</button>
                )}
                {(selectedBucket || selectedGroup) && (
                  <button onClick={() => { setSelectedBucket(null); setSelectedGroup(null) }} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Show all</button>
                )}
              </div>
            </div>
            {/* Mobile: the table scrolls sideways inside this wrapper; Activity is pinned left and Open right (.tbl-sleeve). */}
            <div className={`page-sticky-head ${isMobile ? 'tbl-sleeve overflow-x-auto' : ''}`}>
              <table className="w-full text-sm">
                <thead>
                  {/* Sortable header row */}
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    {tableCols.map((c) => (
                      <th key={c.key} className={`${thCls} cursor-pointer select-none hover:text-[var(--color-text)]`}
                        onClick={() => toggleSort(c.key)}
                        aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <span className="inline-flex items-center gap-1">
                          {c.label}
                          <span className="text-[9px] text-[var(--color-accent)]">{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                        </span>
                      </th>
                    ))}
                    <th className={thCls}>{isMobile ? <span className="sr-only">Open</span> : null}</th>
                  </tr>
                  {/* Per-column filter row */}
                  <tr className="border-b border-[var(--color-border)] bg-white">
                    {tableCols.map((c) => (
                      <th key={c.key} className="px-2 py-1.5">
                        <input
                          value={colFilters[c.key]}
                          onChange={(e) => setColFilters((prev) => ({ ...prev, [c.key]: e.target.value }))}
                          placeholder="Filter"
                          aria-label={`Filter ${c.label}`}
                          className="h-7 w-full min-w-[60px] rounded border border-[var(--color-border)] bg-[#f9fafb] px-1.5 text-[10px] text-[#344054] placeholder-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                        />
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((i) => {
                    const b = workBucket(i)!
                    const planned = i.dates.status === 'resolved' ? `${fmtDate(i.dates.start)} → ${fmtDate(i.dates.end)}` : 'Awaiting MRD'
                    return (
                      <tr key={`${i.row.id}-${i.part.partNo}`} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                        {tableCols.map((c) => <Fragment key={c.key}>{({
                          status: (
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: `${WORK_BUCKET_COLORS[b]}1a`, color: WORK_BUCKET_COLORS[b] }}>
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: WORK_BUCKET_COLORS[b] }} />{b}
                          </span>
                        </td>
                          ),
                          partNo: (
                        <td className="px-3 py-2.5 font-mono text-[11px]">{i.part.partNo}</td>
                          ),
                          partName: (
                        <td className="px-3 py-2.5">{i.part.partName}</td>
                          ),
                          model: (
                        <td className="px-3 py-2.5 text-[12px]">{i.part.model}</td>
                          ),
                          department: (
                        <td className="px-3 py-2.5 text-[12px]">{i.part.department}</td>
                          ),
                          vendorName: (
                        <td className="px-3 py-2.5 text-[12px]">{i.part.vendorName}</td>
                          ),
                          milestoneId: (
                        <td className="px-3 py-2.5"><span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-primary">{i.row.milestoneId}</span></td>
                          ),
                          activity: (
                        <td className="px-3 py-2.5 text-[12px]">{i.activity.name}</td>
                          ),
                          planned: (
                        <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-[var(--color-muted)]">{planned}</td>
                          ),
                        } as Record<TableColKey, React.ReactNode>)[c.key]}</Fragment>)}
                        <td className="px-3 py-2.5 text-right">
                          <Link
                            // Opens this part's form for this activity (the part drawer), not the whole part list.
                            to={`/activities/${i.row.id}?part=${encodeURIComponent(i.part.partNo)}`}
                            className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline"
                          >Open →</Link>
                        </td>
                      </tr>
                    )
                  })}
                  {tableRows.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-[var(--color-muted)]">No parts in this selection.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          {canEnter && <AiImportPanel role={currentPersona} />}
          {canEnter && canValidateWork && (
            <Tabs
              className="mb-4"
              activeId={activeMode}
              onChange={(id) => setTab(id as WorkMode)}
              items={[
                { id: 'enter', label: 'To enter', badge: counts.sentBack + counts.draft + counts.notStarted },
                { id: 'validate', label: 'To validate', badge: counts.toValidate }
              ]}
            />
          )}
          {cardGroups.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm font-medium text-[var(--color-text)]">{activeMode === 'enter' ? 'Nothing waiting for your input' : 'Nothing waiting for your validation'}</p>
                <p className="max-w-sm text-xs text-[var(--color-muted)]">Parts marked Not applicable and parts already submitted or approved do not appear here.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">{cardGroups.map((g) => <GroupCard key={g.key} group={g} mode={activeMode} />)}</div>
          )}
        </>
      )}
    </div>
  )
}
