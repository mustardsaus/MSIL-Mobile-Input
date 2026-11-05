import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { PageHeader, Tabs } from '../../components'
import { fmtDate } from '../scope'
import { DeviationsView } from '../deviations/DeviationsPage'
import { DelayPanel } from '../delay/DelayPanel'
import { ActionsView } from './ActionsView'
import { useExceptionData } from './useExceptionData'
import type { Attention, ExceptionTab } from './useExceptionData'
import { EMPTY_EXC_FILTERS, ExcFilterProvider, ExceptionFilterBar } from './exceptionFilters'
import type { ExcFilters } from './exceptionFilters'

type TabId = ExceptionTab

const TYPE_STYLE: Record<Attention['type'], string> = {
  Deviation: 'bg-amber-100 text-amber-800',
  Action: 'bg-blue-100 text-blue-800',
  Delay: 'bg-red-100 text-red-800',
  NG: 'bg-rose-100 text-rose-800'
}

function SummaryCard(props: { title: string; color: string; main: number; mainLabel: string; lines: [string, number][]; onOpen: () => void }) {
  return (
    <button
      onClick={props.onOpen}
      className="epmp-card flex flex-col items-start px-4 py-3 text-left transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
    >
      <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: props.color }}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: props.color }} />
        {props.title}
      </span>
      <span className="mt-1 text-[30px] font-bold leading-[34px]" style={{ color: props.color }}>{props.main}</span>
      <span className="mb-1.5 text-[10.5px] text-[var(--color-muted)]">{props.mainLabel}</span>
      <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[#344054]">
        {props.lines.map(([l, n]) => (
          <span key={l}><strong>{n}</strong> {l}</span>
        ))}
      </span>
    </button>
  )
}

/**
 * One home for everything that went off plan: deviations (approval chain), actions (follow-up with an owner and a
 * date) and delay reasons (vendor explains a late activity, PIC accepts or sends back).
 */
export function ExceptionsPage() {
  // The usual filters apply to every tab; the provider scopes them to this page only.
  const [filters, setFilters] = useState<ExcFilters>(EMPTY_EXC_FILTERS)
  return (
    <ExcFilterProvider value={filters}>
      <ExceptionsBody filters={filters} onFilters={setFilters} />
    </ExcFilterProvider>
  )
}

function ExceptionsBody({ filters, onFilters }: { filters: ExcFilters; onFilters: (f: ExcFilters) => void }) {
  const [params, setParams] = useSearchParams()
  const { isVendor, actions, delays, devRows, devMine, actMine, delayMine, ngRows, attention } = useExceptionData()
  const tabs: { id: TabId; label: string; badge?: number }[] = [{ id: 'overview', label: 'Overview' }]
  if (!isVendor) tabs.push({ id: 'deviations', label: 'Deviations', badge: devMine || undefined })
  tabs.push({ id: 'actions', label: 'Actions', badge: actMine || undefined })
  tabs.push({ id: 'delays', label: 'Delay reasons', badge: delayMine || undefined })
  const asked = params.get('tab') as TabId | null
  const tab: TabId = asked && tabs.some((t) => t.id === asked) ? asked : 'overview'
  const go = (t: TabId) => setParams(t === 'overview' ? {} : { tab: t })

  const actOpen = actions.filter((a) => a.action.status !== 'Done').length
  return (
    <div>
      <PageHeader
        title="Exception Management"
        section="Modules"
        description="Everything that went off plan, in one place: deviations, actions and delay reasons. See what needs you and act on it."
      />
      <ExceptionFilterBar value={filters} onChange={onFilters} />
      <Tabs className="mb-4" activeId={tab} onChange={(id) => go(id as TabId)} items={tabs} />

      {tab === 'overview' && (
        <div>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {!isVendor && (
              <SummaryCard
                title="Deviations" color="#d97706" main={devRows.filter((d) => d.open).length} mainLabel="open, in the approval chain"
                lines={[['awaiting you', devMine], ['closed', devRows.filter((d) => !d.open).length]]}
                onOpen={() => go('deviations')}
              />
            )}
            <SummaryCard
              title="NG rounds" color="#e11d48" main={ngRows.length} mainLabel="open — awaiting resubmission"
              lines={[['overdue', ngRows.filter((n) => n.target && n.target < '2026-10-15').length]]}
              onOpen={() => { const el = document.getElementById('exc-attention'); el?.scrollIntoView({ behavior: 'smooth' }) }}
            />
            <SummaryCard
              title="Actions" color="#2563eb" main={actOpen} mainLabel="open or in progress"
              lines={[['overdue', actions.filter((a) => a.overdue && a.action.status !== 'Done').length], ['done', actions.filter((a) => a.action.status === 'Done').length], ['assigned to you', actMine]]}
              onOpen={() => go('actions')}
            />
            <SummaryCard
              title="Delay reasons" color="#dc2626" main={delays.needed.length + delays.review.length} mainLabel="late and not yet closed"
              lines={[['reason needed', delays.needed.length], ['to review', delays.review.length], ['accepted', delays.accepted.length]]}
              onOpen={() => go('delays')}
            />
          </div>
          <section id="exc-attention" className="epmp-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
              <h2 className="m-0 text-[13px] font-semibold text-[var(--color-text)]">Needs your attention</h2>
              <span className="text-[11px] text-[var(--color-muted)]">{attention.length} item{attention.length === 1 ? '' : 's'}</span>
            </div>
            {attention.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-[var(--color-muted)]">Nothing is waiting for you.</p>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {attention.slice(0, 60).map((a) => (
                      <tr key={a.type + a.key} className="border-b border-[var(--color-border)] last:border-0 hover:bg-secondary/40">
                        <td className="w-24 px-4 py-2.5">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLE[a.type]}`}>{a.type}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-[#101828]">{a.title}</div>
                          <div className="text-[11px] text-[var(--color-muted)]">{a.where}</div>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-[#344054]">{a.note}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-[var(--color-muted)]">{a.due ? fmtDate(a.due) : ''}</td>
                        <td className="px-4 py-2.5 text-right">
                          {a.type === 'NG' && a.rowId && a.partNo ? (
                            <Link to={`/activities/${a.rowId}?part=${encodeURIComponent(a.partNo)}`} className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline">Open →</Link>
                          ) : (
                            <button onClick={() => go(a.tab)} className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline">Open →</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      {tab === 'deviations' && <DeviationsView />}
      {tab === 'actions' && <ActionsView />}
      {tab === 'delays' && <DelayPanel showEmpty />}
    </div>
  )
}
