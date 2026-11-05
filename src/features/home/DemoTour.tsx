import { Icon as FbIcon } from '../../components/Icon'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersonaStore } from '../../store/personaStore'
import { Button } from '../../components'

export interface TourStep {
  id: string
  title: string
  body: string
  /** If set, navigate to this path before showing the step */
  navigateTo?: string
  /** If set, switch to this persona before showing the step */
  persona?: string
  /** Highlight target element by CSS selector (best-effort) */
  highlight?: string
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the QA Activity Tracker',
    body:
      'Dates in this tracker are never typed per activity. A Division Model Coordinator enters milestone MRD dates, a Department Co-ordinator sets offsets from those MRDs (MRD±X days), and every part\'s planned start/end is calculated automatically. This tour follows that chain. Press Escape or "Skip tour" to exit at any time.',
  },
  {
    id: 'persona-mc',
    title: 'Step 1 — Division Model Coordinator enters MRDs',
    body:
      'Each model has up to nine milestone MRDs. PP, MPP, Pilot and SOP are mandatory; Jig, Kani, Weld, Engine and Assembly can stay blank, and any activity tied to a blank milestone shows "Awaiting MRD" with no RYG until the date is entered. The Baleno MRDs are close to or past the demo date, so some of its NP1 items show Red.',
    persona: 'ModelCoordinator',
    navigateTo: '/models',
    highlight: '[data-tour="nav-models"]',
  },
  {
    id: 'persona-admin',
    title: 'Step 2 — Admin designs the activity',
    body:
      'The Admin defines each activity\'s fields and approval flow in the Builder. There are no planned dates here — those come from the Section Template. Sections and milestone lists are configured in Settings.',
    persona: 'Admin',
    navigateTo: '/builder',
    highlight: '[data-tour="nav-builder"]',
  },
  {
    id: 'builder-wizard',
    title: 'Step 3 — Fields and flow only',
    body:
      'In the wizard you name the activity, set its owner, add fields with sources (manual, calculated, fetched from ENOVIA / SAP / E-Doc) and configure the approval flow. A live preview renders the workspace form and auto-dashboard as you type.',
    navigateTo: '/builder/pp-10',
    highlight: '[data-tour="builder-wizard"]',
  },
  {
    id: 'persona-sa',
    title: 'Step 4 — Department Co-ordinator builds the template',
    body:
      'The NP1 Department Co-ordinator picks activities, attaches each to a milestone and sets start/end offsets such as PP-23 to PP-4. The same activity can appear under several milestones. Planned dates for every NP1 part are then derived from its model\'s MRD plus these offsets.',
    persona: 'SectionAdmin',
    navigateTo: '/template',
    highlight: '[data-tour="nav-template"]',
  },
  {
    id: 'persona-pic',
    title: 'Step 5 — PIC works NP1 parts',
    body:
      'The PIC is fixed to section NP1 and sees only NP1 parts. Each row shows the calculated start/end and RYG; click a part to fill the form, then Approve, ask for an edit, or Send back.',
    persona: 'PIC',
    navigateTo: '/activities/tpl-NP1-pp-10-PP',
    highlight: '[data-tour="part-list"]',
  },
  {
    id: 'persona-pic-na',
    title: 'Step 6 — PIC marks parts Not applicable',
    body:
      'A section template applies an activity to every part, but only the PIC knows which parts it does not fit. Where the Admin has allowed it for an activity, the PIC ticks those parts here (or selects rows in the activity\'s Workspace) with an optional reason. Those parts become their own "Not applicable" group, leave the completion % and RYG, and the change is logged with the PIC\'s name. PIC, SIC and Admin can reverse it.',
    persona: 'PIC',
    navigateTo: '/applicability',
    highlight: '[data-tour="nav-applicability"]',
  },
  {
    id: 'persona-vendor',
    title: 'Step 7 — Vendor sees only their parts',
    body:
      'The Vendor is fixed to Minda Industries, so only Minda\'s parts appear in the inbox and workspace. Fetched fields (ENOVIA / SAP) show a source badge and a Refresh button.',
    persona: 'Vendor',
    navigateTo: '/activities/tpl-NP1-pp-10-PP',
    highlight: '[data-tour="part-list"]',
  },
  {
    id: 'vendor-mywork',
    title: 'Step 8 — Vendor: My Work',
    body:
      'My Work lists everything waiting for the Vendor, grouped by activity and milestone across sections, with items sent back by the PIC first. Each group shows its date range and a count per state. "Open entry grid" opens all of that activity\'s parts in one table.',
    persona: 'Vendor',
    navigateTo: '/mywork',
    highlight: '[data-tour="nav-mywork"]',
  },
  {
    id: 'vendor-grid',
    title: 'Step 9 — Vendor: update many parts at once',
    body:
      'One row per part, one column per field the Vendor enters. Type, or fill a column for the selected rows, or copy a value down. Calculated cells update as you type, and cells turn amber when another answer makes them required. Save drafts keeps partial work; "Submit all ready" sends only the complete rows to the PIC and lists what is missing on the rest. Attachments are added in the part form.',
    persona: 'Vendor',
    navigateTo: '/mywork/pp-2/PP',
    highlight: '[data-tour="grid-table"]',
  },
  {
    id: 'ai-import',
    title: 'Step 10 — Import with AI (placeholder)',
    body:
      'Where a Vendor or PIC will hand over whatever they already hold: a spreadsheet, an email, a PDF, meeting notes or a typed sentence. This prototype only shows the entry point and an illustration of the review step; no AI runs and nothing changes. In the real system, AI-filled values are flagged, must be reviewed, and are then confirmed or edited before submit. AI never approves or sends back.',
    persona: 'Vendor',
    navigateTo: '/mywork',
    highlight: '[data-tour="ai-import"]',
  },
  {
    id: 'pic-grid',
    title: 'Step 11 — PIC: the same grid for PIC fields',
    body:
      'The PIC gets the same table for the activities the PIC enters first (drawing confirmation, SMIR updation), with the PIC\'s own columns. "Download CSV" in the action bar exports the rows shown to Excel; it is one-way, so the AI import above is the only way to bring data in.',
    persona: 'PIC',
    navigateTo: '/mywork/pp-1/PP',
    highlight: '[data-tour="grid-table"]',
  },
  {
    id: 'pic-validate',
    title: 'Step 12 — PIC: validate many submissions',
    body:
      'The "To validate" tab opens a validation grid of Vendor submissions waiting for the PIC. The PIC\'s own fields (such as E-Doc number) can be typed in the row and saved. Tick rows, then "Approve selected" (rows with a required PIC field still empty are skipped and listed) or "Send back selected" (a written reason is required and goes into each row\'s history). Nothing is ticked by default.',
    persona: 'PIC',
    navigateTo: '/mywork/pp-10/PP?mode=validate',
    highlight: '[data-tour="grid-table"]',
  },
  {
    id: 'sic-dpm-validate',
    title: 'Step 13 — SIC and DPM: validate only',
    body:
      'The SIC and DPM also get My Work, but only a "To validate" list and the validation grid: no entry tabs and no AI import. They can approve or send back many rows at once, and they cannot approve a row whose required PIC fields are still empty.',
    persona: 'DPM',
    navigateTo: '/mywork',
    highlight: '[data-tour="nav-mywork"]',
  },
  {
    id: 'dashboard',
    title: 'Step 14 — Dashboard updates',
    body:
      'Dashboards are generated from the activity definitions and respect your role\'s scope. "Completion rate by Model" and "by Department" compare the same measure across models and departments. Click any bar, slice or cell: the dashboard filters in place, a chip shows the filter, and "View parts" lists the matching parts with a link to each form. The grey "Awaiting MRD" and slate "Not applicable" buckets are clickable too. As Admin, Edit Layout then "+ Custom chart" lets you choose what to measure, how to group it and how to show it.',
    persona: 'Admin',
    navigateTo: '/dashboards',
    highlight: '[data-tour="dashboard-grid"]',
  },
  {
    id: 'done',
    title: 'Tour complete',
    body:
      'MRDs → template offsets → per-part dates → RYG. Explore further by switching personas, editing an MRD on the Models page, or resetting demo data from the Home page.',
    navigateTo: '/',
  },
]

