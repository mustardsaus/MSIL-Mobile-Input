import { Icon as FbIcon } from '../../../components/Icon'
/**
 * Step 4: Review & Publish
 *
 * Summary of the draft definition, validation messages, and a Publish button.
 * Validation rules:
 * - Name must not be empty
 * - At least one field
 * - No field with empty label
 * - Fetched fields must have a fetchedAttributeKey
 * - At least one flow step
 * - No flow step with empty label
 */

import type { BuilderDraft } from '../../../domain'
import { canBeListColumn } from '../../listColumns'

import { PERSONAS } from '../../../store/personaStore'

interface ReviewStepProps {
  draft: BuilderDraft
  onPublish: () => void
  publishing: boolean
}

export interface ValidationMessage {
  severity: 'error' | 'warning'
  message: string
}

export function validateDraft(draft: BuilderDraft): ValidationMessage[] {
  const msgs: ValidationMessage[] = []

  if (!draft.name.trim()) {
    msgs.push({ severity: 'error', message: 'Activity name is required.' })
  }
  if (draft.fields.length === 0) {
    msgs.push({ severity: 'warning', message: 'No activity fields defined. The workspace form will be empty.' })
  }
  for (const field of draft.fields) {
    if (!field.label.trim()) {
      msgs.push({ severity: 'error', message: `A field (key: ${field.key}) has an empty label.` })
    }
    const FETCHED = ['enovia', 'sap', 'edoc', 'regapp']
    if (FETCHED.includes(field.source) && !(field as any).fetchedAttributeKey) {
      msgs.push({
        severity: 'error',
        message: `Field "${field.label || field.key}" has a fetched source (${field.source}) but no attribute is selected from the catalogue.`,
      })
    }
  }
  if (draft.flow.steps.length === 0) {
    msgs.push({ severity: 'error', message: 'No approval flow steps defined.' })
  }
  for (const step of draft.flow.steps) {
    if (!step.label.trim()) {
      msgs.push({ severity: 'warning', message: `Flow step ${step.stepIndex + 1} has no label.` })
    }
    if (step.allowedOutcomes.length === 0) {
      msgs.push({ severity: 'error', message: `Flow step "${step.label || step.stepIndex + 1}" has no allowed outcomes.` })
    }
  }
  const dashboardFields = draft.fields.filter((f) => f.showOnDashboard && !f.kpiRole)
  if (dashboardFields.length > 0) {
    msgs.push({
      severity: 'warning',
      message: `${dashboardFields.length} dashboard field(s) have no KPI role assigned (e.g. "${dashboardFields[0].label}"). They will appear as plain values.`,
    })
  }

  return msgs
}

