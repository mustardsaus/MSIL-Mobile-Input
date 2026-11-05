import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Modal, RygDot } from '../../components'
import type { Action, ActionStatus } from '../../domain'
import { useQAStore } from '../../store/qaStore'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import type { PersonaId } from '../../store/personaStore'
import { actionRyg, getPicOn } from '../../engine'
import { DEMO_TODAY, fmtDate, partInScope, toRygStatus } from '../scope'
import { useExcMatcher } from './exceptionFilters'

const filterCls = 'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 text-[11px] text-[#344054]'
const thCls = 'text-left px-3 py-2.5 font-medium text-[var(--color-muted)] whitespace-nowrap'
const fieldCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'
const STATUSES: ActionStatus[] = ['Open', 'In progress', 'Done']
const STATUS_STYLE: Record<ActionStatus, string> = {
  Open: 'bg-slate-100 text-slate-700',
  'In progress': 'bg-blue-100 text-blue-800',
  Done: 'bg-emerald-100 text-emerald-800'
}
const ASSIGNEES: PersonaId[] = ['Vendor', 'PIC', 'SIC', 'DPM']

export interface ActionRow {
  action: Action
  templateRowId: string
  partNo: string
  partName: string
  vendorName: string
  activityName: string
  milestoneId: string
  overdue: boolean
}

/** Every action raised on an entry the current role may see, flattened with its part and activity. */
export function useActionRows(): ActionRow[] {
  const { entries, parts, templateRows, activities } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const match = useExcMatcher()
  return useMemo(() => {
    const partByNo = new Map(parts.map((p) => [p.partNo, p]))
    const rowById = new Map(templateRows.map((r) => [r.id, r]))
    const actById = new Map(activities.map((a) => [a.id, a]))
    const out: ActionRow[] = []
    for (const e of entries) {
      if (!e.actions?.length) continue
      const part = partByNo.get(e.partNo)
      const row = rowById.get(e.templateRowId)
      if (!part || !row || part.supersededBy || !partInScope(part, currentPersona) || !match(part, e.templateRowId)) continue
      for (const a of e.actions) {
        out.push({
          action: a, templateRowId: e.templateRowId, partNo: part.partNo, partName: part.partName, vendorName: part.vendorName,
          activityName: actById.get(row.activityId)?.name ?? row.activityId, milestoneId: row.milestoneId,
          overdue: actionRyg(a, DEMO_TODAY) === 'Red'
        })
      }
    }
    return out.sort((x, y) => (x.action.targetDate ?? '9999').localeCompare(y.action.targetDate ?? '9999'))
  }, [entries, parts, templateRows, activities, currentPersona, match])
}

type StatusFilter = 'Active' | 'Overdue' | ActionStatus | 'All'

