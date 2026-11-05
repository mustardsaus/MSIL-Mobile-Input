import { Icon as FbIcon } from '../../components/Icon'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore, getPersonaScope } from '../../store/personaStore'
import { Button, Card, RygDot, PageHeader } from '../../components'
import type { ActivityDefinition, TemplateRow } from '../../domain'
import type { RygStatus } from '../../components/RygDot'
import { getFilteredData } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { DEMO_TODAY, activitiesForNewUse, fmtDate, fmtOffsetRange, partInScope, rowInScope } from '../scope'
import { hasMyWork } from '../mywork/workQueue'
import { SEED_ACTIVITIES } from '../../mock'
import { isUpcoming, useUpcomingOnly, UpcomingToggle } from '../upcoming'

function activityStatusLabel(act: ActivityDefinition): 'Published' | 'Draft' {
  return act.published === false ? 'Draft' : 'Published'
}

interface RowSummary {
  row: TemplateRow
  activity: ActivityDefinition
  partCount: number
  approved: number
  /** Parts marked Not applicable: still in partCount, but out of the completion % and the RYG. */
  notApplicable: number
  awaiting: number
  /** Earliest start / latest end across in-scope parts whose milestone MRD is known. */
  start?: string
  end?: string
  ryg: RygStatus
}

/** Worst-case RYG for a row: red > yellow > green; grey when nothing is dated. Not-applicable parts have no RYG and are ignored. */
function worstRyg(instances: FilteredInstance[]): RygStatus {
  if (instances.some((i) => i.ryg === 'Red')) return 'red'
  if (instances.some((i) => i.ryg === 'Yellow')) return 'yellow'
  if (instances.some((i) => i.ryg === 'Green')) return 'green'
  return 'grey'
}

