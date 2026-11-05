import { useMemo, useState } from 'react'
import { Card, Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import type { Deviation, DeviationStatus } from '../../domain'
import { fmtDate, partInScope } from '../scope'
import { useExcMatcher } from '../exceptions/exceptionFilters'

const filterCls = 'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] text-[#344054]'
const thCls = 'text-left px-3 py-2.5 font-medium text-[var(--color-muted)] whitespace-nowrap'

const STATUS_STYLE: Record<DeviationStatus, string> = {
  'In progress': 'bg-amber-100 text-amber-800',
  Approved: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-red-100 text-red-700',
  'Sent back': 'bg-slate-100 text-slate-600'
}

/** A flattened deviation row with its part/activity context. */
interface DevRow {
  dev: Deviation
  templateRowId: string
  partNo: string
  partName: string
  model: string
  vendorName: string
  activityName: string
  milestoneId: string
  /** The role whose decision is pending (empty when closed). */
  stageRole: string
}

/** Deviation register (content only; hosted by the Exception Management page). */
export function DeviationsView() {
  const { entries, parts, templateRows, activities, advanceDeviation } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const match = useExcMatcher()

  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | DeviationStatus>('All')
  const [mineOnly, setMineOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [decide, setDecide] = useState<{ row: DevRow; action: 'Approve' | 'Reject' | 'Send back' } | null>(null)
  const [comment, setComment] = useState('')

  const rows = useMemo<DevRow[]>(() => {
    const partByNo = new Map(parts.map((p) => [p.partNo, p]))
    const rowById = new Map(templateRows.map((r) => [r.id, r]))
    const actById = new Map(activities.map((a) => [a.id, a]))
    const out: DevRow[] = []
    for (const e of entries) {
      if (!e.deviations?.length) continue
      const part = partByNo.get(e.partNo)
      const row = rowById.get(e.templateRowId)
      if (!part || !row || part.supersededBy) continue
      if (!partInScope(part, currentPersona) || !match(part, e.templateRowId)) continue
      const act = actById.get(row.activityId)
      for (const dev of e.deviations) {
        out.push({
          dev,
          templateRowId: e.templateRowId,
          partNo: part.partNo,
          partName: part.partName,
          model: part.model,
          vendorName: part.vendorName,
          activityName: act?.name ?? row.activityId,
          milestoneId: row.milestoneId,
          stageRole: dev.status === 'In progress' ? dev.flow[dev.currentStep] : ''
        })
      }
    }
    return out.sort((a, b) => b.dev.raisedAt.localeCompare(a.dev.raisedAt))
  }, [entries, parts, templateRows, activities, currentPersona, match])

  const isOpen = (d: Deviation) => d.status === 'In progress' || d.status === 'Sent back'
  const canActNow = (r: DevRow) =>
    isOpen(r.dev) && (currentPersona === 'Admin' || r.dev.flow[r.dev.currentStep] === currentPersona)

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter === 'Open' && !isOpen(r.dev)) return false
        if (statusFilter !== 'All' && statusFilter !== 'Open' && r.dev.status !== statusFilter) return false
        if (mineOnly && !canActNow(r)) return false
        if (search) {
          const q = search.toLowerCase()
          if (!`${r.partNo} ${r.partName} ${r.dev.title} ${r.vendorName}`.toLowerCase().includes(q)) return false
        }
        return true
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, statusFilter, mineOnly, search, currentPersona]
  )

  const myQueue = rows.filter(canActNow).length

  function runDecision() {
    if (!decide) return
    const name = currentPersona // role acts as the named approver in the prototype
    advanceDeviation(decide.row.templateRowId, decide.row.partNo, decide.row.dev.id, decide.action, currentPersona, name, comment)
    setDecide(null)
    setComment('')
  }

  return (
    <div>
      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
        <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={filterCls}>
          <option value="Open">Open (in progress)</option>
          <option value="All">All statuses</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <label className="flex items-center gap-2 text-[11px] text-[#344054]">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          Awaiting my decision{myQueue > 0 ? ` (${myQueue})` : ''}
        </label>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search part / deviation / vendor…"
          className={`${filterCls} w-64 max-w-full placeholder-[var(--color-muted)]`}
        />
      </section>

      <Card flush className="!overflow-visible">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className={thCls}>Deviation</th>
                <th className={thCls}>Part</th>
                <th className={thCls}>Activity</th>
                <th className={thCls}>Flow</th>
                <th className={thCls}>Stage</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>E-Doc</th>
                <th className={thCls}>Target</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const d = r.dev
                return (
                  <tr key={d.id} className="border-b border-[var(--color-border)] last:border-0 align-top hover:bg-secondary/40">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[#101828]">{d.title}</div>
                      {d.description && <div className="text-[11px] text-[var(--color-muted)]">{d.description}</div>}
                      <div className="text-[10px] text-[var(--color-muted)]">raised by {d.raisedBy} · {fmtDate(d.raisedAt.slice(0, 10))}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[11px]">{r.partNo}</div>
                      <div className="text-[11px] text-[var(--color-muted)]">{r.partName} · {r.model}</div>
                      <div className="text-[10px] text-[var(--color-muted)]">{r.vendorName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {r.activityName}
                      <div className="text-[10px] text-[var(--color-muted)]">{r.milestoneId}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {d.flow.map((role, i) => {
                          const done = d.status === 'Approved' ? true : i < d.currentStep
                          const active = isOpen(d) && i === d.currentStep
                          return (
                            <span key={role} className="flex items-center gap-1">
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                done ? 'bg-emerald-100 text-emerald-700'
                                : active ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                                : 'bg-slate-100 text-slate-500'}`}>{role}</span>
                              {i < d.flow.length - 1 && <span className="text-[9px] text-[var(--color-muted)]">→</span>}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">{r.stageRole || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono">{d.edocNumber || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-[var(--color-muted)]">{d.targetDate ? fmtDate(d.targetDate) : '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {canActNow(r) ? (
                        <div className="flex justify-end gap-1.5">
                          <Button variant="primary" size="sm" onClick={() => setDecide({ row: r, action: 'Approve' })}>Approve</Button>
                          <Button variant="secondary" size="sm" onClick={() => setDecide({ row: r, action: 'Send back' })}>Send back</Button>
                          <button onClick={() => setDecide({ row: r, action: 'Reject' })} className="text-[11px] font-medium text-[var(--color-destructive)] hover:underline">Reject</button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--color-muted)]">{isOpen(d) ? `with ${r.stageRole}` : '—'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-[var(--color-muted)]">No deviations match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={decide !== null}
        onClose={() => { setDecide(null); setComment('') }}
        title={decide ? `${decide.action} deviation` : undefined}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => { setDecide(null); setComment('') }}>Cancel</Button>
            <Button variant={decide?.action === 'Reject' ? 'danger' : 'primary'} size="md" onClick={runDecision}>
              {decide?.action}
            </Button>
          </>
        }
      >
        {decide && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-[var(--color-muted)]">
              <strong>{decide.row.dev.title}</strong> on {decide.row.partNo} · {decide.row.activityName}.
              {decide.action === 'Approve' && (decide.row.dev.currentStep >= decide.row.dev.flow.length - 1
                ? ' This is the final approval — the deviation will be marked Approved.'
                : ` Approving moves it to ${decide.row.dev.flow[decide.row.dev.currentStep + 1]}.`)}
              {decide.action === 'Send back' && ` It will restart at ${decide.row.dev.flow[0]}.`}
              {decide.action === 'Reject' && ' This ends the deviation as Rejected.'}
            </p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Comment {decide.action !== 'Approve' ? '(recommended)' : '(optional)'}</span>
              <input value={comment} onChange={(e) => setComment(e.target.value)} className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px]" />
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
