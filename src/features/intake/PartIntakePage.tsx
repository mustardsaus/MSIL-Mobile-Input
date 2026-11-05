import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Card, Button } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { buildCsv, downloadCsv } from '../mywork/csv'
import { partInScope, fmtDate } from '../scope'
import { INTAKE_FIELDS } from '../../mock/partIntakeFields'
import type { IntakeSource } from '../../mock/partIntakeFields'
import { MultiSelect } from './MultiSelect'
import { ManualPartDialog } from './ManualPartDialog'
import { DISPLAY_FIELDS, SOURCE_LABEL, intakeValue } from './intakeValues'
import { getReleaseState, latestReturn } from '../../engine'
import type { PartRecord } from '../../domain'

/** Release / ECN actions, supplied by the parent so the modal and store wiring stay in one place. */
export interface IntakeActions {
  canRelease: boolean
  canEcn: boolean
  onRelease: (part: PartRecord, next: boolean) => void
  onEcn: (part: PartRecord) => void
}

type Origin = 'SAP' | 'ENOVIA' | 'Manual'
const SOURCE_TAG: Record<IntakeSource, string> = {
  Enovia: 'bg-sky-100 text-sky-800',
  SAP: 'bg-indigo-100 text-indigo-800',
  'System (EPMP)': 'bg-emerald-100 text-emerald-800'
}
const ORIGIN_TAG: Record<Origin, string> = { SAP: 'bg-indigo-100 text-indigo-800', ENOVIA: 'bg-sky-100 text-sky-800', Manual: 'bg-amber-100 text-amber-800' }
const originOf = (o: string | undefined): Origin => (o === 'ENOVIA' ? 'ENOVIA' : o === 'Manual' ? 'Manual' : 'SAP')
const PRIMARY = INTAKE_FIELDS.filter((f) => f.primary)

