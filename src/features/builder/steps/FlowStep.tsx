import { Icon as FbIcon } from '../../../components/Icon'
/**
 * Step 3: Flow Designer
 *
 * Simple visual flow of approval steps with:
 * - Actor persona + allowed outcomes (Approve / Edit / Send back / Submit)
 * - Three templates: "Vendor → PIC validation", "PIC only", "System only"
 * - Add / remove / reorder steps
 */

import type { BuilderDraft, ApprovalStep, ApprovalFlow } from '../../../domain'
import { PERSONAS } from '../../../store/personaStore'
import type { PersonaId } from '../../../store/personaStore'
import { Button } from '../../../components'

interface FlowStepProps {
  draft: BuilderDraft
  onChange: (updates: Partial<BuilderDraft>) => void
}

type Outcome = 'Submit' | 'Approve' | 'Edit' | 'Send back'

const ALL_OUTCOMES: Outcome[] = ['Submit', 'Approve', 'Edit', 'Send back']

const OUTCOME_COLORS: Record<Outcome, string> = {
  Submit: '#3b82d4',
  Approve: '#10b981',
  Edit: '#f97316',
  'Send back': '#ef4444',
}

// ── Templates ─────────────────────────────────────────────────────────────────

type Template = { id: string; label: string; description: string; flow: ApprovalFlow }

const TEMPLATES: Template[] = [
  {
    id: 'vendor-pic',
    label: 'Vendor → PIC Validation',
    description: 'Vendor submits data; PIC can approve, request edit, or send back to vendor.',
    flow: {
      steps: [
        {
          stepIndex: 0,
          role: 'Vendor',
          label: 'Vendor submits',
          allowedOutcomes: ['Submit'],
        },
        {
          stepIndex: 1,
          role: 'PIC',
          label: 'PIC validates',
          allowedOutcomes: ['Approve', 'Edit', 'Send back'],
        },
      ],
    },
  },
  {
    id: 'pic-only',
    label: 'PIC Only',
    description: 'PIC enters and approves all fields directly — no vendor step.',
    flow: {
      steps: [
        {
          stepIndex: 0,
          role: 'PIC',
          label: 'PIC enters and confirms',
          allowedOutcomes: ['Submit', 'Approve'],
        },
      ],
    },
  },
  {
    id: 'system-only',
    label: 'System Only',
    description: 'All fields are fetched or calculated automatically — no manual input required.',
    flow: {
      steps: [
        {
          stepIndex: 0,
          role: 'Admin',
          label: 'System auto-populates',
          allowedOutcomes: ['Approve'],
        },
      ],
    },
  },
]

function newStep(idx: number): ApprovalStep {
  return {
    stepIndex: idx,
    role: 'PIC',
    label: `Step ${idx + 1}`,
    allowedOutcomes: ['Submit'],
  }
}

