import { useMemo, useState } from 'react'
import { PageHeader, Card } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { buildVendorScores, buildInsights, pct, buildActivityHeatMap, buildVendorActivityHeatMap, predictRisk } from './insights'
import type { InsightTone, VendorScore, HeatMap, HeatLevel, RiskLevel } from './insights'
import { TECHNICAL_CATEGORIES } from '../../domain/timelineCatalog'
import { getFilteredData } from '../../engine'
import { EMPTY_FILTERS } from '../dashboard/drill'
import { DEMO_TODAY } from '../scope'

const toneStyle: Record<InsightTone, { card: string; dot: string; label: string }> = {
  risk: { card: 'border-red-200 bg-red-50', dot: 'bg-red-500', label: 'Risk' },
  watch: { card: 'border-amber-200 bg-amber-50', dot: 'bg-amber-500', label: 'Watch' },
  good: { card: 'border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500', label: 'Strength' },
  info: { card: 'border-[var(--color-border)] bg-white', dot: 'bg-slate-400', label: 'Note' }
}

const heatStyle: Record<HeatLevel, { bg: string; text: string }> = {
  good: { bg: '#dcfce7', text: '#166534' },
  ok: { bg: '#fef9c3', text: '#854d0e' },
  poor: { bg: '#fee2e2', text: '#991b1b' },
  none: { bg: 'transparent', text: '#cbd5e1' }
}

