import { Icon as FbIcon } from '../../../components/Icon'
import type { BuilderDraft, TechnicalCategory, MrdSubType, TimelineTemplateEntry, TimelineOffset } from '../../../domain'
import {
  TECHNICAL_CATEGORIES,
  SUBTYPE_LABEL,
  TIMELINE_MILESTONES,
  subTypesFor
} from '../../../domain/timelineCatalog'

interface Props {
  draft: BuilderDraft
  onChange: (updates: Partial<BuilderDraft>) => void
}

export function TimelineStep({ draft, onChange }: Props) {
  const template = draft.timelineTemplate ?? []
  const selected = new Set(template.map((t) => t.category))

  function toggleCategory(cat: TechnicalCategory) {
    if (selected.has(cat)) {
      onChange({ timelineTemplate: template.filter((t) => t.category !== cat) })
    } else {
      onChange({ timelineTemplate: [...template, { category: cat, offsets: [] }] })
    }
  }

  function getOffset(cat: TechnicalCategory, milestoneId: string, subType: MrdSubType): TimelineOffset | undefined {
    const entry = template.find((t) => t.category === cat)
    return entry?.offsets.find((o) => o.milestoneId === milestoneId && o.subType === subType)
  }

  /** Update one sub-type's start (MRD−X) and end (MRD−Y) offset. Both blank removes the offset entirely. */
  function setOffset(cat: TechnicalCategory, milestoneId: string, subType: MrdSubType, patch: { minusDays?: number | undefined; endMinusDays?: number | undefined }) {
    onChange({
      timelineTemplate: template.map((t) => {
        if (t.category !== cat) return t
        const existing = t.offsets.find((o) => o.milestoneId === milestoneId && o.subType === subType)
        const others = t.offsets.filter((o) => !(o.milestoneId === milestoneId && o.subType === subType))
        const startX = 'minusDays' in patch ? patch.minusDays : existing?.minusDays
        const endX = 'endMinusDays' in patch ? patch.endMinusDays : existing?.endMinusDays
        // Remove the offset when the start is cleared (start is the required anchor).
        if (startX === undefined || Number.isNaN(startX)) return { ...t, offsets: others } as TimelineTemplateEntry
        const next: TimelineOffset[] = [...others, { milestoneId, subType, minusDays: startX, ...(endX !== undefined && !Number.isNaN(endX) ? { endMinusDays: endX } : {}) }]
        return { ...t, offsets: next } as TimelineTemplateEntry
      })
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="m-0 text-lg font-semibold text-[var(--color-text)]">Timeline template</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Choose the technical categories this activity applies to, then set the start and end “MRD − X” day offsets
          for each milestone sub-type. A part's technical category picks the row used, and its planned dates are
          computed from that sub-type's MRD on the model. Kani and Jig apply only to the Weld category.
        </p>
      </div>

      {/* Technical category picker */}
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Technical categories
        </span>
        <div className="flex flex-wrap gap-2">
          {TECHNICAL_CATEGORIES.map((c) => {
            const on = selected.has(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  on
                    ? 'border-[#bfdbfe] bg-secondary text-primary'
                    : 'border-[var(--color-border)] bg-white text-[#344054] hover:border-[#bfdbfe]'
                }`}
              >
                {on ? <FbIcon name="check" size={12} className="mr-1" /> : null}{c.label}
              </button>
            )
          })}
        </div>
      </div>

      {selected.size === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-xs text-[var(--color-muted)]">
          Select one or more technical categories to set their MRD − X offsets.
        </p>
      ) : (
        template.map((entry) => (
          <div key={entry.category} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h3 className="m-0 mb-3 text-[13px] font-semibold text-[#101828]">
              {TECHNICAL_CATEGORIES.find((c) => c.id === entry.category)?.label} — MRD − X offsets
            </h3>
            <div className="space-y-4">
              {TIMELINE_MILESTONES.map((ms) => {
                const subs = subTypesFor(ms, entry.category)
                if (subs.length === 0) return null
                return (
                  <div key={ms}>
                    <div className="mb-1.5 text-[11px] font-semibold text-primary">{ms}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {subs.map((st) => {
                        const off = getOffset(entry.category, ms, st)
                        const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.round(Number(v))))
                        return (
                          <div key={st} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5">
                            <div className="mb-1 truncate text-[11px] font-medium text-[#344054]" title={SUBTYPE_LABEL[st]}>{SUBTYPE_LABEL[st]}</div>
                            <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted)]">
                              <span className="flex items-center gap-1">
                                Start MRD −
                                <input
                                  type="number"
                                  min={0}
                                  value={off?.minusDays ?? ''}
                                  onChange={(e) => setOffset(entry.category, ms, st, { minusDays: num(e.target.value) })}
                                  placeholder="—"
                                  className="h-7 w-14 rounded border border-[var(--color-border)] bg-white px-1.5 text-right text-[11px] text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
                                />
                                d
                              </span>
                              <span className="flex items-center gap-1">
                                End MRD −
                                <input
                                  type="number"
                                  min={0}
                                  value={off?.endMinusDays ?? ''}
                                  disabled={off?.minusDays === undefined}
                                  onChange={(e) => setOffset(entry.category, ms, st, { endMinusDays: num(e.target.value) })}
                                  placeholder="0"
                                  className="h-7 w-14 rounded border border-[var(--color-border)] bg-white px-1.5 text-right text-[11px] text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe] disabled:opacity-50"
                                />
                                d
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
