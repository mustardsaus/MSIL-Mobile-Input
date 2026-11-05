import { useEffect, useState } from 'react'
import { Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import { getPicOn } from '../../engine'
import { DEMO_TODAY, fmtDate } from '../scope'
import { DelayReasonDialog } from './DelayReasonDialog'
import { needsVendorReason, useDelayRows } from './delay'
import type { DelayItem, DelayRow, DelayState } from './delay'

type Slice = 'needed' | 'review' | 'accepted'

const PILL: Record<DelayState, { label: string; cls: string }> = {
  Needed: { label: 'Reason needed', cls: 'bg-red-100 text-red-800' },
  SentBack: { label: 'Sent back', cls: 'bg-orange-100 text-orange-800' },
  Submitted: { label: 'Awaiting PIC', cls: 'bg-blue-100 text-blue-800' },
  Accepted: { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-800' }
}

function Tile(props: { title: string; count: number; sub: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      aria-pressed={props.active}
      className="epmp-card flex flex-col items-start px-4 py-3 text-left transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
      style={props.active ? { boxShadow: `inset 0 0 0 2px ${props.color}` } : undefined}
    >
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: props.color }}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: props.color }} />
        {props.title}
      </span>
      <span className="mt-1 text-[28px] font-bold leading-[32px]" style={{ color: props.color }}>{props.count}</span>
      <span className="text-[10px] text-[var(--color-muted)]">{props.sub}</span>
    </button>
  )
}

/**
 * Delay reasons on My Work.
 * Vendor: late activities that need a reason, with a pop-up on arrival and a bulk "Give reason" button.
 * PIC / SIC / DPM: reasons waiting for review (accept or send back, one or many) and reasons the vendor still owes.
 */