/** Every part that came in from SAP / ENOVIA (or was added manually), with its intake fields. */
export function PartIntakePage({ embedded = false, actions }: { embedded?: boolean; actions?: IntakeActions }) {
  const { parts, models, picAssignments, sections, partReleases, partAcks } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const [params, setParams] = useSearchParams()
  const canAdd = currentPersona === 'SectionAdmin' || currentPersona === 'Admin' || currentPersona === 'PIC'
  const [addOpen, setAddOpen] = useState(params.get('add') === '1' && canAdd)
  const [origins, setOrigins] = useState<Origin[]>([])
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [text, setText] = useState('')

  const scoped = useMemo(() => parts.filter((p) => !p.supersededBy && partInScope(p, currentPersona)), [parts, currentPersona])
  const counts = useMemo(() => {
    const c: Record<Origin, number> = { SAP: 0, ENOVIA: 0, Manual: 0 }
    for (const p of scoped) c[originOf(p.origin)] += 1
    return c
  }, [scoped])
  const rows = useMemo(
    () =>
      scoped.map((p) => ({
        part: p,
        origin: originOf(p.origin),
        release: getReleaseState(p.partNo, partReleases, partAcks),
        returnedReason: getReleaseState(p.partNo, partReleases, partAcks) === 'Returned' ? latestReturn(p.partNo, partAcks)?.reason : undefined,
        values: Object.fromEntries(DISPLAY_FIELDS.concat(PRIMARY).map((f) => [f.key, intakeValue(f, p, models, picAssignments)]))
      })),
    [scoped, models, picAssignments, partReleases, partAcks]
  )
  const showActions = !!actions && (actions.canRelease || actions.canEcn)
  const options = useMemo(() => {
    const o: Record<string, string[]> = {}
    for (const f of PRIMARY) o[f.key] = Array.from(new Set(rows.map((r) => r.values[f.key]).filter(Boolean))).sort()
    return o
  }, [rows])
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    return rows
      .filter((r) => origins.length === 0 || origins.includes(r.origin))
      .filter((r) => PRIMARY.every((f) => !(filters[f.key]?.length) || filters[f.key].includes(r.values[f.key])))
      .filter((r) => !q || Object.values(r.values).join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.part.partNo.localeCompare(b.part.partNo))
  }, [rows, origins, filters, text])
  const anyFilter = origins.length > 0 || text !== '' || Object.values(filters).some((v) => v.length)
  const toggleOrigin = (o: Origin) => setOrigins((prev) => (prev.length === 1 && prev[0] === o ? [] : [o]))
  const closeAdd = () => {
    setAddOpen(false)
    if (params.get('add')) {
      const next = new URLSearchParams(params)
      next.delete('add')
      setParams(next, { replace: true })
    }
  }

  const tile = (key: string, label: string, value: number, origin?: Origin) => {
    const active = origin ? origins.length === 1 && origins[0] === origin : origins.length === 0
    return (
      <button
        key={key}
        type="button"
        onClick={() => (origin ? toggleOrigin(origin) : setOrigins([]))}
        aria-pressed={active}
        className={`epmp-card min-w-[150px] flex-1 px-4 py-3 text-left transition-colors ${active ? 'ring-2 ring-[var(--color-accent)]' : 'hover:bg-[var(--color-surface)]'}`}
      >
        <div className="text-[11px] font-medium text-[var(--color-muted)]">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold text-[var(--color-text)]">{value}</div>
      </button>
    )
  }

  return (
    <div>
      {embedded ? (
        canAdd && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-muted)]">Parts received from SAP and ENOVIA, and parts added manually. Each column shows which system supplies it.</p>
            <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
              + Add part manually
            </Button>
          </div>
        )
      ) : (
      <PageHeader
        title="Part Intake"
        section="Modules"
        description="Parts received from SAP and ENOVIA, and parts added manually. Each column shows which system supplies it."
        actions={
          canAdd ? (
            <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
              + Add part manually
            </Button>
          ) : undefined
        }
      />
      )}
      <div className="mb-4 flex flex-wrap gap-3" data-tour="intake-summary">
        {tile('all', 'Total parts', scoped.length)}
        {tile('SAP', 'Received from SAP', counts.SAP, 'SAP')}
        {tile('ENOVIA', 'Received from ENOVIA', counts.ENOVIA, 'ENOVIA')}
        {tile('Manual', 'Added manually (dummy)', counts.Manual, 'Manual')}
      </div>
      <section className="epmp-card mb-4 flex flex-wrap items-center gap-2.5 px-4 py-3.5">
        <input
          type="text"
          placeholder="Search any column…"
          aria-label="Search the part intake list"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-9 w-56 max-w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054]"
        />
        {PRIMARY.map((f) => (
          <MultiSelect
            key={f.key}
            label={f.label}
            options={(options[f.key] ?? []).map((v) => ({ value: v }))}
            selected={filters[f.key] ?? []}
            onChange={(next) => setFilters((prev) => ({ ...prev, [f.key]: next }))}
          />
        ))}
        {anyFilter && (
          <button type="button" onClick={() => { setOrigins([]); setFilters({}); setText('') }} className="text-[11px] font-medium text-[var(--color-accent)] hover:underline">
            Clear filters
          </button>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          disabled={shown.length === 0}
          onClick={() =>
            downloadCsv(
              'part-intake.csv',
              buildCsv(['Source', 'Release', ...DISPLAY_FIELDS.map((f) => f.label)], shown.map((r) => [SOURCE_LABEL[r.origin], r.release, ...DISPLAY_FIELDS.map((f) => r.values[f.key])]))
            )
          }
        >
          Download CSV ({shown.length})
        </Button>
      </section>
      <Card flush>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted)]">
            {scoped.length === 0 ? 'No parts yet. Parts arrive from SAP and ENOVIA, or can be added manually.' : 'No parts match the filters.'}
          </p>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
            <table className="border-separate border-spacing-0 text-[11px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 min-w-[130px] border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Received from
                  </th>
                  <th className="sticky top-0 z-20 min-w-[130px] whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Release
                  </th>
                  {showActions && (
                    <th className="sticky top-0 z-20 min-w-[150px] whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Actions
                    </th>
                  )}
                  {DISPLAY_FIELDS.map((f) => (
                    <th key={f.key} className="sticky top-0 z-20 min-w-[120px] whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left align-bottom">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{f.label}</div>
                      <span className={`mt-0.5 inline-block rounded px-1.5 py-px text-[9px] font-medium ${SOURCE_TAG[f.source]}`}>{f.source}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ part, origin, release, returnedReason, values }) => {
                  const withVendor = release === 'Released' || release === 'Acknowledged'
                  return (
                  <tr key={part.partNo} className="hover:bg-[#fafbff]">
                    <td className="sticky left-0 z-10 border-b border-r border-[var(--color-border)] bg-white px-3 py-2">
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ${ORIGIN_TAG[origin]}`}>{SOURCE_LABEL[origin]}</span>
                    </td>
                    <td className="border-b border-[var(--color-border)] px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          release === 'Acknowledged' ? 'bg-emerald-100 text-emerald-800'
                          : release === 'Released' ? 'bg-blue-100 text-blue-800'
                          : release === 'Returned' ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {release === 'Acknowledged' ? 'Acknowledged' : release === 'Released' ? 'Released · awaiting ack' : release === 'Returned' ? 'Returned by vendor' : 'Not released'}
                      </span>
                      {returnedReason && <div className="mt-1 max-w-[220px] text-[10px] text-[var(--color-muted)]">“{returnedReason}”</div>}
                    </td>
                    {showActions && (
                      <td className="border-b border-[var(--color-border)] px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {actions!.canRelease && (
                            <button
                              onClick={() => actions!.onRelease(part, !withVendor)}
                              className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-medium text-[#344054] hover:border-[#bfdbfe]"
                            >
                              {withVendor ? 'Recall' : release === 'Returned' ? 'Release again' : 'Release'}
                            </button>
                          )}
                          {actions!.canEcn && (
                            <button
                              onClick={() => actions!.onEcn(part)}
                              className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-medium text-[#344054] hover:border-[#bfdbfe]"
                            >
                              ECN transfer
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    {DISPLAY_FIELDS.map((f) => {
                      const v = values[f.key]
                      return (
                        <td key={f.key} className={`whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2 ${f.key === 'part_number' ? 'font-medium text-[var(--color-text)]' : 'text-[#344054]'}`}>
                          {v ? (f.type === 'date' ? fmtDate(v) : v) : <span className="text-[var(--color-muted)]">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {!canAdd && (
        <p className="mt-3 text-[11px] text-[var(--color-muted)]">Parts are added manually by the Department Co-ordinator, a PIC or Admin when SAP / ENOVIA has no number yet.</p>
      )}
      {addOpen && <ManualPartDialog onClose={closeAdd} sections={sections.map((s) => s.id)} />}
    </div>
  )
}
