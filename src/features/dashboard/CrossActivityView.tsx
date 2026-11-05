import { Icon as FbIcon } from '../../components/Icon'
import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, Cell
} from 'recharts'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { Card, Button } from '../../components'
import {
  crossActivityPoints,
  computeCrossWidget,
  recommendCrossDisplays,
  sharedFields
} from '../../engine'
import type { ActivityDefinition, CrossActivityDashboard, CrossWidget, CrossPlot, CrossDisplay } from '../../domain'
import { DEMO_TODAY } from '../scope'

const BRAND = ['#2153f5', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#14b8a6', '#6366f1']
const selectCls = 'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2 text-[11px] text-[#344054]'

const MEASURE_LABELS: Record<string, string> = {
  completionRate: 'Completion rate (%)',
  count: 'Count of parts',
  overdue: 'Overdue (Red)',
  awaitingValidation: 'Awaiting validation',
  approved: 'Approved count'
}
const DISPLAY_LABELS: Record<CrossDisplay, string> = {
  groupedBar: 'Bar',
  stackedBar: 'Stacked bar',
  line: 'Line',
  table: 'Table'
}

// ── One comparison chart ──────────────────────────────────────────────────────

function CrossWidgetChart({
  widget, points, activities
}: { widget: CrossWidget; points: ReturnType<typeof crossActivityPoints>; activities: ActivityDefinition[] }) {
  const result = useMemo(() => computeCrossWidget(points, widget.plot, activities), [points, widget.plot, activities])

  if (points.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-[var(--color-muted)]">No matching activity instances.</div>
  }

  if (widget.display === 'table') {
    return (
      <div className="h-full overflow-auto text-[11px]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              <th className="py-1 font-semibold">Activity · Milestone</th>
              {result.shape === 'single'
                ? <th className="py-1 text-right font-semibold">Value{result.unit}</th>
                : result.segmentKeys.map((s) => <th key={s.key} className="py-1 text-right font-semibold">{s.name}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {result.rows.map((r) => (
              <tr key={r.key}>
                <td className="py-1.5">{r.name}</td>
                {result.shape === 'single'
                  ? <td className="py-1.5 text-right font-medium">{r.value}{result.unit}</td>
                  : result.segmentKeys.map((s) => <td key={s.key} className="py-1.5 text-right">{r.segments?.[s.key] ?? 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Build recharts-friendly rows.
  const data = result.rows.map((r) => ({
    name: r.name,
    ...(result.shape === 'single' ? { value: r.value } : r.segments)
  }))

  if (widget.display === 'line' && result.shape === 'single') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 15, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="name" stroke="#9ca3af" fontSize={9} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '4px' }} formatter={(v: any) => `${v}${result.unit}`} />
          <Line type="monotone" dataKey="value" stroke="#2153f5" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis dataKey="name" stroke="#9ca3af" fontSize={9} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
        <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '4px' }} formatter={(v: any) => `${v}${result.unit}`} />
        {result.shape === 'stacked' && <Legend iconType="rect" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />}
        {result.shape === 'single' ? (
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={BRAND[i % BRAND.length]} />)}
          </Bar>
        ) : (
          result.segmentKeys.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} />
          ))
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── The dashboard view (render + inline widget builder) ────────────────────────

export function CrossActivityView({ dashboard }: { dashboard: CrossActivityDashboard }) {
  const { activities, entries, parts, templateRows, models, updateCrossDashboard, deleteCrossDashboard } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canEdit = currentPersona === 'Admin' || currentPersona === 'SIC' || currentPersona === 'DPM'

  const [adding, setAdding] = useState(false)

  const selectedActs = useMemo(
    () => activities.filter((a) => dashboard.activityIds.includes(a.id)),
    [activities, dashboard.activityIds]
  )

  // The model/part is a LIVE pick (template behaviour): the dropdown re-populates every chart.
  const options = useMemo(() => {
    const active = parts.filter((p) => !p.supersededBy)
    if (dashboard.commonality === 'model') {
      return Array.from(new Set(active.map((p) => p.model))).sort().map((m) => ({ value: m, label: m }))
    }
    return active
      .map((p) => ({ value: p.partNo, label: `${p.partNo} — ${p.partName}` }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }, [parts, dashboard.commonality])

  const [selectedValue, setSelectedValue] = useState<string>(dashboard.defaultValue || options[0]?.value || '')
  // If the saved default disappears (or options change), fall back to the first option.
  const activeValue = options.some((o) => o.value === selectedValue) ? selectedValue : (options[0]?.value ?? '')

  const points = useMemo(
    () =>
      activeValue
        ? crossActivityPoints(entries, activities, parts, templateRows, models, dashboard.activityIds, dashboard.commonality, activeValue, DEMO_TODAY)
        : [],
    [entries, activities, parts, templateRows, models, dashboard.activityIds, dashboard.commonality, activeValue]
  )

  const addWidget = (w: CrossWidget) => updateCrossDashboard(dashboard.id, { widgets: [...dashboard.widgets, w] })
  const removeWidget = (id: string) => updateCrossDashboard(dashboard.id, { widgets: dashboard.widgets.filter((w) => w.id !== id) })

  return (
    <div>
      <div className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[18px] font-semibold text-[var(--color-text)]">{dashboard.name}</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Comparing {selectedActs.length} activit{selectedActs.length === 1 ? 'y' : 'ies'}
            {' · '}{points.length} activity×milestone point{points.length === 1 ? '' : 's'}
          </p>
        </div>

        {/* Live model/part selector — the template re-populates for the chosen value. */}
        <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--color-muted)]">
          {dashboard.commonality === 'model' ? 'Model' : 'Part'}
          <select
            value={activeValue}
            onChange={(e) => setSelectedValue(e.target.value)}
            className="h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2 text-[12px] text-[#344054]"
          >
            {options.length === 0 && <option value="">None available</option>}
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {canEdit && (
          <div className="ml-auto flex gap-2">
            {!adding && <Button variant="primary" size="sm" onClick={() => setAdding(true)}>+ Add chart</Button>}
            {activeValue && (
              <Button variant="secondary" size="sm" onClick={() => updateCrossDashboard(dashboard.id, { defaultValue: activeValue })} title="Open this dashboard on the current selection by default">
                Set as default
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => { if (confirm('Delete this cross-activity dashboard?')) deleteCrossDashboard(dashboard.id) }}>Delete dashboard</Button>
          </div>
        )}
      </div>

      {adding && (
        <WidgetBuilder
          activityIds={dashboard.activityIds}
          activities={activities}
          onCancel={() => setAdding(false)}
          onAdd={(w) => { addWidget(w); setAdding(false) }}
        />
      )}

      {dashboard.widgets.length === 0 && !adding ? (
        <Card>
          <div className="py-10 text-center text-sm text-[var(--color-muted)]">
            No charts yet. {canEdit ? 'Click “+ Add chart” to compare a data point across these activities.' : 'An editor can add charts here.'}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {dashboard.widgets.map((w) => (
            <div key={w.id} className="epmp-card p-4" style={{ height: 320 }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--color-text)]">{w.title}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-primary">{DISPLAY_LABELS[w.display]}</span>
                  {canEdit && <button onClick={() => removeWidget(w.id)} className="text-[10px] text-[var(--color-destructive)] hover:underline">Remove</button>}
                </span>
              </div>
              <div style={{ height: 250 }}>
                <CrossWidgetChart widget={w} points={points} activities={activities} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inline widget builder with the chart recommender ───────────────────────────

function WidgetBuilder({
  activityIds, activities, onAdd, onCancel
}: {
  activityIds: string[]
  activities: ActivityDefinition[]
  onAdd: (w: CrossWidget) => void
  onCancel: () => void
}) {
  type PlotChoice = 'completionRate' | 'count' | 'overdue' | 'awaitingValidation' | 'approved' | 'status' | 'ryg' | string // string = field:key
  const fields = useMemo(() => sharedFields(activityIds, activities), [activityIds, activities])

  const [choice, setChoice] = useState<PlotChoice>('completionRate')

  const plot: CrossPlot = useMemo(() => {
    if (choice === 'status') return { kind: 'status' }
    if (choice === 'ryg') return { kind: 'ryg' }
    if (typeof choice === 'string' && choice.startsWith('field:')) return { kind: 'field', fieldKey: choice.slice(6) }
    return { kind: 'measure', measure: choice as any }
  }, [choice])

  const recommended = useMemo(() => recommendCrossDisplays(plot, activities), [plot, activities])
  const [display, setDisplay] = useState<CrossDisplay>(recommended[0])

  // Keep display valid when the plot (and thus recommendations) change.
  const effectiveDisplay = recommended.includes(display) ? display : recommended[0]

  const plotLabel =
    choice === 'status' ? 'Status breakdown'
    : choice === 'ryg' ? 'RYG breakdown'
    : typeof choice === 'string' && choice.startsWith('field:') ? (fields.find((f) => `field:${f.key}` === choice)?.label ?? 'Field')
    : MEASURE_LABELS[choice as string]

  const submit = () => {
    onAdd({
      id: `cw-${Date.now().toString(36)}`,
      title: plotLabel,
      plot,
      display: effectiveDisplay
    })
  }

  return (
    <Card className="mb-4">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Plot (what to compare)</span>
            <select value={typeof choice === 'string' ? choice : ''} onChange={(e) => setChoice(e.target.value)} className={`${selectCls} w-full`}>
              <optgroup label="Measures">
                {Object.entries(MEASURE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </optgroup>
              <optgroup label="Breakdowns">
                <option value="status">Status breakdown</option>
                <option value="ryg">RYG breakdown</option>
              </optgroup>
              {fields.length > 0 && (
                <optgroup label="Shared fields">
                  {fields.map((f) => <option key={f.key} value={`field:${f.key}`}>{f.label}</option>)}
                </optgroup>
              )}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">
              Chart type <span className="text-[10px] text-[var(--color-muted)]">· suggested for this data</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recommended.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setDisplay(d)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                    effectiveDisplay === d
                      ? 'border-[var(--color-primary)] bg-secondary text-primary font-medium'
                      : 'border-[var(--color-border)] bg-white text-[var(--color-text)]'
                  }`}
                >
                  {DISPLAY_LABELS[d]}{i === 0 ? <FbIcon name="star" size={12} className="ml-1" /> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit}>Add chart</Button>
        </div>
      </div>
    </Card>
  )
}