export function DelayPanel({ showEmpty = false }: { showEmpty?: boolean }) {
  const { parts, picAssignments, submitDelayReasons, decideDelayReasons } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isVendor = currentPersona === 'Vendor'
  const canDecide = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  const { rows, needed, review, accepted } = useDelayRows()

  const [slice, setSlice] = useState<Slice>(isVendor ? 'needed' : 'review')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState(false)
  const [dialogItems, setDialogItems] = useState<DelayItem[]>([])
  const [sendBack, setSendBack] = useState(false)
  const [comment, setComment] = useState('')
  const [notice, setNotice] = useState('')

  // The vendor gets the pop-up on arriving at My Work (once per browser session unless dismissed with “Not now”).
  useEffect(() => {
    if (!isVendor || needed.length === 0) return
    if (sessionStorage.getItem('qa-delay-popup-dismissed') === '1') return
    setDialogItems(needed.map((r) => r.item))
    setDialog(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVendor, needed.length])

  const shown = slice === 'needed' ? needed : slice === 'review' ? review : accepted
  const pickable = (r: DelayRow) => (isVendor ? needsVendorReason(r.state) : canDecide && r.state === 'Submitted')
  const pickedRows = shown.filter((r) => picked.has(r.key) && pickable(r))
  const allPickable = shown.filter(pickable)
  const allPicked = allPickable.length > 0 && allPickable.every((r) => picked.has(r.key))
  const choose = (s: Slice) => { setSlice(s); setPicked(new Set()); setNotice('') }
  const toggle = (k: string) =>
    setPicked((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const submit = (items: DelayItem[], category: string, remark: string, revisedDate: string) => {
    submitDelayReasons({
      items: items.map((i) => ({ rowId: i.rowId, partNo: i.partNo, activityId: i.activityId, plannedEnd: i.plannedEnd })),
      category, remark, revisedDate, by: currentPersona, actorName: FIXED_VENDOR_NAME
    })
    setNotice(`Reason given for ${items.length} activit${items.length === 1 ? 'y' : 'ies'}. The PIC will accept it or send it back.`)
    setDialog(false)
    setPicked(new Set())
  }
  const closeDialog = () => {
    sessionStorage.setItem('qa-delay-popup-dismissed', '1')
    setDialog(false)
  }
  const picName = () => {
    if (currentPersona !== 'PIC') return undefined
    const part = parts.find((p) => p.partNo === pickedRows[0]?.item.partNo)
    return (part ? getPicOn(part, picAssignments, DEMO_TODAY).name : '') || undefined
  }
  const accept = () => {
    const ids = pickedRows.map((r) => r.record?.id).filter((x): x is string => !!x)
    decideDelayReasons({ ids, decision: 'Accepted', by: currentPersona, actorName: picName() })
    setNotice(`${ids.length} reason${ids.length === 1 ? '' : 's'} accepted.`)
    setPicked(new Set())
  }
  const doSendBack = () => {
    const ids = pickedRows.map((r) => r.record?.id).filter((x): x is string => !!x)
    decideDelayReasons({ ids, decision: 'SentBack', comment, by: currentPersona, actorName: picName() })
    setNotice(`${ids.length} reason${ids.length === 1 ? '' : 's'} sent back to the vendor.`)
    setPicked(new Set())
    setSendBack(false)
  }

  if (!isVendor && !canDecide) return null
  if (rows.length === 0) {
    return showEmpty ? <div className="epmp-card px-4 py-8 text-center text-[12px] text-[var(--color-muted)]">No delayed activities or reasons for your parts.</div> : null
  }

  return (
    <section className="mb-4" aria-label="Delay reasons">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-[var(--color-text)]">Delay reasons</h2>
        <span className="text-[11px] text-[var(--color-muted)]">
          {isVendor
            ? 'Activities past their planned end need a reason. The PIC accepts it or sends it back.'
            : 'Vendors give a reason when an activity is late. Accept it or send it back.'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isVendor ? (
          <>
            <Tile title="Reason needed" count={needed.length} sub="late and not explained, or sent back" color="#dc2626" active={slice === 'needed'} onClick={() => choose('needed')} />
            <Tile title="Awaiting PIC" count={review.length} sub="reason given, PIC to accept or send back" color="#2563eb" active={slice === 'review'} onClick={() => choose('review')} />
            <Tile title="Accepted" count={accepted.length} sub="reason accepted by the PIC" color="#16a34a" active={slice === 'accepted'} onClick={() => choose('accepted')} />
          </>
        ) : (
          <>
            <Tile title="To review" count={review.length} sub="vendor reasons waiting for you" color="#2563eb" active={slice === 'review'} onClick={() => choose('review')} />
            <Tile title="Waiting for vendor" count={needed.length} sub="late with no reason, or sent back" color="#dc2626" active={slice === 'needed'} onClick={() => choose('needed')} />
            <Tile title="Accepted" count={accepted.length} sub="reasons you accepted" color="#16a34a" active={slice === 'accepted'} onClick={() => choose('accepted')} />
          </>
        )}
      </div>

      <div className="epmp-card mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
          <span className="text-[12px] font-medium text-[var(--color-text)]">{shown.length} activit{shown.length === 1 ? 'y' : 'ies'}</span>
          {notice && <span className="text-[11px] text-emerald-700" role="status">{notice}</span>}
          <div className="ml-auto flex items-center gap-2">
            {isVendor && (
              <Button variant="primary" size="sm" disabled={pickedRows.length === 0} onClick={() => { setDialogItems(pickedRows.map((r) => r.item)); setDialog(true) }}>
                Give reason for selected ({pickedRows.length})
              </Button>
            )}
            {canDecide && (
              <>
                <Button variant="secondary" size="sm" disabled={pickedRows.length === 0} onClick={() => { setComment(''); setSendBack(true) }}>
                  Send back selected ({pickedRows.length})
                </Button>
                <Button variant="primary" size="sm" disabled={pickedRows.length === 0} onClick={accept}>
                  Accept selected ({pickedRows.length})
                </Button>
              </>
            )}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-5 text-center text-[12px] text-[var(--color-muted)]">Nothing here.</p>
        ) : (
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[var(--color-surface)]">
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                  <th className="w-8 px-3 py-2">
                    {allPickable.length > 0 && (
                      <input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(allPickable.map((r) => r.key)))} />
                    )}
                  </th>
                  <th className="px-3 py-2 font-medium">Part</th>
                  <th className="px-3 py-2 font-medium">Activity</th>
                  <th className="px-3 py-2 font-medium">Late by</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className="border-b border-[var(--color-border)] align-top last:border-0">
                    <td className="px-3 py-2">
                      {pickable(r) && <input type="checkbox" aria-label={`Select ${r.item.partNo} ${r.item.activityName}`} checked={picked.has(r.key)} onChange={() => toggle(r.key)} />}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-[#101828]">{r.partName}</div>
                      <div className="font-mono text-[10.5px] text-[var(--color-muted)]">{r.item.partNo}</div>
                    </td>
                    <td className="px-3 py-2">
                      {r.item.activityName}
                      <div className="text-[10.5px] text-[var(--color-muted)]">{r.item.milestoneId}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="font-semibold text-[#b91c1c]">{r.item.daysLate} d</span>
                      <div className="text-[10.5px] text-[var(--color-muted)]">end {fmtDate(r.item.plannedEnd)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${PILL[r.state].cls}`}>{PILL[r.state].label}</span>
                    </td>
                    <td className="max-w-[340px] px-3 py-2 text-[11px] text-[var(--color-muted)]">
                      {r.record ? (
                        <>
                          <strong className="text-[#344054]">{r.record.category}</strong>
                          {r.record.remark ? `: ${r.record.remark}` : ''}
                          {r.record.revisedDate ? ` · new date ${fmtDate(r.record.revisedDate)}` : ''}
                          {r.state === 'SentBack' && r.record.decisionComment && <div className="mt-0.5 text-[#9a3412]">PIC: “{r.record.decisionComment}”</div>}
                        </>
                      ) : (
                        'No reason given yet'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DelayReasonDialog open={dialog} onClose={closeDialog} items={dialogItems} onSubmit={submit} />
      <Modal
        open={sendBack}
        onClose={() => setSendBack(false)}
        title={`Send ${pickedRows.length} reason${pickedRows.length === 1 ? '' : 's'} back`}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setSendBack(false)}>Cancel</Button>
            <Button variant="danger" size="md" disabled={!comment.trim()} onClick={doSendBack}>Send back</Button>
          </>
        }
      >
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">What should the vendor fix? (required)</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 py-2 text-[12px]" placeholder="e.g. Give the date the tool will be ready" />
        </label>
      </Modal>
    </section>
  )
}