function HeatMapView({ map }: { map: HeatMap }) {
  if (map.rows.length === 0 || map.cols.length === 0) {
    return <Card><p className="py-6 text-center text-sm text-[var(--color-muted)]">No activity recorded yet.</p></Card>
  }
  return (
    <div className="epmp-card overflow-auto p-0" style={{ maxHeight: '60vh' }}>
      <table className="border-separate border-spacing-0 text-[11px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-[150px] border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Vendor
            </th>
            {map.cols.map((c) => (
              <th key={c.key} className="sticky top-0 z-20 min-w-[60px] max-w-[120px] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-left align-bottom text-[10px] font-medium text-[var(--color-muted)]" title={c.label}>
                <div className="truncate">{c.label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.rows.map((v) => (
            <tr key={v}>
              <td className="sticky left-0 z-10 min-w-[150px] border-b border-r border-[var(--color-border)] bg-white px-3 py-2 font-medium text-[#101828]">{map.rowLabels?.[v] ?? v}</td>
              {map.cols.map((c) => {
                const cell = map.cell[v][c.key]
                const st = heatStyle[cell.level]
                return (
                  <td key={c.key} className="border-b border-r border-[var(--color-border)] p-0.5">
                    <div
                      className="flex h-9 items-center justify-center rounded text-[11px] font-semibold"
                      style={{ backgroundColor: st.bg, color: st.text }}
                      title={`${v} · ${c.label}: ${cell.note}`}
                    >
                      {cell.n > 0 ? cell.n : ''}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
      <div className="text-[18px] font-bold leading-tight text-[#101828]">{value}{suffix}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
    </div>
  )
}

function VendorCard({ s }: { s: VendorScore }) {
  const ftr = pct(s.firstTimeRight, s.approved || 1)
  const ng = pct(s.ngCount, s.inspections || 1)
  const nonOtop = pct(s.nonOtop, s.otop + s.nonOtop || 1)
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-[14px] font-semibold text-[#101828]">{s.vendorName}</h3>
        <span className="text-[11px] text-[var(--color-muted)]">{s.parts} parts · {s.activitiesTracked} activities</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="First-time right" value={ftr} suffix="%" />
        <Metric label="Sent back" value={s.sentBacks} />
        <Metric label="Inspection NG" value={s.inspections ? ng : '—'} suffix={s.inspections ? '%' : ''} />
        <Metric label="Non-OTOP" value={s.otop + s.nonOtop ? nonOtop : '—'} suffix={s.otop + s.nonOtop ? '%' : ''} />
      </div>
      {(s.topNgCategory || s.topDelayReason || s.deviations > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-muted)]">
          {s.topNgCategory && <span>Top NG: <strong className="text-[#344054]">{s.topNgCategory}</strong></span>}
          {s.topDelayReason && <span>Top delay: <strong className="text-[#344054]">{s.topDelayReason}</strong></span>}
          {s.deviations > 0 && <span>Deviations: <strong className="text-[#344054]">{s.deviations}</strong> ({s.deviationsApproved} appr / {s.deviationsRejected} rej)</span>}
        </div>
      )}
    </Card>
  )
}

export function LessonsPage() {
  const { entries, parts, activities, templateRows, models } = useQAStore()

  // One common filter for the whole page: Vendor + Technical category. Everything below respects it.
  const [vendorFilter, setVendorFilter] = useState('All')
  const [catFilter, setCatFilter] = useState('All')

  // Parts narrowed by the category filter — fed to every section so scorecards/insights/forecast/heat map agree.
  const catParts = useMemo(
    () => (catFilter === 'All' ? parts : parts.filter((p) => (p.technicalCategory ?? 'OtherAssy') === catFilter)),
    [parts, catFilter]
  )
  const ctx = useMemo(() => ({ entries, parts: catParts, activities, templateRows }), [entries, catParts, activities, templateRows])

  const scores = useMemo(() => buildVendorScores(ctx), [ctx])
  const insights = useMemo(() => buildInsights(scores), [scores])

  // Rule-based forecast of at-risk parts (open activities ranked by projected delay/quality risk).
  const predictions = useMemo(() => {
    const instances = getFilteredData(entries, activities, catParts, templateRows, models, { ...EMPTY_FILTERS }, 'overview', DEMO_TODAY)
    const rygList = instances.map((i) => ({ partNo: i.part.partNo, activityId: i.activity.id, templateRowId: i.row.id, ryg: String(i.ryg) }))
    return predictRisk(ctx, rygList)
  }, [ctx, entries, activities, catParts, templateRows, models])
  const shownPredictions = vendorFilter === 'All' ? predictions : predictions.filter((p) => p.vendorName === vendorFilter)

  // Heat map honours the same common filter: 'All' vendors → vendor × activity; a vendor → activities as rows.
  const heatMap = useMemo<HeatMap>(
    () =>
      vendorFilter === 'All'
        ? buildActivityHeatMap(ctx, 'All')
        : buildVendorActivityHeatMap(ctx, vendorFilter, 'All'),
    [ctx, vendorFilter]
  )

  const vendors = useMemo(() => buildVendorScores({ entries, parts, activities, templateRows }).map((s) => s.vendorName), [entries, parts, activities, templateRows])
  const shownScores = vendorFilter === 'All' ? scores : scores.filter((s) => s.vendorName === vendorFilter)
  const shownInsights = vendorFilter === 'All' ? insights : insights.filter((i) => i.vendorName === vendorFilter)

  return (
    <div>
      <PageHeader
        title="Lessons Learnt"
        section="Modules"
        description="Vendor track records and AI-generated insights from this system's own data — approvals, send-backs, inspections, OTOP and deviations."
      />

      {/* One common filter for the whole page */}
      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Vendor
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] font-normal normal-case text-[#344054]"
          >
            <option value="All">All vendors</option>
            {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Technical category
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] font-normal normal-case text-[#344054]"
          >
            <option value="All">All categories</option>
            {TECHNICAL_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        {(vendorFilter !== 'All' || catFilter !== 'All') && (
          <button
            onClick={() => { setVendorFilter('All'); setCatFilter('All') }}
            className="text-[11px] font-medium text-[var(--color-accent)] hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[11px] font-normal normal-case text-[var(--color-muted)]">
          Filters apply to every section · insights are rule-based, not a trained model.
        </span>
      </section>

      {/* Insight cards */}
      <h2 className="mb-2 text-[13px] font-semibold text-[#101828]">AI insights {shownInsights.length > 0 && `(${shownInsights.length})`}</h2>
      {shownInsights.length === 0 ? (
        <Card className="mb-6"><p className="py-6 text-center text-sm text-[var(--color-muted)]">Not enough history yet to surface insights for this selection.</p></Card>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shownInsights.map((ins) => {
            const st = toneStyle[ins.tone]
            return (
              <div key={ins.id} className={`rounded-lg border p-3.5 ${st.card}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                  <span className="text-[13px] font-semibold text-[#101828]">{ins.title}</span>
                  <span className="ml-auto rounded-full border border-[var(--color-border)] bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">{st.label}</span>
                </div>
                <p className="m-0 text-[12px] text-[#344054]">{ins.detail}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Forecast — at-risk parts */}
      <h2 className="mb-2 text-[13px] font-semibold text-[#101828]">Forecast · at-risk parts {shownPredictions.length > 0 && `(${shownPredictions.length})`}</h2>
      {shownPredictions.length === 0 ? (
        <Card className="mb-6"><p className="py-6 text-center text-sm text-[var(--color-muted)]">No at-risk open activities projected for this selection.</p></Card>
      ) : (
        <Card flush className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  <th className="px-4 py-2.5">Risk</th>
                  <th className="px-4 py-2.5">Part</th>
                  <th className="px-4 py-2.5">Activity</th>
                  <th className="px-4 py-2.5">Projection</th>
                  <th className="px-4 py-2.5">Why (rule-based)</th>
                  <th className="px-4 py-2.5">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {shownPredictions.slice(0, 20).map((p) => {
                  const rs: Record<RiskLevel, string> = {
                    High: 'bg-red-100 text-red-700',
                    Medium: 'bg-amber-100 text-amber-800',
                    Low: 'bg-slate-100 text-slate-600'
                  }
                  return (
                    <tr key={`${p.activityId}-${p.partNo}`} className="border-b border-[var(--color-border)] last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rs[p.level]}`}>{p.level}</span></td>
                      <td className="px-4 py-2.5"><div className="font-medium text-[#101828]">{p.partNo}</div><div className="text-[10px] text-[var(--color-muted)]">{p.vendorName}</div></td>
                      <td className="px-4 py-2.5">{p.activityName} <span className="text-[var(--color-muted)]">· {p.milestoneId}</span></td>
                      <td className="px-4 py-2.5 font-medium text-[#344054]">{p.outcome}</td>
                      <td className="px-4 py-2.5 text-[11px] text-[var(--color-muted)]">{p.reasons.join('; ')}</td>
                      <td className="px-4 py-2.5 text-[11px] text-[var(--color-muted)]">{p.confidence}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Heat map (honours the page filter above) */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[13px] font-semibold text-[#101828]">
          {vendorFilter === 'All' ? 'Vendor heat map' : `${vendorFilter} — activity heat map`}
        </h2>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[10px] text-[var(--color-muted)]">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: '#dcfce7' }} /> Clean</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: '#fef9c3' }} /> Watch</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: '#fee2e2' }} /> NG / rework</span>
        <span>Number = tracked activities · hover a cell for detail</span>
      </div>
      <div className="mb-6">
        <HeatMapView map={heatMap} />
      </div>

      {/* Vendor scorecards */}
      <h2 className="mb-2 text-[13px] font-semibold text-[#101828]">Vendor scorecards</h2>
      {shownScores.length === 0 ? (
        <Card><p className="py-6 text-center text-sm text-[var(--color-muted)]">No vendor activity recorded yet.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {shownScores.map((s) => <VendorCard key={s.vendorName} s={s} />)}
        </div>
      )}
    </div>
  )
}