export function ReviewStep({ draft, onPublish, publishing }: ReviewStepProps) {
  const messages = validateDraft(draft)
  const errors = messages.filter((m) => m.severity === 'error')
  const warnings = messages.filter((m) => m.severity === 'warning')
  const canPublish = errors.length === 0

  const ownerMeta = PERSONAS.find((p) => p.id === draft.ownerPersona)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Summary */}
      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="bg-[var(--color-surface)] px-4 py-2.5 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-text)]">Definition Summary</span>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <SummaryRow label="Name" value={draft.name || <span className="text-destructive">— not set —</span>} />
          <SummaryRow
            label="Scope"
            value={draft.scope === 'Both' ? 'New Part + ECN' : draft.scope === 'NewPart' ? 'New Part' : 'ECN'}
          />
          <SummaryRow
            label="Planned Dates"
            value={<span className="text-[var(--color-muted)] italic">Set by Department Co-ordinators as MRD offsets</span>}
          />
          <SummaryRow
            label="Part applicability"
            value={
              draft.allowNotApplicable
                ? 'PIC may mark individual parts Not applicable'
                : <span className="text-[var(--color-muted)]">Applies to every part in the section</span>
            }
          />
          <SummaryRow
            label="Owner"
            value={
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: ownerMeta?.hex ?? '#9ca3af' }} />
                {ownerMeta?.label ?? draft.ownerPersona}
              </span>
            }
          />
          {draft.description && (
            <SummaryRow label="Description" value={draft.description} />
          )}

          {/* Fields summary */}
          <div className="border-t border-[var(--color-border)] pt-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-[var(--color-text)]">Fields ({draft.fields.length})</span>
              <span className="text-xs text-[var(--color-muted)]">
                {draft.fields.filter((f) => f.showOnDashboard).length} on dashboard
                {' · '}
                {draft.fields.filter((f) => canBeListColumn(f) && f.showInPartList).length} in part list
                {' · '}
                {draft.fields.filter((f) => canBeListColumn(f) && f.showInDrillList).length} in drill-down list
                {' · '}
                {draft.fields.filter((f) => f.mandatory).length} mandatory
              </span>
            </div>
            {draft.fields.length === 0 ? (
              <span className="text-xs text-[var(--color-muted)]">No fields defined.</span>
            ) : (
              <div className="space-y-1">
                {draft.fields.map((f, i) => (
                  <div key={f.key} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                    <span className="w-4 text-right">{i + 1}.</span>
                    <span className="text-[var(--color-text)] font-medium">{f.label || <em>unlabelled</em>}</span>
                    <span className="text-[var(--color-muted)]">· {f.type}</span>
                    <span className="text-[var(--color-muted)]">· {f.source}</span>
                    {f.mandatory && <span className="text-destructive">required</span>}
                    {f.showOnDashboard && (
                      <span className="text-primary">dashboard{f.kpiRole ? ` (${f.kpiRole})` : ''}</span>
                    )}
                    {canBeListColumn(f) && f.showInPartList && <span className="text-primary">part list</span>}
                    {canBeListColumn(f) && f.showInDrillList && <span className="text-primary">drill-down</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Flow summary */}
          <div className="border-t border-[var(--color-border)] pt-3 mt-3">
            <div className="font-medium text-[var(--color-text)] mb-2">
              Approval Flow ({draft.flow.steps.length} step{draft.flow.steps.length !== 1 ? 's' : ''})
            </div>
            {draft.flow.steps.length === 0 ? (
              <span className="text-xs text-destructive">No steps defined.</span>
            ) : (
              <div className="flex items-center flex-wrap gap-1.5">
                {draft.flow.steps.map((step, i) => {
                  const p = PERSONAS.find((x) => x.id === step.role)
                  return (
                    <span key={i} className="flex items-center gap-1">
                      <span
                        className="px-2 py-0.5 rounded text-xs text-white"
                        style={{ backgroundColor: p?.hex ?? '#6b7280' }}
                      >
                        {step.label || p?.label || step.role}
                      </span>
                      {i < draft.flow.steps.length - 1 && (
                        <span className="text-[var(--color-muted)] text-xs">→</span>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Validation messages */}
      {messages.length > 0 && (
        <div className="space-y-2">
          {errors.map((m, i) => (
            <div key={i} className="flex items-start gap-2 bg-[#fef2f2] border border-[#fecaca] rounded p-3 text-sm text-destructive">
              <span className="text-destructive flex-shrink-0 font-bold"><FbIcon name="close-circle" size={16} /></span>
              <span>{m.message}</span>
            </div>
          ))}
          {warnings.map((m, i) => (
            <div key={i} className="flex items-start gap-2 bg-[#fffbeb] border border-[#fde68a] rounded p-3 text-sm text-[#92400e]">
              <span className="text-ryg-yellow flex-shrink-0 font-bold"><FbIcon name="exclamation-circle" size={16} /></span>
              <span>{m.message}</span>
            </div>
          ))}
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex items-center gap-2 bg-[#ecfdf5] border border-[#a7f3d0] rounded p-3 text-sm text-[#047857]">
          <span className="text-[#059669] font-bold"><FbIcon name="check-circle" size={16} /></span>
          <span>All checks passed. Ready to publish.</span>
        </div>
      )}

      {/* Publish CTA */}
      <div className="flex items-center gap-3">
        <button
          onClick={onPublish}
          disabled={!canPublish || publishing}
          className="px-5 py-2.5 bg-[var(--color-accent)] text-white rounded font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {publishing ? 'Publishing…' : 'Publish Activity'}
        </button>
        {!canPublish && (
          <span className="text-sm text-destructive">
            Fix {errors.length} error{errors.length !== 1 ? 's' : ''} before publishing.
          </span>
        )}
      </div>

      <div className="text-xs text-[var(--color-muted)]">
        Publishing makes this activity available for Department Co-ordinators to include in their templates.
        Unpublished drafts are saved automatically and only visible in the Builder.
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 flex-shrink-0 text-[var(--color-muted)]">{label}</span>
      <span className="text-[var(--color-text)]">{value}</span>
    </div>
  )
}
