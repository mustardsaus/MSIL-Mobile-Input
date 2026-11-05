import { Icon as FbIcon } from '../../components/Icon'
import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../AppLayout'
import { Button } from '../../components'
import { usePersonaStore, PERSONAS } from '../../store/personaStore'
import type { PersonaId } from '../../store/personaStore'
import { useQAStore } from '../../store'
import { getFilteredData } from '../../engine'
import type { FilteredInstance } from '../../engine'
import { DEMO_TODAY, fmtDate, partInScope } from '../scope'
import { buildWorkGroups, hasMyWork } from '../mywork/workQueue'
import type { WorkGroup, WorkMode } from '../mywork/workQueue'
import { buildInsights, buildVendorScores, predictRisk } from '../lessons/insights'
import { useExceptionData } from '../exceptions/useExceptionData'
import { RYG_HEX } from '../../components/RygDot'

interface RoleLink {
  to: string
  label: string
  desc: string
  icon: string
}

/** Four quick links per role, and the role’s one-line job. */
const ROLE_HOME: Record<PersonaId, { title: string; job: string; links: RoleLink[] }> = {
  Vendor: {
    title: 'Vendor', job: 'Acknowledge released parts, enter your fields, and explain delays.',
    links: [
      { to: '/mywork', label: 'My Work', desc: 'Parts to acknowledge and enter', icon: 'check' },
      { to: '/exceptions', label: 'Exceptions', desc: 'Delay reasons and actions', icon: 'alert' },
      { to: '/activities', label: 'Activities', desc: 'Status of your parts', icon: 'list' },
      { to: '/dashboards', label: 'Dashboards', desc: 'Your activity charts', icon: 'chart' }
    ]
  },
  PIC: {
    title: 'Person-In-Charge', job: 'Release parts, enter PIC fields, validate vendor entries, and close exceptions.',
    links: [
      { to: '/mywork', label: 'My Work', desc: 'Worklist and release status', icon: 'check' },
      { to: '/part-workspace', label: 'Part Workspace', desc: 'One part, all activities', icon: 'form' },
      { to: '/exceptions', label: 'Exceptions', desc: 'Deviations, actions, delays', icon: 'alert' },
      { to: '/parts', label: 'Part Intake', desc: 'Intake, release and audit', icon: 'box' }
    ]
  },
  SIC: {
    title: 'Section-In-Charge', job: 'Review submitted entries, assign PICs and approve deviations.',
    links: [
      { to: '/mywork', label: 'My Work', desc: 'Entries to validate', icon: 'check' },
      { to: '/pics', label: 'PIC Assignments', desc: 'Who owns which part', icon: 'person' },
      { to: '/exceptions', label: 'Exceptions', desc: 'Deviations, actions, delays', icon: 'alert' },
      { to: '/dashboards', label: 'Dashboards', desc: 'Section view', icon: 'chart' }
    ]
  },
  DPM: {
    title: 'Dept. Planning Mgr', job: 'Track completion across vendors, approve deviations, and escalate overdue items.',
    links: [
      { to: '/mywork', label: 'My Work', desc: 'Entries to validate', icon: 'check' },
      { to: '/dashboards', label: 'Dashboards', desc: 'Completion across vendors', icon: 'chart' },
      { to: '/lessons', label: 'Lessons Learnt', desc: 'Scorecards and forecast', icon: 'bulb' },
      { to: '/exceptions', label: 'Exceptions', desc: 'Deviations, actions, delays', icon: 'alert' }
    ]
  },
  ModelCoordinator: {
    title: 'Division Model Coordinator', job: 'Enter each model and its milestone MRDs; every planned date follows from them.',
    links: [
      { to: '/models', label: 'Models & MRDs', desc: 'Milestone dates', icon: 'form' },
      { to: '/wbs', label: 'WBS / Project', desc: 'Milestone, part, activity', icon: 'tree' },
      { to: '/dependencies', label: 'Dependencies', desc: 'Activity links', icon: 'link' },
      { to: '/dashboards', label: 'Dashboards', desc: 'Model view', icon: 'chart' }
    ]
  },
  SectionAdmin: {
    title: 'Department Co-ordinator (NP1)', job: 'Choose the activities for your section, set offsets, and add dummy part numbers.',
    links: [
      { to: '/template', label: 'Section Template', desc: 'Activities and offsets', icon: 'grid' },
      { to: '/parts', label: 'Part Intake', desc: 'Intake and dummy parts', icon: 'box' },
      { to: '/pics', label: 'PIC Assignments', desc: 'Who owns which part', icon: 'person' },
      { to: '/activities', label: 'Activities', desc: 'Catalogue', icon: 'list' }
    ]
  },
  Admin: {
    title: 'Admin', job: 'Define activities, fields and flows, and maintain sections and milestones.',
    links: [
      { to: '/builder', label: 'Builder', desc: 'Define an activity', icon: 'gear' },
      { to: '/settings', label: 'Settings', desc: 'Sections and milestones', icon: 'grid' },
      { to: '/activities', label: 'Activities', desc: 'Catalogue', icon: 'list' },
      { to: '/dashboards', label: 'Dashboards', desc: 'Overview', icon: 'chart' }
    ]
  }
}

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    check: <><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h9" /></>,
    alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    list: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    chart: <path d="M4 21V9M12 21V3M20 21v-6" />,
    form: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h7M7 16h4" /></>,
    box: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></>,
    person: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M17 8h4M19 6v4" /></>,
    bulb: <><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" /><path d="M9 21h6" /></>,
    tree: <><rect x="3" y="3" width="7" height="5" rx="1" /><path d="M6.5 8v4M6.5 12h11M12 12v4M17.5 12v4" /><rect x="3" y="16" width="7" height="5" rx="1" /><rect x="14" y="16" width="7" height="5" rx="1" /></>,
    link: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M5 8v4a2 2 0 0 0 2 2h3M19 8v4a2 2 0 0 1-2 2h-3" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17h7M17 14v7" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
    spark: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

