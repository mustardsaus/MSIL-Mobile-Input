import { useMemo, useState } from 'react'
import { Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { FIXED_VENDOR_NAME, usePersonaStore } from '../../store/personaStore'
import { getPicOn, getReleaseState, latestReturn } from '../../engine'
import type { PartRecord, ReleaseState } from '../../domain'
import { DEMO_TODAY, fmtDate, partInScope } from '../scope'

/** Which slice of parts the list below the tiles shows. */
type Slice = 'pending' | 'released' | 'awaiting' | 'acknowledged' | 'returned'

const SLICE_STATES: Record<Slice, ReleaseState[]> = {
  pending: ['Pending'],
  released: ['Released', 'Acknowledged'],
  awaiting: ['Released'],
  acknowledged: ['Acknowledged'],
  returned: ['Returned']
}

const STATE_PILL: Record<ReleaseState, { label: string; cls: string }> = {
  Pending: { label: 'Not released', cls: 'bg-amber-100 text-amber-800' },
  Released: { label: 'Awaiting acknowledgement', cls: 'bg-blue-100 text-blue-800' },
  Acknowledged: { label: 'Acknowledged', cls: 'bg-emerald-100 text-emerald-800' },
  Returned: { label: 'Returned', cls: 'bg-red-100 text-red-800' }
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
      <span className="mt-1 text-[28px] font-bold leading-[32px]" style={{ color: props.color }}>
        {props.count}
      </span>
      <span className="text-[10px] text-[var(--color-muted)]">{props.sub}</span>
    </button>
  )
}

/**
 * Release handshake summary on My Work.
 * PIC / SIC / DPM: how many parts are released to the vendor, pending release and returned by the vendor; the PIC can
 * release several parts together. Vendor: the parts released to it, to acknowledge or return together.
 */