interface DemoTourProps {
  onClose: () => void
}

export function DemoTour({ onClose }: DemoTourProps) {
  const [step, setStep] = useState(0)
  const { setPersona } = usePersonaStore()
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDivElement>(null)

  const current = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === TOUR_STEPS.length - 1

  // Apply side effects when step changes
  useEffect(() => {
    if (current.persona) {
      setPersona(current.persona as any)
    }
    if (current.navigateTo) {
      navigate(current.navigateTo)
    }
    // Focus the dialog so keyboard users can navigate
    dialogRef.current?.focus()

    // Highlight the target once the new route has rendered (best-effort), and undo on step change
    if (!current.highlight) return
    let el: HTMLElement | null = null
    let prev: { outline: string; position: string; zIndex: string } | null = null
    const timer = window.setTimeout(() => {
      el = document.querySelector<HTMLElement>(current.highlight!)
      if (!el) return
      prev = { outline: el.style.outline, position: el.style.position, zIndex: el.style.zIndex }
      el.style.outline = '3px solid var(--color-accent)'
      el.style.position = 'relative'
      el.style.zIndex = '45' // above the backdrop (z-40), below the dialog (z-50)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => {
      window.clearTimeout(timer)
      if (el && prev) {
        el.style.outline = prev.outline
        el.style.position = prev.position
        el.style.zIndex = prev.zIndex
      }
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && !isLast) setStep((s) => s + 1)
      if (e.key === 'ArrowLeft' && !isFirst) setStep((s) => s - 1)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFirst, isLast, onClose])

  function handleNext() {
    if (isLast) { onClose(); return }
    setStep((s) => s + 1)
  }

  function handlePrev() {
    if (!isFirst) setStep((s) => s - 1)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Tour dialog — bottom-centre */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Demo tour"
        tabIndex={-1}
        className="fixed bottom-6 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-[var(--color-border)] bg-white shadow-2xl focus:outline-none"
        style={{ outline: 'none' }}
      >
        {/* Progress bar */}
        <div className="h-1 rounded-t-xl bg-surface overflow-hidden">
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-300"
            style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="px-5 pt-4 pb-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <span className="text-xs font-medium text-[var(--color-muted)]">
                Step {step + 1} of {TOUR_STEPS.length}
              </span>
              <h2 className="text-base font-semibold text-[var(--color-text)] mt-0.5">
                {current.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-[var(--color-muted)] hover:text-[var(--color-text)] text-lg leading-none p-1 rounded focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus:outline-none"
              aria-label="Close demo tour"
            >
              <FbIcon name="close" size={16} />
            </button>
          </div>

          <p className="text-sm text-[var(--color-muted)] leading-relaxed">
            {current.body}
          </p>

          {/* Persona badge if this step switches persona */}
          {current.persona && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)]">
              <span>Switched to</span>
              <span
                className="rounded-full px-2 py-0.5 text-white text-xs"
                style={{ background: personaColor(current.persona) }}
              >
                {current.persona}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
          <button
            onClick={onClose}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus:outline-none rounded"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="secondary" size="sm" onClick={handlePrev}>
                ← Back
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={handleNext}>
              {isLast ? 'Done' : 'Next →'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function personaColor(persona: string): string {
  const map: Record<string, string> = {
    Vendor: '#f97316',
    PIC: '#c4b5fd',
    SIC: '#a78bfa',
    DPM: '#6366f1',
    Admin: '#10b981',
    ModelCoordinator: '#0891b2',
    SectionAdmin: '#d97706',
  }
  return map[persona] ?? '#6b7280'
}