export function FlowStep({ draft, onChange }: FlowStepProps) {
  const steps = draft.flow.steps

  function setSteps(next: ApprovalStep[]) {
    const reindexed = next.map((s, i) => ({ ...s, stepIndex: i }))
    onChange({ flow: { steps: reindexed } })
  }

  function applyTemplate(template: Template) {
    onChange({ flow: template.flow })
  }

  function addStep() {
    setSteps([...steps, newStep(steps.length)])
  }

  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx))
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...steps]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setSteps(next)
  }

  function moveDown(idx: number) {
    if (idx === steps.length - 1) return
    const next = [...steps]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setSteps(next)
  }

  function updateStep(idx: number, updates: Partial<ApprovalStep>) {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, ...updates } : s)))
  }

  function toggleOutcome(idx: number, outcome: Outcome) {
    const step = steps[idx]
    const has = step.allowedOutcomes.includes(outcome)
    const next = has
      ? step.allowedOutcomes.filter((o) => o !== outcome)
      : [...step.allowedOutcomes, outcome]
    // always keep at least one outcome
    if (next.length === 0) return
    updateStep(idx, { allowedOutcomes: next })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Templates */}
      <div>
        <div className="text-sm font-semibold text-[var(--color-text)] mb-2">Quick-start templates</div>
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => applyTemplate(tmpl)}
              className="text-left border border-[var(--color-border)] rounded p-3 hover:border-[var(--color-accent)] hover:bg-secondary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              <div className="text-sm font-medium text-[var(--color-text)] mb-1">{tmpl.label}</div>
              <div className="text-xs text-[var(--color-muted)] leading-relaxed">{tmpl.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-[var(--color-border)]" />
        <span className="text-xs text-[var(--color-muted)]">or build manually</span>
        <div className="flex-1 border-t border-[var(--color-border)]" />
      </div>

      {/* Visual flow */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-[var(--color-text)]">Approval Steps ({steps.length})</div>
          <Button variant="secondary" size="sm" onClick={addStep}>+ Add Step</Button>
        </div>

        {steps.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[var(--color-border)] rounded text-sm text-[var(--color-muted)]">
            No steps yet. Apply a template or click "+ Add Step".
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step, idx) => {
              const personaMeta = PERSONAS.find((p) => p.id === step.role)
              return (
                <div key={idx} className="flex items-start gap-3">
                  {/* Connector line */}
                  <div className="flex flex-col items-center flex-shrink-0 pt-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: personaMeta?.hex ?? '#6b7280' }}
                    >
                      {idx + 1}
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="w-0.5 h-6 bg-[var(--color-border)] mt-1" />
                    )}
                  </div>

                  {/* Step card */}
                  <div className="flex-1 border border-[var(--color-border)] rounded p-3 bg-white">
                    <div className="flex items-start gap-3">
                      {/* Step label */}
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium text-[var(--color-muted)] block mb-0.5">Step Label</label>
                            <input
                              type="text"
                              value={step.label}
                              onChange={(e) => updateStep(idx, { label: e.target.value })}
                              className="border border-[var(--color-border)] rounded px-2 py-1 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] w-full"
                              placeholder={`Step ${idx + 1}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-[var(--color-muted)] block mb-0.5">Actor (Persona)</label>
                            <select
                              value={step.role}
                              onChange={(e) => updateStep(idx, { role: e.target.value as PersonaId })}
                              className="border border-[var(--color-border)] rounded px-2 py-1 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] w-full"
                            >
                              {PERSONAS.map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Outcomes */}
                        <div>
                          <label className="text-xs font-medium text-[var(--color-muted)] block mb-1">Allowed Outcomes</label>
                          <div className="flex flex-wrap gap-1.5">
                            {ALL_OUTCOMES.map((outcome) => {
                              const active = step.allowedOutcomes.includes(outcome)
                              return (
                                <button
                                  key={outcome}
                                  type="button"
                                  onClick={() => toggleOutcome(idx, outcome)}
                                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${active ? 'text-white border-transparent' : 'bg-white text-[var(--color-muted)] border-[var(--color-border)] hover:border-[var(--color-accent)]'}`}
                                  style={active ? { backgroundColor: OUTCOME_COLORS[outcome], borderColor: OUTCOME_COLORS[outcome] } : {}}
                                >
                                  {outcome}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Step actions */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 px-1"
                          title="Move up"
                        ><FbIcon name="chevron-up" size={14} /></button>
                        <button
                          onClick={() => moveDown(idx)}
                          disabled={idx === steps.length - 1}
                          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 px-1"
                          title="Move down"
                        ><FbIcon name="chevron-down" size={14} /></button>
                        <button
                          onClick={() => removeStep(idx)}
                          className="text-xs text-destructive hover:text-destructive px-1"
                          title="Remove step"
                        ><FbIcon name="close" size={14} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="border-t border-[var(--color-border)] pt-4">
        <div className="text-xs font-medium text-[var(--color-muted)] mb-2">Outcome legend</div>
        <div className="flex flex-wrap gap-3">
          {ALL_OUTCOMES.map((o) => (
            <span key={o} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: OUTCOME_COLORS[o] }} />
              <strong style={{ color: OUTCOME_COLORS[o] }}>{o}</strong>
              {o === 'Submit' && '— move to next step'}
              {o === 'Approve' && '— mark as approved'}
              {o === 'Edit' && '— PIC corrects in-place'}
              {o === 'Send back' && '— vendor re-enters'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