export function ReleasePanel() {
  const { parts, partReleases, partAcks, picAssignments, releasePart, acknowledgeParts, returnParts } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const isVendor = currentPersona === 'Vendor'
  const canReleaseParts = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  const rows = useMemo(
    () =>
      parts
        .filter((p) => !p.supersededBy && partInScope(p, currentPersona))
        .map((p) => ({ part: p, state: getReleaseState(p.partNo, partReleases, partAcks) }))
        // The vendor never sees parts the PIC has not released.
        .filter((r) => !isVendor || r.state !== 'Pending'),
    [parts, partReleases, partAcks, currentPersona, isVendor]
  )
  const n = (states: ReleaseState[]) => rows.filter((r) => states.includes(r.state)).length
  const counts = {
    pending: n(['Pending']),
    released: n(['Released', 'Acknowledged']),
    awaiting: n(['Released']),
    acknowledged: n(['Acknowledged']),
    returned: n(['Returned'])
  }

  const [slice, setSlice] = useState<Slice>(isVendor ? 'awaiting' : 'pending')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [returnOpen, setReturnOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')

  const shown = rows.filter((r) => SLICE_STATES[slice].includes(r.state))
  const pickable = (state: ReleaseState) => (isVendor ? state === 'Released' : canReleaseParts && (state === 'Pending' || state === 'Returned'))
  const pickedHere = shown.filter((r) => picked.has(r.part.partNo) && pickable(r.state)).map((r) => r.part.partNo)
  const allPickable = shown.filter((r) => pickable(r.state)).map((r) => r.part.partNo)
  const allPicked = allPickable.length > 0 && allPickable.every((no) => picked.has(no))

  const choose = (s: Slice) => {
    setSlice(s)
    setPicked(new Set())
    setNotice('')
  }
  const toggle = (no: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(no)) next.delete(no)
      else next.add(no)
      return next
    })

  const picName = (p: PartRecord) => (currentPersona === 'PIC' ? getPicOn(p, picAssignments, DEMO_TODAY).name || undefined : undefined)
  const doRelease = () => {
    for (const no of pickedHere) {
      const part = parts.find((p) => p.partNo === no)
      if (part) releasePart({ partNo: no, released: true, by: currentPersona, actorName: picName(part) })
    }
    setNotice(`${pickedHere.length} part${pickedHere.length === 1 ? '' : 's'} released to the vendor.`)
    setPicked(new Set())
  }
  const doAcknowledge = () => {
    acknowledgeParts({ partNos: pickedHere, by: currentPersona, actorName: FIXED_VENDOR_NAME })
    setNotice(`${pickedHere.length} part${pickedHere.length === 1 ? '' : 's'} acknowledged. You can now work on them.`)
    setPicked(new Set())
  }
  const doReturn = () => {
    returnParts({ partNos: pickedHere, by: currentPersona, actorName: FIXED_VENDOR_NAME, reason })
    setNotice(`${pickedHere.length} part${pickedHere.length === 1 ? '' : 's'} returned to the PIC.`)
    setPicked(new Set())
    setReason('')
    setReturnOpen(false)
  }

  if (!isVendor && !canReleaseParts) return null

  return (
    <section className="mb-4" aria-label="Part release status">
      <div className="mb-2 flex items-baseline justify-between gap-3 max-sm:flex-col max-sm:gap-1">
        <h2 className="text-[13px] font-semibold whitespace-nowrap text-[var(--color-text)]">{isVendor ? 'Parts released to you' : 'Release to vendor'}</h2>
        <span className="text-[11px] text-[var(--color-muted)]">
          {isVendor
            ? 'Acknowledge a part to start work on it, or return it to the PIC with a reason.'
            : 'Parts released to the vendor, waiting to be released, and returned by the vendor.'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isVendor ? (
          <>
            <Tile title="Awaiting my acknowledgement" count={counts.awaiting} sub="released by the PIC, not yet answered" color="#2563eb" active={slice === 'awaiting'} onClick={() => choose('awaiting')} />
            <Tile title="Acknowledged" count={counts.acknowledged} sub="accepted, ready to work on" color="#16a34a" active={slice === 'acknowledged'} onClick={() => choose('acknowledged')} />
            <Tile title="Returned by me" count={counts.returned} sub="sent back to the PIC" color="#dc2626" active={slice === 'returned'} onClick={() => choose('returned')} />
          </>
        ) : (
          <>
            <Tile title="Released to vendor" count={counts.released} sub={`${counts.awaiting} awaiting acknowledgement · ${counts.acknowledged} acknowledged`} color="#2563eb" active={slice === 'released'} onClick={() => choose('released')} />
            <Tile title="Pending release" count={counts.pending} sub="not yet released to the vendor" color="#d97706" active={slice === 'pending'} onClick={() => choose('pending')} />
            <Tile title="Returned by vendor" count={counts.returned} sub="back with the PIC to fix and release again" color="#dc2626" active={slice === 'returned'} onClick={() => choose('returned')} />
          </>
        )}
      </div>

      <div className="epmp-card mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
          <span className="text-[12px] font-medium text-[var(--color-text)]">
            {shown.length} part{shown.length === 1 ? '' : 's'}
          </span>
          {notice && <span className="text-[11px] text-emerald-700" role="status">{notice}</span>}
          <div className="ml-auto flex items-center gap-2">
            {isVendor && (
              <>
                <Button variant="secondary" size="sm" disabled={pickedHere.length === 0} onClick={() => { setReason(''); setReturnOpen(true) }}>
                  Return selected ({pickedHere.length})
                </Button>
                <Button variant="primary" size="sm" disabled={pickedHere.length === 0} onClick={doAcknowledge}>
                  Acknowledge selected ({pickedHere.length})
                </Button>
              </>
            )}
            {!isVendor && canReleaseParts && (
              <Button variant="primary" size="sm" disabled={pickedHere.length === 0} onClick={doRelease}>
                Release selected ({pickedHere.length})
              </Button>
            )}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-5 text-center text-[12px] text-[var(--color-muted)]">No parts here.</p>
        ) : (
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[var(--color-surface)]">
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                  <th className="w-8 px-3 py-2">
                    {allPickable.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allPicked}
                        onChange={() => setPicked(allPicked ? new Set() : new Set(allPickable))}
                      />
                    )}
                  </th>
                  <th className="px-3 py-2 font-medium">Part</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ part, state }) => {
                  const ret = state === 'Returned' ? latestReturn(part.partNo, partAcks) : undefined
                  const rel = partReleases
                    .filter((r) => r.partNo === part.partNo)
                    .reduce<typeof partReleases[number] | undefined>((b, r) => (!b || r.at > b.at ? r : b), undefined)
                  return (
                    <tr key={part.partNo} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2">
                        {pickable(state) && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${part.partNo}`}
                            checked={picked.has(part.partNo)}
                            onChange={() => toggle(part.partNo)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#101828]">{part.partName}</div>
                        <div className="font-mono text-[10.5px] text-[var(--color-muted)]">{part.partNo}</div>
                      </td>
                      <td className="px-3 py-2">{part.model}</td>
                      <td className="px-3 py-2">{part.vendorName}</td>
                      <td className="px-3 py-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_PILL[state].cls}`}>{STATE_PILL[state].label}</span>
                      </td>
                      <td className="max-w-[360px] px-3 py-2 text-[11px] text-[var(--color-muted)]">
                        {state === 'Returned' && ret
                          ? `Returned ${fmtDate(ret.at.slice(0, 10))}: “${ret.reason}”`
                          : state === 'Pending'
                            ? 'Not released yet'
                            : rel
                              ? `Released ${fmtDate(rel.at.slice(0, 10))} by ${rel.by}`
                              : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title={`Return ${pickedHere.length} part${pickedHere.length === 1 ? '' : 's'} to the PIC`}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={doReturn} disabled={!reason.trim()}>
              Return
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="text-xs text-[var(--color-muted)]">
            The PIC sees your reason, fixes the part details and releases the part again. You cannot work on a returned part until then.
          </p>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason (required)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2.5 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
              placeholder="e.g. Vendor code is wrong for this part"
            />
          </label>
        </div>
      </Modal>
    </section>
  )
}
