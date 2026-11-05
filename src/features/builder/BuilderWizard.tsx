import { Icon as FbIcon } from '../../components/Icon'
/**
 * BuilderWizard
 *
 * 4-step wizard: Basics → Fields → Flow → Review
 * Left side: step content   Right side: live preview panel
 *
 * URL params:
 *   /builder/new       — create new activity
 *   /builder/:id       — edit existing published activity (creates a draft copy)
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQAStore } from '../../store/qaStore'
import type { BuilderDraft } from '../../domain'
import { Button } from '../../components'
import { LivePreviewPanel } from '../../components/LivePreviewPanel'
import { BasicsStep } from './steps/BasicsStep'
import { FieldsStep } from './steps/FieldsStep'
import { FlowStep } from './steps/FlowStep'
import { TimelineStep } from './steps/TimelineStep'
import { ReviewStep, validateDraft } from './steps/ReviewStep'

type StepId = 'basics' | 'fields' | 'flow' | 'timeline' | 'review'

interface WizardStep {
  id: StepId
  label: string
  number: number
}

const STEPS: WizardStep[] = [
  { id: 'basics', label: 'Basics', number: 1 },
  { id: 'fields', label: 'Fields', number: 2 },
  { id: 'flow', label: 'Flow', number: 3 },
  { id: 'timeline', label: 'Timeline', number: 4 },
  { id: 'review', label: 'Review', number: 5 },
]

function emptyDraft(id: string, sourceId: string | null): BuilderDraft {
  return {
    id,
    sourceId,
    name: '',
    scope: 'Both',
    ownerPersona: 'PIC',
    description: '',
    fields: [],
    flow: { steps: [] },
    published: false,
  }
}

export function BuilderWizard() {
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activities, drafts, saveDraft, publishDraft } = useQAStore()

  const [currentStep, setCurrentStep] = useState<StepId>('basics')
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)

  // Determine if editing an existing activity
  const isNew = routeId === 'new'
  const sourceActivity = isNew ? null : activities.find((a) => a.id === routeId) ?? null

  // Draft id: stable for the editing session
  const draftId = isNew ? `draft-new` : `draft-edit-${routeId}`

  // Load draft from store or initialize
  const existingDraft = drafts.find((d) => d.id === draftId)
  const [draft, setDraftLocal] = useState<BuilderDraft>(() => {
    if (existingDraft) return existingDraft
    if (sourceActivity) {
      return { ...sourceActivity, id: draftId, sourceId: sourceActivity.id, published: false }
    }
    return emptyDraft(draftId, null)
  })

  // Keep local state in sync when the store draft changes from outside
  useEffect(() => {
    if (existingDraft && existingDraft !== draft) {
      // only sync on initial mount — local state is authoritative during editing
    }
  }, [])

  // Auto-save draft to store on every change
  function updateDraft(updates: Partial<BuilderDraft>) {
    const next = { ...draft, ...updates }
    setDraftLocal(next)
    saveDraft(next)
  }

  function handlePublish() {
    setPublishing(true)
    // Simulate a brief async delay for UX
    setTimeout(() => {
      publishDraft(draftId)
      setPublishing(false)
      setPublished(true)
      setTimeout(() => navigate('/activities'), 1500)
    }, 600)
  }

  const stepIdx = STEPS.findIndex((s) => s.id === currentStep)

  function goNext() {
    if (stepIdx < STEPS.length - 1) setCurrentStep(STEPS[stepIdx + 1].id)
  }

  function goBack() {
    if (stepIdx > 0) setCurrentStep(STEPS[stepIdx - 1].id)
  }

  const validationMessages = validateDraft(draft)
  const hasErrors = validationMessages.some((m) => m.severity === 'error')

  if (sourceActivity?.retired) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="mb-2 text-xl font-semibold text-[var(--color-text)]">This activity is no longer available</h2>
        <p className="mb-4 max-w-md text-sm text-[var(--color-muted)]">
          It was deleted. Its existing template rows, entries and dashboards keep working, but it cannot be edited or used for anything new.
        </p>
        <Button variant="secondary" onClick={() => navigate('/activities')}>
          Back to Activities
        </Button>
      </div>
    )
  }

  if (published) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 text-[#059669]"><FbIcon name="check-circle" size={40} /></div>
        <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">Activity Published!</h2>
        <p className="text-sm text-[var(--color-muted)]">Redirecting to Activities…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0" data-tour="builder-wizard">
      {/* Wizard header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <button
            onClick={() => navigate('/activities')}
            className="text-[11px] text-[#596579] hover:underline flex items-center gap-1 mb-1"
          >
            ← Back to Activities
          </button>
          <h2 className="m-0 text-[23px] font-semibold leading-8 tracking-[-0.3px] text-[var(--color-text)]">
            {isNew ? 'New Activity' : `Edit: ${sourceActivity?.name ?? 'Activity'}`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 rounded">
            Auto-saved
          </span>
        </div>
      </div>

      {/* Step tabs */}
      <div className="epmp-card flex flex-wrap items-center gap-1 mb-5 p-1.5 flex-shrink-0">
        {STEPS.map((step, i) => {
          const isActive = step.id === currentStep
          const isDone = STEPS.findIndex((s) => s.id === currentStep) > i
          return (
            <button
              key={step.id}
              onClick={() => setCurrentStep(step.id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus:outline-none ${
                isActive
                  ? 'border-[#bfdbfe] bg-secondary text-[var(--color-accent)]'
                  : isDone
                  ? 'border-transparent text-[#059669] hover:bg-surface'
                  : 'border-transparent text-[var(--color-muted)] hover:bg-surface hover:text-[var(--color-text)]'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  isActive
                    ? 'bg-[var(--color-accent)] text-white'
                    : isDone
                    ? 'bg-ryg-green text-white'
                    : 'bg-[var(--color-border)] text-[var(--color-muted)]'
                }`}
              >
                {isDone ? <FbIcon name="check" size={14} /> : step.number}
              </span>
              {step.label}
            </button>
          )
        })}
      </div>

      {/* Main content: step + preview */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Step content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="pb-8">
            {currentStep === 'basics' && (
              <BasicsStep draft={draft} onChange={updateDraft} />
            )}
            {currentStep === 'fields' && (
              <FieldsStep draft={draft} onChange={updateDraft} />
            )}
            {currentStep === 'flow' && (
              <FlowStep draft={draft} onChange={updateDraft} />
            )}
            {currentStep === 'timeline' && (
              <TimelineStep draft={draft} onChange={updateDraft} />
            )}
            {currentStep === 'review' && (
              <ReviewStep draft={draft} onPublish={handlePublish} publishing={publishing} />
            )}
          </div>
        </div>

        {/* Live preview panel */}
        <div className="w-72 flex-shrink-0 h-full min-h-0 sticky top-0">
          <LivePreviewPanel draft={draft} />
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-[var(--color-border)] flex-shrink-0">
        <Button
          variant="secondary"
          size="md"
          onClick={goBack}
          disabled={stepIdx === 0}
        >
          ← Previous
        </Button>
        <div className="flex items-center gap-3">
          {hasErrors && currentStep === 'review' && (
            <span className="text-xs text-destructive">
              {validationMessages.filter((m) => m.severity === 'error').length} error(s) must be fixed
            </span>
          )}
          {currentStep !== 'review' ? (
            <Button variant="primary" size="md" onClick={goNext}>
              Next: {STEPS[stepIdx + 1]?.label} →
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={handlePublish}
              disabled={hasErrors || publishing}
            >
              {publishing ? 'Publishing…' : 'Publish Activity'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