export function ActivitiesPage() {
  const navigate = useNavigate()
  const { activities, templateRows, models, entries, parts, sections, milestones, deleteActivity, addActivity, restoreActivityDefault } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isAdmin = currentPersona === 'Admin'
  const scope = getPersonaScope(currentPersona)
  const upcomingOnly = useUpcomingOnly()

  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [milestoneFilter, setMilestoneFilter] = useState('All')
  const [sectionFilter, setSectionFilter] = useState('All')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  // Deleted (retired) activities are hidden here; their template rows and work still show in the table above
  const libraryActivities = useMemo(() => activitiesForNewUse(activities), [activities])

  // One summary per template row, built from instances (part x row) the persona is allowed to see.
  const summaries = useMemo<RowSummary[]>(() => {
    const all = getFilteredData(
      entries,
      activities,
      parts,
      templateRows,
      models,
      { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' },
      'overview',
      DEMO_TODAY
    )
      .filter((i) => partInScope(i.part, currentPersona))
      // PIC default: only activities due or starting in the next 30 days (the checkbox turns this off).
      .filter((i) => !upcomingOnly || isUpcoming(i.dates))

    const out: RowSummary[] = []
    for (const row of templateRows) {
      if (!rowInScope(row, currentPersona)) continue
      const activity = activities.find((a) => a.id === row.activityId)
      if (!activity || activity.published === false) continue
      const instances = all.filter((i) => i.row.id === row.id)
      // A vendor-scoped persona only sees rows where at least one of their parts applies.
      if (scope.vendor && instances.length === 0) continue
      // With the upcoming filter on, a row with nothing in the window is left out.
      if (upcomingOnly && instances.length === 0) continue

      let start: string | undefined
      let end: string | undefined
      let awaiting = 0
      for (const i of instances) {
        if (i.notApplicable) continue
        if (i.dates.status === 'awaitingMrd') {
          awaiting++
          continue
        }
        if (!start || i.dates.start < start) start = i.dates.start
        if (!end || i.dates.end > end) end = i.dates.end
      }
      out.push({
        row,
        activity,
        partCount: instances.length,
        approved: instances.filter((i) => i.status === 'Approved' && !i.notApplicable).length,
        notApplicable: instances.filter((i) => i.notApplicable).length,
        awaiting,
        start,
        end,
        ryg: worstRyg(instances),
      })
    }
    return out
  }, [entries, activities, parts, templateRows, models, currentPersona, scope.vendor, upcomingOnly])

  const filtered = summaries.filter((s) => {
    if (search && !s.activity.name.toLowerCase().includes(search.toLowerCase())) return false
    if (milestoneFilter !== 'All' && s.row.milestoneId !== milestoneFilter) return false
    if (sectionFilter !== 'All' && s.row.section !== sectionFilter) return false
    return true
  })

  function handleDuplicate(act: ActivityDefinition) {
    const newAct: ActivityDefinition = {
      ...act,
      id: `copy-${act.id}-${Date.now()}`,
      name: `${act.name} (Copy)`,
      published: false,
    }
    addActivity(newAct)
  }

  function handleDelete(id: string) {
    deleteActivity(id)
    setDeleteConfirm(null)
  }

  const hasFilters = search !== '' || milestoneFilter !== 'All' || sectionFilter !== 'All'
  const scopeNote = scope.section
    ? `Showing section ${scope.section} only.`
    : scope.vendor
      ? `Showing parts of ${scope.vendor} only.`
      : 'Showing all sections.'

  return (
    <div>
      <PageHeader
        title="Activities"
        section="Workspace"
        description={
          isAdmin
            ? `${libraryActivities.length} activit${libraryActivities.length !== 1 ? 'ies' : 'y'} in the library. Edit an activity's fields or add a new one.`
            : `${summaries.length} activit${summaries.length !== 1 ? 'ies' : 'y'} by milestone. Dates are calculated from each model's MRD. ${scopeNote}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <UpcomingToggle />
            <Link to="/data-entry" className="inline-flex items-center rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text)] hover:bg-[#fafafa]">
              ← Parts Data Entry
            </Link>
            {isAdmin ? (
              <Button variant="primary" size="md" onClick={() => navigate('/builder/new')}>
                + New Activity
              </Button>
            ) : hasMyWork(currentPersona) ? (
              <Button variant="secondary" size="md" onClick={() => navigate('/mywork')}>
                Open My Work
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Everyone except Admin: filters + the activity instances table (Admin sees only the library below) */}
      {!isAdmin && (
        <>
      {/* Filters — EPMP filter card */}
      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5 max-sm:grid max-sm:grid-cols-1 max-sm:[&>*]:w-full">
        <input
          type="text"
          placeholder="Search activities…"
          aria-label="Search activities"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64 max-w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054] placeholder-[var(--color-muted)]"
        />
        <select
          value={milestoneFilter}
          onChange={(e) => setMilestoneFilter(e.target.value)}
          aria-label="Filter by milestone"
          className="h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054]"
        >
          <option value="All">All Milestones</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        {!scope.section && (
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            aria-label="Filter by section"
            className="h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054]"
          >
            <option value="All">All Sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setMilestoneFilter('All'); setSectionFilter('All') }}
            className="rounded text-[11px] font-medium text-[var(--color-primary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
          >
            Clear filters
          </button>
        )}
      </section>

      {/* Instances table */}
      <Card flush className="!overflow-visible">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-muted)]">
            <p className="mb-3 text-[var(--color-muted)]"><FbIcon name="check-circle" size={32} /></p>
            <p className="font-medium">
              {summaries.length === 0 ? 'No activities have been assigned to you yet' : 'No activities match your filters'}
            </p>
            {summaries.length === 0 && (
              <p className="text-sm mt-1">A Department Co-ordinator assigns activities to milestones in the Section Template.</p>
            )}
          </div>
        ) : (
          <div className="table-scroll" data-tour="activity-list">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Activity</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Section</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Milestone</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Planned Dates</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Parts</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Completion</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">RYG</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const active = s.partCount - s.notApplicable
                  const pct = active > 0 ? Math.round((s.approved / active) * 100) : 0
                  return (
                    <tr
                      key={s.row.id}
                      className={`border-b border-[var(--color-border)] hover:bg-secondary/50 transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--color-surface)]/40'}`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/activities/${s.row.id}`}
                          className="font-medium text-[var(--color-accent)] hover:underline"
                        >
                          {s.activity.name}
                          {s.row.subType && <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-primary">{s.row.milestoneId} · {s.row.subType}</span>}
                        </Link>
                        {s.activity.description && (
                          <div className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-1">{s.activity.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text)]">{s.row.section}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-secondary text-primary">
                          {s.row.milestoneId}
                        </span>
                        <div className="text-[10px] text-[var(--color-muted)] mt-0.5">{fmtOffsetRange(s.row)}</div>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)] whitespace-nowrap">
                        {s.start && s.end ? (
                          <>
                            {fmtDate(s.start)} → {fmtDate(s.end)}
                            {s.awaiting > 0 && (
                              <div className="text-[10px]">+{s.awaiting} awaiting MRD</div>
                            )}
                          </>
                        ) : (
                          <span className="italic">Awaiting MRD</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text)]">{s.partCount}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)] whitespace-nowrap">
                        {s.approved}/{active} ({pct}%)
                        {s.notApplicable > 0 && (
                          <div className="text-[10px]" title="Excluded from completion % and RYG">{s.notApplicable} not applicable</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RygDot status={s.ryg} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

        </>
      )}

      {/* Admin: activity library (definitions, no dates) */}
      {isAdmin && (
        <div>
          <h2 className="mb-2 text-[13px] font-semibold text-[var(--color-text)]">
            Activity library ({libraryActivities.length})
          </h2>
          <Card flush className="!overflow-visible">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Activity</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Fields</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Scope</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Part N/A allowed</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Used in</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-muted)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {libraryActivities.map((act) => {
                    const uses = templateRows.filter((r) => r.activityId === act.id).length
                    return (
                      <tr key={act.id} className="border-b border-[var(--color-border)]">
                        <td className="px-4 py-3 font-medium text-[var(--color-text)]">{act.name}</td>
                        <td className="px-4 py-3 text-[var(--color-text)]">{act.fields.length}</td>
                        <td className="px-4 py-3 text-[var(--color-muted)]">
                          {act.scope === 'Both' ? 'New Part + ECN' : act.scope === 'NewPart' ? 'New Part' : 'ECN'}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-muted)]">{act.allowNotApplicable ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-3 text-[var(--color-muted)]">
                          {uses} template row{uses !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-muted)]">{activityStatusLabel(act)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/builder/${act.id}`)}>
                              Edit
                            </Button>
                            {SEED_ACTIVITIES.some((s) => s.id === act.id) && JSON.stringify(SEED_ACTIVITIES.find((s) => s.id === act.id)?.fields) !== JSON.stringify(act.fields) && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  if (window.confirm(`Restore “${act.name}” to its shipped fields? Your edits to this activity’s fields are replaced.`)) restoreActivityDefault(act.id)
                                }}
                              >
                                Restore default
                              </Button>
                            )}
                            <Button variant="secondary" size="sm" onClick={() => handleDuplicate(act)}>
                              Duplicate
                            </Button>
                            {deleteConfirm === act.id ? (
                              <>
                                <span className="max-w-[260px] text-left text-[11px] text-[var(--color-muted)]">
                                  Existing template rows, entries and dashboards keep working. It cannot be used for anything new and cannot be restored.
                                </span>
                                <Button variant="danger" size="sm" onClick={() => handleDelete(act.id)}>
                                  Confirm delete
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button variant="secondary" size="sm" onClick={() => setDeleteConfirm(act.id)}>
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