/** Central action management: every action across parts and activities, with status updates and raising new ones. */
export function ActionsView() {
  const { parts, picAssignments, templateRows, activities, addAction, updateAction } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const rows = useActionRows()
  const canManage = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'
  const canChange = (r: ActionRow) => canManage || currentPersona === r.action.assignedTo
  const [status, setStatus] = useState<StatusFilter>('Active')
  const [assignee, setAssignee] = useState<'All' | PersonaId>('All')
  const [mine, setMine] = useState(false)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  const [raiseOpen, setRaiseOpen] = useState(false)

  const filtered = rows.filter((r) => {
    const a = r.action
    if (status === 'Active' && a.status === 'Done') return false
    if (status === 'Overdue' && !r.overdue) return false
    if (STATUSES.includes(status as ActionStatus) && a.status !== status) return false
    if (assignee !== 'All' && a.assignedTo !== assignee) return false
    if (mine && a.assignedTo !== currentPersona) return false
    if (search && !`${r.partNo} ${r.partName} ${a.title} ${r.activityName} ${r.vendorName}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const actorFor = (r: ActionRow): string | undefined => {
    if (currentPersona === 'Vendor') return FIXED_VENDOR_NAME
    if (currentPersona === 'PIC') {
      const part = parts.find((p) => p.partNo === r.partNo)
      return (part ? getPicOn(part, picAssignments, DEMO_TODAY).name : '') || undefined
    }
    return undefined
  }
  const setStatusOf = (r: ActionRow, next: ActionStatus) =>
    updateAction(r.templateRowId, r.partNo, r.action.id, { status: next }, currentPersona, actorFor(r))
  const changeable = filtered.filter((r) => canChange(r) && r.action.status !== 'Done')
  const pickedRows = filtered.filter((r) => picked.has(r.action.id) && canChange(r) && r.action.status !== 'Done')
  const allPicked = changeable.length > 0 && changeable.every((r) => picked.has(r.action.id))
  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const markDone = () => {
    for (const r of pickedRows) setStatusOf(r, 'Done')
    setNotice(`${pickedRows.length} action${pickedRows.length === 1 ? '' : 's'} marked done.`)
    setPicked(new Set())
  }

  // ── Raise action dialog ──
  const [fPart, setFPart] = useState('')
  const [fRow, setFRow] = useState('')
  const [fTitle, setFTitle] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fTo, setFTo] = useState<PersonaId>('Vendor')
  const [fDate, setFDate] = useState('')
  const scopeParts = useMemo(() => parts.filter((p) => !p.supersededBy && partInScope(p, currentPersona)), [parts, currentPersona])
  const part = scopeParts.find((p) => p.partNo === fPart)
  const rowChoices = useMemo(
    () =>
      part
        ? templateRows.filter((r) => r.section === part.section).map((r) => ({ id: r.id, label: `${activities.find((a) => a.id === r.activityId)?.name ?? r.activityId} · ${r.milestoneId}` }))
        : [],
    [part, templateRows, activities]
  )
  const openRaise = () => {
    setFPart(''); setFRow(''); setFTitle(''); setFDesc(''); setFTo('Vendor'); setFDate(''); setRaiseOpen(true)
  }
  const validRaise = !!part && !!fRow && fTitle.trim().length > 0
  const raise = () => {
    if (!part || !validRaise) return
    const actor = currentPersona === 'PIC' ? getPicOn(part, picAssignments, DEMO_TODAY).name || undefined : undefined
    addAction(fRow, part.partNo, {
      title: fTitle.trim(), description: fDesc.trim() || undefined, assignedTo: fTo,
      assignedToName: fTo === 'Vendor' ? part.vendorName : undefined, targetDate: fDate || undefined
    }, currentPersona, actor)
    setRaiseOpen(false)
    setNotice('Action raised.')
  }

  const myOpen = rows.filter((r) => r.action.assignedTo === currentPersona && r.action.status !== 'Done').length
  return (
    <div>
      <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPicked(new Set()) }} className={filterCls}>
          <option value="Active">Open and in progress</option>
          <option value="Overdue">Overdue</option>
          <option value="Open">Open</option>
          <option value="In progress">In progress</option>
          <option value="Done">Done</option>
          <option value="All">All statuses</option>
        </select>
        <select aria-label="Assigned to" value={assignee} onChange={(e) => setAssignee(e.target.value as 'All' | PersonaId)} className={filterCls}>
          <option value="All">Anyone</option>
          {ASSIGNEES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[11px] text-[#344054]">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Assigned to me{myOpen > 0 ? ` (${myOpen})` : ''}
        </label>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search part / action / vendor…"
          className={`${filterCls} w-64 max-w-full placeholder-[var(--color-muted)]`} />
        <div className="ml-auto flex items-center gap-2">
          {notice && <span className="text-[11px] text-emerald-700" role="status">{notice}</span>}
          <Button variant="secondary" size="sm" disabled={pickedRows.length === 0} onClick={markDone}>
            Mark selected done ({pickedRows.length})
          </Button>
          {canManage && <Button variant="primary" size="sm" onClick={openRaise}>+ Raise action</Button>}
        </div>
      </section>

      <Card flush className="!overflow-visible">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="w-8 px-3 py-2.5">
                  {changeable.length > 0 && (
                    <input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(changeable.map((r) => r.action.id)))} />
                  )}
                </th>
                <th className={thCls}>Action</th>
                <th className={thCls}>Part</th>
                <th className={thCls}>Activity</th>
                <th className={thCls}>Assigned to</th>
                <th className={thCls}>Target</th>
                <th className={thCls}>Status</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const a = r.action
                return (
                  <tr key={a.id} className="border-b border-[var(--color-border)] align-top last:border-0 hover:bg-secondary/40">
                    <td className="px-3 py-2.5">
                      {canChange(r) && a.status !== 'Done' && (
                        <input type="checkbox" aria-label={`Select ${a.title}`} checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[#101828]">{a.title}</div>
                      {a.description && <div className="text-[11px] text-[var(--color-muted)]">{a.description}</div>}
                      <div className="text-[10px] text-[var(--color-muted)]">raised by {a.createdBy} · {fmtDate(a.createdAt.slice(0, 10))}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[11px]">{r.partNo}</div>
                      <div className="text-[11px] text-[var(--color-muted)]">{r.partName}</div>
                      <div className="text-[10px] text-[var(--color-muted)]">{r.vendorName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {r.activityName}
                      <div className="text-[10px] text-[var(--color-muted)]">{r.milestoneId}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {a.assignedTo}
                      {a.assignedToName && <div className="text-[10px] text-[var(--color-muted)]">{a.assignedToName}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px]">
                      {a.targetDate ? (
                        <span className="inline-flex items-center gap-1.5">
                          <RygDot status={toRygStatus(actionRyg(a, DEMO_TODAY))} />
                          <span className={r.overdue ? 'font-semibold text-[#b91c1c]' : 'text-[var(--color-muted)]'}>{fmtDate(a.targetDate)}</span>
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)]">no date</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {canChange(r) ? (
                        <select
                          aria-label={`Status of ${a.title}`}
                          value={a.status}
                          onChange={(e) => setStatusOf(r, e.target.value as ActionStatus)}
                          className={`h-7 rounded-md border border-[var(--color-border)] px-1.5 text-[11px] ${STATUS_STYLE[a.status]}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link to={`/activities/${r.templateRowId}?part=${encodeURIComponent(r.partNo)}`} className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-muted)]">No actions match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        title="Raise action"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRaiseOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" disabled={!validRaise} onClick={raise}>Raise action</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Part</span>
            <select value={fPart} onChange={(e) => { setFPart(e.target.value); setFRow('') }} className={fieldCls} aria-label="Part">
              <option value="">Choose a part…</option>
              {scopeParts.map((p) => (
                <option key={p.partNo} value={p.partNo}>{p.partNo} · {p.partName}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Activity</span>
            <select value={fRow} onChange={(e) => setFRow(e.target.value)} disabled={!part} className={fieldCls} aria-label="Activity">
              <option value="">Choose an activity…</option>
              {rowChoices.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Action</span>
            <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} className={fieldCls} placeholder="What has to be done" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Details (optional)</span>
            <textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} className={fieldCls} />
          </label>
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Assign to</span>
              <select value={fTo} onChange={(e) => setFTo(e.target.value as PersonaId)} className={fieldCls} aria-label="Assign to">
                {ASSIGNEES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Target date (optional)</span>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={fieldCls} />
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
