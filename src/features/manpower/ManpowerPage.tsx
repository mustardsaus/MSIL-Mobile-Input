import { useMemo, useState } from 'react'
import { PageHeader, Card, Button, Modal, Tabs } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { buildPicLoads, visitCoverage, vendorLocation, getPicOn } from '../../engine'
import { DEMO_TODAY, fmtDate } from '../scope'
import type { VendorVisit } from '../../domain'

const inputCls = 'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054]'
const thCls = 'text-left px-4 py-3 font-medium text-[var(--color-muted)]'

export function ManpowerPage() {
  const {
    activities, entries, parts, templateRows, models, picAssignments,
    vendorInfo, vendorVisits, addVendorVisit, updateVendorVisit, deleteVendorVisit
  } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canPlan = currentPersona === 'SIC' || currentPersona === 'DPM' || currentPersona === 'Admin' || currentPersona === 'PIC'

  const [tab, setTab] = useState<'load' | 'visits'>('load')

  // ── PIC load ───────────────────────────────────────────────────────────────
  const loads = useMemo(
    () => buildPicLoads(entries, activities, parts, templateRows, models, picAssignments, DEMO_TODAY),
    [entries, activities, parts, templateRows, models, picAssignments]
  )
  const maxInstances = Math.max(1, ...loads.map((l) => l.instances))

  // Known PICs + vendors for the visit form.
  const livePartList = useMemo(() => parts.filter((p) => !p.supersededBy), [parts])
  const pics = useMemo(
    () => Array.from(new Set(livePartList.map((p) => getPicOn(p, picAssignments, DEMO_TODAY).name).filter(Boolean))).sort(),
    [livePartList, picAssignments]
  )
  const vendors = useMemo(() => Array.from(new Set(livePartList.map((p) => p.vendorName))).sort(), [livePartList])

  // ── Visit form ───────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [vPic, setVPic] = useState('')
  const [vVendor, setVVendor] = useState('')
  const [vDate, setVDate] = useState(DEMO_TODAY)
  const [vPurpose, setVPurpose] = useState('')

  const openNew = () => { setVPic(pics[0] ?? ''); setVVendor(vendors[0] ?? ''); setVDate(DEMO_TODAY); setVPurpose(''); setOpen(true) }
  const submit = () => {
    if (!vPic || !vVendor || !vDate) return
    addVendorVisit({ pic: vPic, vendorName: vVendor, date: vDate, purpose: vPurpose.trim() || undefined, status: 'Planned', createdBy: currentPersona })
    setOpen(false)
  }

  const sortedVisits = useMemo(
    () => [...vendorVisits].sort((a, b) => a.date.localeCompare(b.date) || a.pic.localeCompare(b.pic)),
    [vendorVisits]
  )

  return (
    <div>
      <PageHeader
        title="Manpower Planning"
        section="Modules"
        description="See how loaded each PIC is, and plan vendor visits. A planned visit surfaces other parts at the same vendor and other vendors in the same location, so one trip can cover more."
      />

      <Tabs
        className="mb-4"
        activeId={tab}
        onChange={(id) => setTab(id as 'load' | 'visits')}
        items={[
          { id: 'load', label: 'PIC load', badge: loads.length },
          { id: 'visits', label: 'Vendor visits', badge: vendorVisits.filter((v) => v.status === 'Planned').length }
        ]}
      />

      {tab === 'load' && (
        <Card flush className="!overflow-visible">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className={thCls}>PIC</th>
                  <th className={thCls}>Load</th>
                  <th className={thCls}>Parts</th>
                  <th className={thCls}>Vendors</th>
                  <th className={thCls}>Activities</th>
                  <th className={thCls}>Open</th>
                  <th className={thCls}>Overdue</th>
                  <th className={thCls}>To validate</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((l) => (
                  <tr key={l.pic} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[#101828]">{l.pic}</td>
                    <td className="px-4 py-3 w-48">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-[var(--color-surface)] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${l.overdue > 0 ? 'bg-[var(--color-ryg-red)]' : 'bg-[var(--color-primary)]'}`}
                            style={{ width: `${Math.round((l.instances / maxInstances) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--color-muted)]">{l.instances}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{l.parts}</td>
                    <td className="px-4 py-3">{l.vendors}</td>
                    <td className="px-4 py-3">{l.instances}</td>
                    <td className="px-4 py-3">{l.open}</td>
                    <td className={`px-4 py-3 ${l.overdue > 0 ? 'font-medium text-[var(--color-ryg-red)]' : ''}`}>{l.overdue}</td>
                    <td className="px-4 py-3">{l.toValidate}</td>
                  </tr>
                ))}
                {loads.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-muted)]">No load to show.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'visits' && (
        <>
          <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
            {canPlan ? (
              <Button variant="primary" size="md" onClick={openNew}>+ Plan a visit</Button>
            ) : (
              <span className="text-[11px] text-[var(--color-muted)]">Read-only.</span>
            )}
            <span className="text-[11px] text-[var(--color-muted)]">
              Each planned visit shows what else can be covered at that vendor and nearby.
            </span>
          </section>

          {sortedVisits.length === 0 ? (
            <Card><div className="py-10 text-center text-sm text-[var(--color-muted)]">No visits planned yet.</div></Card>
          ) : (
            <div className="space-y-4">
              {sortedVisits.map((v) => (
                <VisitCard
                  key={v.id}
                  visit={v}
                  location={vendorLocation(v.vendorName, vendorInfo)}
                  coverage={visitCoverage(v.pic, v.vendorName, parts, picAssignments, vendorInfo, DEMO_TODAY)}
                  canPlan={canPlan}
                  onStatus={(status) => updateVendorVisit(v.id, { status })}
                  onDelete={() => deleteVendorVisit(v.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Plan-visit modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Plan a vendor visit"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={submit} disabled={!vPic || !vVendor || !vDate}>Plan visit</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">PIC</span>
              <select value={vPic} onChange={(e) => setVPic(e.target.value)} className={`${inputCls} w-full`}>
                {pics.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Date</span>
              <input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} className={`${inputCls} w-full`} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Vendor</span>
            <select value={vVendor} onChange={(e) => setVVendor(e.target.value)} className={`${inputCls} w-full`}>
              {vendors.map((v) => <option key={v} value={v}>{v} — {vendorLocation(v, vendorInfo)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Purpose (optional)</span>
            <input value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} className={`${inputCls} w-full`} />
          </label>
          {vVendor && (
            <CoveragePreview pic={vPic} vendor={vVendor} />
          )}
        </div>
      </Modal>
    </div>
  )
}

/** Small inline preview of coverage inside the plan modal. */
function CoveragePreview({ pic, vendor }: { pic: string; vendor: string }) {
  const { parts, picAssignments, vendorInfo } = useQAStore()
  const cov = visitCoverage(pic, vendor, parts, picAssignments, vendorInfo, DEMO_TODAY)
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[11px] text-[#344054]">
      <div className="font-medium">While at {vendor} ({cov.location}) you could also cover:</div>
      <div className="mt-1">· {cov.sameVendorOtherParts.length} other part(s) at this vendor</div>
      <div>· {cov.sameLocationOtherVendors.length} other vendor(s) in {cov.location}</div>
    </div>
  )
}

function VisitCard({
  visit, location, coverage, canPlan, onStatus, onDelete
}: {
  visit: VendorVisit
  location: string
  coverage: ReturnType<typeof visitCoverage>
  canPlan: boolean
  onStatus: (s: 'Planned' | 'Done' | 'Cancelled') => void
  onDelete: () => void
}) {
  const statusTone =
    visit.status === 'Done' ? 'bg-emerald-100 text-emerald-800'
    : visit.status === 'Cancelled' ? 'bg-slate-100 text-slate-500'
    : 'bg-amber-100 text-amber-800'

  return (
    <section className="epmp-card px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[var(--color-text)]">{visit.vendorName}</h3>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-primary">{location}</span>
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone}`}>{visit.status}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            <strong className="text-[var(--color-text)]">{visit.pic}</strong> · {fmtDate(visit.date)}
            {visit.purpose ? ` · ${visit.purpose}` : ''}
          </p>
        </div>
        {canPlan && (
          <div className="flex gap-1.5">
            {visit.status !== 'Done' && <Button variant="secondary" size="sm" onClick={() => onStatus('Done')}>Mark done</Button>}
            {visit.status !== 'Cancelled' && <Button variant="secondary" size="sm" onClick={() => onStatus('Cancelled')}>Cancel</Button>}
            <button onClick={onDelete} className="text-[10px] text-[var(--color-destructive)] hover:underline">Delete</button>
          </div>
        )}
      </div>

      {/* Opportunistic coverage */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <div className="mb-1.5 text-[11px] font-semibold text-[var(--color-text)]">
            Other parts at {visit.vendorName} ({coverage.sameVendorOtherParts.length})
          </div>
          {coverage.sameVendorOtherParts.length === 0 ? (
            <p className="text-[11px] text-[var(--color-muted)]">No other parts here — the PIC owns everything at this vendor.</p>
          ) : (
            <ul className="space-y-1 text-[11px]">
              {coverage.sameVendorOtherParts.map(({ part, owner }) => (
                <li key={part.partNo} className="flex justify-between gap-2">
                  <span><span className="font-mono">{part.partNo}</span> · {part.partName}</span>
                  <span className="text-[var(--color-muted)]">{owner}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[10px] text-[var(--color-muted)]">These aren’t assigned to {visit.pic}; they can be asked to be taken care of during the visit.</p>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <div className="mb-1.5 text-[11px] font-semibold text-[var(--color-text)]">
            Other vendors in {location} ({coverage.sameLocationOtherVendors.length})
          </div>
          {coverage.sameLocationOtherVendors.length === 0 ? (
            <p className="text-[11px] text-[var(--color-muted)]">No other vendors in this location.</p>
          ) : (
            <ul className="space-y-1 text-[11px]">
              {coverage.sameLocationOtherVendors.map((v) => (
                <li key={v.vendorName} className="flex justify-between gap-2">
                  <span>{v.vendorName}</span>
                  <span className="text-[var(--color-muted)]">{v.parts} part{v.parts === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[10px] text-[var(--color-muted)]">Nearby vendors the PIC could also cover on the same trip.</p>
        </div>
      </div>
    </section>
  )
}