interface Task {
  key: string
  kind: string
  title: string
  sub: string
  due: string
  to: string
}

const KIND_STYLE: Record<string, string> = {
  Validate: 'bg-blue-100 text-blue-800',
  Enter: 'bg-slate-100 text-slate-700',
  Deviation: 'bg-amber-100 text-amber-800',
  Action: 'bg-indigo-100 text-indigo-800',
  Delay: 'bg-red-100 text-red-800'
}

function addDays(d: string, n: number): string {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export function HomePage() {
  const { currentPersona } = usePersonaStore()
  const { startTour } = useOutletContext<AppOutletContext>()
  const [resetConfirm, setResetConfirm] = useState(false)
  const [taskTab, setTaskTab] = useState<'today' | 'tomorrow'>('today')
  const [ask, setAsk] = useState('')
  const [askNote, setAskNote] = useState(false)
  const { activities, entries, templateRows, models, parts, resetDemoData } = useQAStore()
  const { attention } = useExceptionData()
  const today = DEMO_TODAY
  const tomorrow = addDays(today, 1)
  const home = ROLE_HOME[currentPersona]
  const label = PERSONAS.find((p) => p.id === currentPersona)?.label ?? currentPersona

  const instances = useMemo<FilteredInstance[]>(
    () =>
      getFilteredData(entries, activities, parts, templateRows, models, { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' }, 'overview', today)
        .filter((i) => partInScope(i.part, currentPersona)),
    [entries, activities, parts, templateRows, models, currentPersona, today]
  )

  // ── My Work card: the most urgent activity groups for this role ────────────
  const workGroups = useMemo<{ g: WorkGroup; mode: WorkMode }[]>(() => {
    if (!hasMyWork(currentPersona)) return []
    const modes: WorkMode[] = currentPersona === 'Vendor' ? ['enter'] : currentPersona === 'PIC' ? ['validate', 'enter'] : ['validate']
    const out: { g: WorkGroup; mode: WorkMode }[] = []
    for (const m of modes) for (const g of buildWorkGroups(instances, currentPersona, m)) out.push({ g, mode: m })
    return out.slice(0, 4)
  }, [instances, currentPersona])

  // ── Tasks: what the role has to do, with a due date ─────────────────────────
  const tasks = useMemo<Task[]>(() => {
    const out: Task[] = []
    for (const inst of instances) {
      if (!inst.entry || inst.notApplicable || inst.dates.status !== 'resolved') continue
      const st = inst.entry.validationState
      let kind = ''
      if (st === 'Submitted' && (currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM')) {
        const steps = inst.activity.flow.steps
        if (steps[inst.entry.currentStepIndex]?.role === 'PIC') kind = 'Validate'
      } else if ((st === 'Draft' || st === 'Sent back') && ((currentPersona === 'Vendor' && inst.activity.fields.some((f) => f.enteredBy === 'Vendor')) || (currentPersona === 'PIC' && st === 'Draft' && inst.activity.fields.some((f) => f.enteredBy === 'PIC')))) {
        kind = 'Enter'
      }
      if (kind) {
        out.push({ key: inst.entry.id, kind, title: inst.part.partName, sub: `${inst.activity.name} · ${inst.row.milestoneId}`, due: inst.dates.end, to: `/activities/${inst.row.id}?part=${encodeURIComponent(inst.part.partNo)}` })
      }
    }
    for (const a of attention) {
      out.push({
        key: a.type + a.key, kind: a.type, title: a.title, sub: a.where, due: a.due ?? today,
        to: a.rowId && a.partNo ? `/activities/${a.rowId}?part=${encodeURIComponent(a.partNo)}` : `/exceptions?tab=${a.tab}`
      })
    }
    return out.sort((x, y) => x.due.localeCompare(y.due))
  }, [instances, attention, currentPersona, today])
  const todayTasks = tasks.filter((t) => t.due <= today)
  const tomorrowTasks = tasks.filter((t) => t.due === tomorrow)
  const shownTasks = taskTab === 'today' ? todayTasks : tomorrowTasks

  // ── AI Smart Insights: transparent, rule-based text from the tracker’s own data ─
  const insightText = useMemo(() => {
    const active = instances.filter((i) => !i.notApplicable)
    const overdue = active.filter((i) => i.ryg === 'Red').length
    const soon = active.filter((i) => i.ryg === 'Yellow').length
    const ctx = { entries, parts, activities, templateRows }
    const top = buildInsights(buildVendorScores(ctx))[0]
    const risky = predictRisk(
      ctx,
      active.map((i) => ({ partNo: i.part.partNo, activityId: i.activity.id, templateRowId: i.row.id, ryg: String(i.ryg) }))
    ).filter((r) => r.level === 'High').length
    const parts1 = [
      overdue > 0
        ? `Schedule risk detected: ${overdue} ${overdue === 1 ? 'activity is' : 'activities are'} past the planned end date${soon ? ` and ${soon} more fall due within 7 days` : ''}.`
        : soon > 0 ? `${soon} ${soon === 1 ? 'activity falls' : 'activities fall'} due within 7 days.` : 'Nothing in your view is overdue or due within 7 days.',
      risky > 0 ? `The forecast rates ${risky} ${risky === 1 ? 'part-activity' : 'part-activities'} at high risk of slipping.` : '',
      top ? `${top.title}. ${top.detail}` : ''
    ]
    return parts1.filter(Boolean).join(' ')
  }, [instances, entries, parts, activities, templateRows])

  return (
    <div className="mx-auto max-w-[1600px] pb-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold leading-9 tracking-[-0.3px] text-[var(--color-text)]">Welcome back, {label}!</h1>
        </div>
        <button
          type="button"
          onClick={startTour}
          aria-label="Start guided demo tour"
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
        >
          <FbIcon name="play" size={14} className="mr-1" />Demo tour
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── My Work / My Modules ─────────────────────────────────────── */}
        <section className="flex min-h-[300px] flex-col rounded-2xl p-5 text-white shadow-[0_8px_24px_rgba(37,99,235,.25)]" style={{ background: 'linear-gradient(160deg,#1d4ed8,#2563eb 60%,#1e40af)' }} aria-label="My work">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="m-0 text-[14px] font-semibold">{hasMyWork(currentPersona) ? 'My Work' : 'My Modules'}</h2>
            <Link to={hasMyWork(currentPersona) ? '/mywork' : home.links[0].to} className="text-[11px] font-medium text-white/85 hover:text-white">
              View all ›
            </Link>
          </div>
          <div className="flex flex-1 flex-col gap-2.5">
            {hasMyWork(currentPersona) ? (
              workGroups.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-xl bg-white/10 px-4 text-center text-[12px] text-white/85">
                  Nothing is waiting for you in My Work.
                </div>
              ) : (
                workGroups.map(({ g, mode }) => {
                  const col = RYG_HEX[g.ryg]
                  const n = g.instances.length
                  const bits = [mode === 'validate' ? `${g.submitted} to validate` : '', g.sentBack ? `${g.sentBack} sent back` : '', g.draft ? `${g.draft} draft` : '', g.notStarted ? `${g.notStarted} not started` : ''].filter(Boolean)
                  return (
                    <Link
                      key={g.key + mode}
                      to={`/mywork/${g.activity.id}/${g.milestoneId}${mode === 'validate' ? '?mode=validate' : ''}`}
                      className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-[var(--color-text)] hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <span className="inline-block h-9 w-9 flex-none rounded-full" style={{ background: `${col}22`, boxShadow: `inset 0 0 0 2px ${col}` }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{g.activity.name}</span>
                        <span className="block truncate text-[10.5px] text-[var(--color-muted)]">{g.milestoneId} · {n} part{n === 1 ? '' : 's'}{bits.length ? ` · ${bits.join(', ')}` : ''}</span>
                      </span>
                      <span className="text-[var(--color-muted)]" aria-hidden="true">→</span>
                    </Link>
                  )
                })
              )
            ) : (
              home.links.map((l) => (
                <Link key={l.to} to={l.to} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-[var(--color-text)] hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#eef2ff] text-[#4338ca]"><Icon name={l.icon} size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{l.label}</span>
                    <span className="block truncate text-[10.5px] text-[var(--color-muted)]">{l.desc}</span>
                  </span>
                  <span className="text-[var(--color-muted)]" aria-hidden="true">→</span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* ── Quick Links ──────────────────────────────────────────────── */}
        <section className="epmp-card flex min-h-[300px] flex-col p-5" aria-label="Quick links">
          <h2 className="m-0 mb-3 text-[14px] font-semibold text-[var(--color-text)]">Quick Links</h2>
          <div className="grid flex-1 grid-cols-2 gap-3">
            {home.links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-3 text-center shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3efff] text-[#6d28d9]"><Icon name={l.icon} /></span>
                <span className="text-[12px] font-medium leading-tight text-[var(--color-text)]">{l.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── AI Smart Insights ────────────────────────────────────────── */}
        <section className="flex min-h-[300px] flex-col rounded-2xl p-5 text-white shadow-[0_8px_24px_rgba(79,70,229,.25)]" style={{ background: 'linear-gradient(160deg,#2f6bf2,#4b3fd4 70%,#5b34c9)' }} aria-label="AI smart insights">
          <h2 className="m-0 mb-3 flex items-center gap-2 text-[14px] font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20"><Icon name="spark" size={16} /></span>
            AI Smart Insights
          </h2>
          <p className="m-0 flex-1 overflow-auto text-[12px] leading-[1.55] text-white/95">{insightText}</p>
          <form
            className="mt-3 flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault()
              setAskNote(true)
            }}
          >
            <input
              value={ask}
              onChange={(e) => { setAsk(e.target.value); setAskNote(false) }}
              placeholder="Ask AI anything…"
              aria-label="Ask AI anything"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-white placeholder-white/70 focus:outline-none"
            />
            <button type="submit" className="text-white/90 hover:text-white" aria-label="Ask">→</button>
          </form>
          {askNote && (
            <p className="m-0 mt-1.5 text-[10.5px] text-white/85" role="status">
              Ask AI is a placeholder in this prototype. The insights above are rule-based; see <Link to="/lessons" className="underline">Lessons Learnt</Link> for the detail.
            </p>
          )}
        </section>

        {/* ── My Tasks ─────────────────────────────────────────────────── */}
        <section className="epmp-card flex min-h-[260px] flex-col p-5" aria-label="My tasks" data-tour="inbox-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="m-0 text-[14px] font-semibold text-[var(--color-text)]">My Tasks</h2>
            <div className="flex rounded-lg border border-[var(--color-border)] bg-white p-0.5 text-[11px]" role="tablist">
              {([['today', `Today (${todayTasks.length})`], ['tomorrow', `Tomorrow (${tomorrowTasks.length})`]] as const).map(([id, text]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={taskTab === id}
                  onClick={() => setTaskTab(id)}
                  className={`rounded-md px-3 py-1 font-medium ${taskTab === id ? 'bg-[#eef4ff] text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
          <div className="flex max-h-[230px] flex-1 flex-col gap-2 overflow-y-auto">
            {shownTasks.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-xl bg-[#f6f9ff] px-4 py-8 text-center text-[12px] text-[var(--color-muted)]">
                {taskTab === 'today' ? 'Nothing is due today or overdue.' : 'Nothing is due tomorrow.'}
              </div>
            ) : (
              shownTasks.map((t) => (
                <Link
                  key={t.key}
                  to={t.to}
                  className="flex items-start gap-3 rounded-xl border border-[#dbe7ff] bg-[#f4f8ff] px-3 py-2.5 hover:bg-[#eaf2ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center justify-between gap-2">
                      <span className={`whitespace-nowrap flex-none rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${KIND_STYLE[t.kind] ?? 'bg-slate-100 text-slate-700'}`}>{t.kind}</span>
                      <span className={`text-[10.5px] ${t.due < today ? 'font-semibold text-[#b91c1c]' : 'text-[var(--color-muted)]'}`}>{t.due < today ? 'Overdue ' : ''}{fmtDate(t.due)}</span>
                    </span>
                    <span className="block text-[12.5px] font-semibold leading-snug text-[var(--color-text)]">{t.title}</span>
                    <span className="block text-[10.5px] text-[var(--color-muted)]">{t.sub}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* ── What’s new ───────────────────────────────────────────────── */}
        <section className="epmp-card flex min-h-[260px] flex-col p-6 lg:col-span-2" aria-label="What is new">
          <h2 className="m-0 mb-3 text-[13px] font-semibold text-[var(--color-text)]">What’s new in EPMP</h2>
          <p className="m-0 mb-2 text-[22px] font-bold leading-8 tracking-[-0.2px] text-[var(--color-text)]">Exceptions now live in one place</p>
          <p className="m-0 flex-1 text-[13px] leading-[1.6] text-[var(--color-muted)]">
            Deviations, actions and delay reasons are now managed together. When an activity runs late, the vendor gives a reason and the PIC accepts it or sends it back.
            Vendors also acknowledge or return the parts a PIC releases, and each PIC sees how many parts are released, pending and returned. Everything that needs you is
            listed on the Exception Management overview.
          </p>
          <Link to="/exceptions" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-primary)] hover:underline">
            Learn more →
          </Link>
        </section>
      </div>

      {/* ── Demo data controls ─────────────────────────────────────────── */}
      <div className="mt-5 flex items-center justify-between rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div>
          <p className="m-0 text-xs font-medium text-[var(--color-text)]">Demo data controls</p>
          <p className="m-0 text-xs text-[var(--color-muted)]">All changes are stored in localStorage. Reset restores the original seed data.</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {!resetConfirm ? (
            <Button variant="secondary" size="sm" onClick={() => setResetConfirm(true)}>Reset demo data</Button>
          ) : (
            <>
              <span className="text-xs text-[var(--color-muted)]">Are you sure?</span>
              <Button variant="danger" size="sm" onClick={() => { resetDemoData(); setResetConfirm(false) }}>Yes, reset</Button>
              <Button variant="secondary" size="sm" onClick={() => setResetConfirm(false)}>Cancel</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
