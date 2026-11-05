import { Icon as FbIcon } from '../../components/Icon'
import { overlayFeed } from '../../mock/feed'
import { useState, useMemo } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore, getPersonaScope } from '../../store/personaStore'
import { Card, Button } from '../../components'
import { WidgetRenderer } from './WidgetRegistry'
import {
  aggregateWidgetData,
  getFilteredData,
  generateDashboardConfig,
  generateOverviewDashboardConfig,
  readChartProps
} from '../../engine'
import type { Widget, DashboardConfig, GlobalFilters, ChartProps } from '../../domain'
import { ChartControls } from './ChartControls'
import { CrossActivityView } from './CrossActivityView'
import { CrossActivityCreator } from './CrossActivityCreator'
import { DrillPartsList } from './DrillPartsList'
import { EMPTY_FILTERS, applyDrill, drillChips, filtersForNewDashboard } from './drill'
import type { RawDrill } from './drill'
import { DEFAULT_CHART_PROPS, applyChartChange, chartTitle, stackedBarToChart } from './chartEditor'
import { DEMO_TODAY, rowInScope } from '../scope'
import { clientDashboardUrl } from './clientDashboards'

const ReactGridLayout = WidthProvider(GridLayout)

type LayoutItem = { i: string; x: number; y: number; w: number; h: number }

export function DashboardsPage() {
  const {
    activities,
    entries: storedEntries,
    templateRows,
    models: modelRecords,
    parts,
    sections,
    milestones,
    dashboards,
    savedViews,
    updateDashboard,
    resetDashboard,
    saveView,
    crossDashboards,
    addCrossDashboard
  } = useQAStore()
  const { currentPersona } = usePersonaStore()
  // Entries plus the system-fed values of data-only fields, so dashboards and drill-downs can use them.
  const entries = useMemo(
    () => overlayFeed(storedEntries, activities, parts, templateRows, modelRecords),
    [storedEntries, activities, parts, templateRows, modelRecords]
  )
  // Role-only identity: PIC/Section Admin are locked to NP1, Vendor to Minda Industries.
  const scope = getPersonaScope(currentPersona)

  // Selected Dashboard ID: 'overview' or an activity ID
  const [selectedActivityId, setSelectedActivityId] = useState<string | 'overview'>('overview')
  // When set, a cross-activity dashboard is shown instead of the activity/overview dashboard.
  const [selectedCrossId, setSelectedCrossId] = useState<string | null>(null)
  const [crossCreatorOpen, setCrossCreatorOpen] = useState(false)
  const selectedCross = useMemo(() => crossDashboards.find((d) => d.id === selectedCrossId) ?? null, [crossDashboards, selectedCrossId])

  // Global filters
  const [filters, setFilters] = useState<GlobalFilters>(EMPTY_FILTERS)

  // Edit Mode state
  const [editMode, setEditMode] = useState(false)
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null)

  // Named Views switching state
  const [selectedViewId, setSelectedViewId] = useState<string>('default')
  const [showSaveViewModal, setShowSaveViewModal] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  // Toast / Export status
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Check editing permission: only Admin, SIC, and DPM can edit layouts
  const canEdit = currentPersona === 'Admin' || currentPersona === 'SIC' || currentPersona === 'DPM'

  // Filters actually applied: persona scope always wins over the dropdowns.
  const effectiveFilters = useMemo<GlobalFilters>(
    () => ({
      ...filters,
      section: scope.section ?? filters.section,
      vendor: scope.vendor ?? filters.vendor
    }),
    [filters, scope.section, scope.vendor]
  )

  // Activities that have at least one template row visible to this persona
  const visibleActivities = useMemo(
    () =>
      activities.filter(
        (a) =>
          a.published !== false &&
          templateRows.some((r) => r.activityId === a.id && rowInScope(r, currentPersona))
      ),
    [activities, templateRows, currentPersona]
  )

  // Get current active activity definition (if not overview)
  const activity = useMemo(() => {
    return activities.find((a) => a.id === selectedActivityId)
  }, [activities, selectedActivityId])

  // If the selected activity has a client-provided pixel-perfect HTML dashboard, embed it.
  // The overview and cross-activity dashboards never use this.
  // Activities with a client dashboard open it by default; the configurable dashboard (built from the activity's own
  // fields, including data-only fields fed from SAP) is one click away.
  const [configurableFor, setConfigurableFor] = useState<string | null>(null)
  const useConfigurable = configurableFor === selectedActivityId
  const clientUrl = selectedActivityId === 'overview' ? null : clientDashboardUrl(selectedActivityId)
  const clientDashboardHref = useConfigurable ? null : clientUrl

  // Get active dashboard configuration (base or custom view)
  const activeDashboard = useMemo<DashboardConfig>(() => {
    // If a saved view is selected, use its widgets!
    if (selectedViewId !== 'default' && selectedViewId !== 'reset') {
      const saved = savedViews.find((v) => v.id === selectedViewId)
      if (saved) {
        return {
          id: selectedActivityId,
          activityId: selectedActivityId,
          widgets: saved.widgets
        }
      }
    }

    // Otherwise, use the dashboard config from the store
    const storeDash = dashboards.find((d) => d.activityId === selectedActivityId)
    if (storeDash) {
      return storeDash
    }

    // Fallback just in case
    return selectedActivityId === 'overview'
      ? generateOverviewDashboardConfig()
      : generateDashboardConfig(activity!)
  }, [dashboards, selectedActivityId, selectedViewId, savedViews, activity])

  // Find active widget for properties panel
  const activeWidget = useMemo(() => {
    if (!activeWidgetId) return null
    return activeDashboard.widgets.find((w) => w.id === activeWidgetId) || null
  }, [activeDashboard.widgets, activeWidgetId])

  // Populate filter dropdowns from the live parts master (excluding superseded parts)
  const models = useMemo(() => {
    return Array.from(new Set(parts.filter((p) => !p.supersededBy && (!scope.section || p.section === scope.section)).map((p) => p.model))).sort()
  }, [parts, scope.section])

  const vendors = useMemo(() => {
    return Array.from(new Set(parts.filter((p) => !p.supersededBy && (!scope.section || p.section === scope.section)).map((p) => p.vendorName))).sort()
  }, [parts, scope.section])

  // List of saved views available for the current dashboard
  const currentSavedViews = useMemo(() => {
    return savedViews.filter((v) => v.activityId === selectedActivityId)
  }, [savedViews, selectedActivityId])

  // Trigger brief toast message
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Handle widget coordinate changes from react-grid-layout dragging/resizing
  const handleLayoutChange = (newLayout: readonly LayoutItem[]) => {
    if (!editMode) return

    const updatedWidgets = activeDashboard.widgets.map((widget) => {
      const item = newLayout.find((l) => l.i === widget.id)
      if (item) {
        return {
          ...widget,
          grid: {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h
          }
        }
      }
      return widget
    })

    const updatedConfig: DashboardConfig = {
      ...activeDashboard,
      widgets: updatedWidgets
    }

    // Update in-store dashboard configuration
    updateDashboard(selectedActivityId, updatedConfig)
  }

  // Properties Panel Actions
  const handleUpdateWidgetProps = (propsUpdate: Record<string, any>) => {
    if (!activeWidget) return

    const updatedWidgets = activeDashboard.widgets.map((widget) => {
      if (widget.id === activeWidget.id) {
        return {
          ...widget,
          props: {
            ...widget.props,
            ...propsUpdate
          }
        }
      }
      return widget
    })

    updateDashboard(selectedActivityId, {
      ...activeDashboard,
      widgets: updatedWidgets
    })
  }

  const handleUpdateWidgetTitle = (newTitle: string) => {
    if (!activeWidget) return

    const updatedWidgets = activeDashboard.widgets.map((widget) => {
      if (widget.id === activeWidget.id) {
        return { ...widget, title: newTitle }
      }
      return widget
    })

    updateDashboard(selectedActivityId, {
      ...activeDashboard,
      widgets: updatedWidgets
    })
  }

  const handleUpdateWidgetType = (newType: any) => {
    if (!activeWidget) return

    // Set reasonable default properties depending on the selected chart type
    let defaultProps: Record<string, any> = { ...activeWidget.props }
    if (newType === 'donut') {
      defaultProps.field = 'ryg'
    } else if (newType === 'kpi') {
      defaultProps.metric = 'totalParts'
    } else if (newType === 'chart') {
      defaultProps = { ...DEFAULT_CHART_PROPS }
    }

    const updatedWidgets = activeDashboard.widgets.map((widget) => {
      if (widget.id === activeWidget.id) {
        return {
          ...widget,
          type: newType,
          props: defaultProps
        }
      }
      return widget
    })

    updateDashboard(selectedActivityId, {
      ...activeDashboard,
      widgets: updatedWidgets
    })
  }

  // Custom chart: apply one choice, repair what it invalidates, and keep an auto-suggested title in step.
  // A title the Admin edited by hand is left alone.
  const handleChartChange = (change: Partial<ChartProps>) => {
    if (!activeWidget) return
    const before = readChartProps(activeWidget.props)
    const after = applyChartChange(before ?? DEFAULT_CHART_PROPS, change, activity)
    const wasSuggested = !before || activeWidget.title === chartTitle(before, activity)
    updateDashboard(selectedActivityId, {
      ...activeDashboard,
      widgets: activeDashboard.widgets.map((w) =>
        w.id === activeWidget.id
          ? { ...w, title: wasSuggested ? chartTitle(after, activity) : w.title, props: after }
          : w
      )
    })
  }

  // Replaces the older Stacked Bar by the equivalent custom chart (same X axis and stacks, now changeable)
  const handleConvertStackedBar = () => {
    if (!activeWidget) return
    const chart = stackedBarToChart(activeWidget.props)
    updateDashboard(selectedActivityId, {
      ...activeDashboard,
      widgets: activeDashboard.widgets.map((w) =>
        w.id === activeWidget.id ? { ...w, type: 'chart', props: chart } : w
      )
    })
  }

  const handleRemoveWidget = (widgetId: string) => {
    const updatedWidgets = activeDashboard.widgets.filter((w) => w.id !== widgetId)
    updateDashboard(selectedActivityId, {
      ...activeDashboard,
      widgets: updatedWidgets
    })
    if (activeWidgetId === widgetId) {
      setActiveWidgetId(null)
    }
    showToast('Widget removed')
  }

  const handleDuplicateWidget = (widget: Widget) => {
    const uniqueId = `widget-dup-${Date.now()}`
    const duplicated: Widget = {
      ...widget,
      id: uniqueId,
      title: `${widget.title} (Copy)`,
      grid: {
        ...widget.grid,
        y: widget.grid.y + widget.grid.h // place below the original
      }
    }

    updateDashboard(selectedActivityId, {
      ...activeDashboard,
      widgets: [...activeDashboard.widgets, duplicated]
    })
    showToast('Widget duplicated')
  }

  // Widget Palette: Add new widgets easily with standard sizes
  const handleAddWidget = (type: string) => {
    const uniqueId = `widget-add-${Date.now()}`
    let newWidget: Widget

    // Calculate next Y position to append cleanly at bottom
    const maxY = activeDashboard.widgets.reduce((max, w) => Math.max(max, w.grid.y + w.grid.h), 0)

    if (type === 'kpi') {
      newWidget = {
        id: uniqueId,
        type: 'kpi',
        title: 'New KPI Metric',
        grid: { x: 0, y: maxY, w: 3, h: 2 },
        props: { metric: 'totalParts', subtext: 'Subtext note' }
      }
    } else if (type === 'donut') {
      newWidget = {
        id: uniqueId,
        type: 'donut',
        title: 'New Status Distribution',
        grid: { x: 0, y: maxY, w: 4, h: 4 },
        props: { field: 'ryg' }
      }
    } else if (type === 'stackedBar') {
      // A custom chart drawn stacked, so the stacks can be any field (for example Model on X, Drawing availability stacked)
      const stacked: ChartProps = { measure: 'count', groupBy: 'model', splitBy: 'status', display: 'stackedBar' }
      newWidget = {
        id: uniqueId,
        type: 'chart',
        title: chartTitle(stacked, activity),
        grid: { x: 0, y: maxY, w: 6, h: 4 },
        props: stacked
      }
    } else if (type === 'trend') {
      newWidget = {
        id: uniqueId,
        type: 'trend',
        title: 'New Planned vs Actual',
        grid: { x: 0, y: maxY, w: 6, h: 4 },
        props: { metric: 'timeline' }
      }
    } else if (type === 'table') {
      newWidget = {
        id: uniqueId,
        type: 'table',
        title: 'Outstanding Parts List',
        grid: { x: 6, y: maxY, w: 6, h: 4 },
        props: {}
      }
    } else if (type === 'chart') {
      newWidget = {
        id: uniqueId,
        type: 'chart',
        title: chartTitle(DEFAULT_CHART_PROPS, activity),
        grid: { x: 0, y: maxY, w: 6, h: 4 },
        props: { ...DEFAULT_CHART_PROPS }
      }
    } else {
      newWidget = {
        id: uniqueId,
        type: 'gauge',
        title: 'New Accuracy Bands',
        grid: { x: 0, y: maxY, w: 6, h: 4 },
        props: { field: 'accuracy' }
      }
    }

    updateDashboard(selectedActivityId, {
      ...activeDashboard,
      widgets: [...activeDashboard.widgets, newWidget]
    })
    setActiveWidgetId(uniqueId)
    showToast('Widget added! Scroll down to see it.')
  }

  // Reset to default auto layout
  const handleResetLayout = () => {
    resetDashboard(selectedActivityId)
    setSelectedViewId('default')
    setActiveWidgetId(null)
    showToast('Dashboard reset to default auto-generated layout')
  }

  // Save Named View dialog trigger
  const handleSaveViewSubmit = () => {
    if (!newViewName.trim()) return
    saveView(newViewName, selectedActivityId, activeDashboard.widgets)
    setShowSaveViewModal(false)
    setNewViewName('')
    showToast(`Named view "${newViewName}" saved successfully!`)
  }

  // Drill-down: a click on any widget narrows the dashboard in place; every widget recalculates from `filters`.
  const handleDrillDown = (click: RawDrill) => {
    setFilters((f) => applyDrill(f, click, scope))
  }

  // Active filters, shown as removable chips (scope-locked ones are not removable, so they get no chip)
  const chips = useMemo(
    () => drillChips(filters, { scope, milestones, activities, activity }),
    [filters, scope, milestones, activities, activity]
  )

  // "View parts": the instances behind the charts (same filters, same persona scope), only while a filter is active
  const drillInstances = useMemo(
    () =>
      chips.length === 0
        ? []
        : getFilteredData(entries, activities, parts, templateRows, modelRecords, effectiveFilters, selectedActivityId, DEMO_TODAY),
    [chips.length, entries, activities, parts, templateRows, modelRecords, effectiveFilters, selectedActivityId]
  )

  // Export Mocks
  const handleExport = (format: 'PDF' | 'Excel') => {
    showToast(`Exporting dashboard config & aggregated metrics to ${format}... Please wait.`)
    setTimeout(() => {
      showToast(`Export to ${format} completed! (Downloaded to local mocks directory)`)
    }, 1500)
  }

  // Prepare standard layout structures required by react-grid-layout
  const rglLayout = useMemo(() => {
    return activeDashboard.widgets.map((w) => ({
      i: w.id,
      x: w.grid.x,
      y: w.grid.y,
      w: w.grid.w,
      h: w.grid.h
    }))
  }, [activeDashboard.widgets])

  return (
    <div className="max-w-7xl mx-auto flex gap-5 relative">
      {/* LEFT NAVIGATION sidebar to toggle dashboards */}
      <div className="w-64 flex-shrink-0 epmp-card p-4 h-[fit-content]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3 px-1">
          Select Dashboard
        </h3>
        <nav className="flex flex-col gap-1">
          <button
            onClick={() => {
              setSelectedActivityId('overview')
              setSelectedCrossId(null)
              setSelectedViewId('default')
              setActiveWidgetId(null)
              setFilters(filtersForNewDashboard)
            }}
            className={`w-full text-left px-3 py-2 rounded-full border border-transparent text-sm font-medium transition-colors ${
              selectedActivityId === 'overview' && !selectedCross
                ? 'bg-[linear-gradient(120deg,#245bff,#2d3394)] border-[#f3dfef] text-white'
                : 'text-[var(--color-text)] hover:bg-[var(--color-surface)]'
            }`}
          >
            <FbIcon name="chart-mixed" size={16} className="mr-1.5" />Global Milestone Overview
          </button>

          <div className="border-t border-border my-2" />

          <span className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide px-1 mb-1 block">
            Activities
          </span>

          {visibleActivities.map((act) => (
              <button
                key={act.id}
                onClick={() => {
                  setSelectedActivityId(act.id)
                  setSelectedCrossId(null)
                  setSelectedViewId('default')
                  setActiveWidgetId(null)
                  setFilters(filtersForNewDashboard)
                }}
                className={`w-full text-left px-3 py-1.5 rounded-full border border-transparent text-xs truncate transition-colors ${
                  selectedActivityId === act.id && !selectedCross
                    ? 'bg-secondary text-primary font-semibold border-[#bfdbfe]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                }`}
                title={act.name}
              >
                {act.name}
              </button>
            ))}

          <div className="border-t border-border my-2" />
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">Cross-activity</span>
            {canEdit && (
              <button
                onClick={() => setCrossCreatorOpen(true)}
                className="text-[10px] font-medium text-[var(--color-primary)] hover:underline"
                title="Compare activities for one model or part"
              >
                + New
              </button>
            )}
          </div>
          {crossDashboards.length === 0 ? (
            <p className="px-1 text-[10px] text-[var(--color-muted)]">None yet. {canEdit ? 'Click “+ New” to compare activities for a model or part.' : ''}</p>
          ) : (
            crossDashboards.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setSelectedCrossId(d.id)
                  setActiveWidgetId(null)
                }}
                className={`w-full text-left px-3 py-1.5 rounded-full border border-transparent text-xs truncate transition-colors ${
                  selectedCrossId === d.id
                    ? 'bg-secondary text-primary font-semibold border-[#bfdbfe]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                }`}
                title={`${d.name} — by ${d.commonality}`}
              >
                <FbIcon name="shuffle" size={14} className="mr-1.5" />{d.name}
              </button>
            ))
          )}
        </nav>
      </div>

      {/* DASHBOARD BODY */}
      <div className="flex-1 min-w-0">
        {selectedCross ? (
          <CrossActivityView dashboard={selectedCross} />
        ) : clientDashboardHref ? (
          /* Pixel-perfect client dashboard embedded as-is (runs on its own demo data). */
          <div className="epmp-card overflow-hidden" style={{ height: 'calc(100vh - 150px)' }}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
              <div>
                <h2 className="m-0 text-[15px] font-semibold leading-5 text-[var(--color-text)]">{activity?.name ?? 'Activity dashboard'}</h2>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">Client dashboard · interactive preview</p>
              </div>
              <button
                type="button"
                onClick={() => setConfigurableFor(selectedActivityId)}
                className="ml-auto rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)]"
              >
                Configurable dashboard (uses this app’s data)
              </button>
              <a
                href={clientDashboardHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--color-accent)] hover:underline whitespace-nowrap"
              >
                Open in new tab
              </a>
            </div>
            <iframe
              key={clientDashboardHref}
              src={clientDashboardHref}
              title={activity?.name ?? 'Client dashboard'}
              className="w-full border-0"
              style={{ height: 'calc(100% - 49px)' }}
            />
          </div>
        ) : (
        <>
        {/* TOP TOOLBAR: View details + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 epmp-card px-4 py-3">
          <div>
            <h2 className="m-0 text-[20px] font-semibold leading-7 tracking-[-0.3px] text-[var(--color-text)]">
              {selectedActivityId === 'overview' ? 'Global Milestone Overview Dashboard' : 'Activity Performance Dashboard'}
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {selectedActivityId === 'overview'
                ? 'Cross-activity rollup by milestone and section'
                : activity?.name}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {clientUrl && (
              <button
                type="button"
                onClick={() => setConfigurableFor(null)}
                className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)]"
              >
                Back to client dashboard
              </button>
            )}
            {/* View Selector (Named views) */}
            <select
              value={selectedViewId}
              onChange={(e) => {
                setSelectedViewId(e.target.value)
                setActiveWidgetId(null)
              }}
              className="border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="default">Default Auto Layout</option>
              {currentSavedViews.map((v) => (
                <option key={v.id} value={v.id}>
                  <FbIcon name="eye" size={14} className="mr-1.5" />{v.name}
                </option>
              ))}
            </select>

            {/* Edit layout toggles */}
            {canEdit && (
              <Button
                variant={editMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setEditMode(!editMode)
                  setActiveWidgetId(null)
                }}
              >
                {editMode ? <><FbIcon name="check" size={14} className="mr-1" />Finish Customization</> : <><FbIcon name="pen" size={14} className="mr-1" />Edit Layout</>}
              </Button>
            )}

            {/* Export Actions */}
            <Button variant="secondary" size="sm" onClick={() => handleExport('PDF')}>
              <FbIcon name="printer" size={14} className="mr-1" />PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport('Excel')}>
              <FbIcon name="file-lines" size={14} className="mr-1" />Excel
            </Button>
          </div>
        </div>

        {/* PERSISTENT GLOBAL FILTERS ROW */}
        <div className="epmp-card p-4 mb-4">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
            <span className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
              <FbIcon name="search" size={16} /> Global Dashboard Filters
            </span>
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Clear filters
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {/* Milestone */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-muted)] mb-1">MILESTONE</label>
              <select
                value={filters.milestone}
                onChange={(e) => setFilters({ ...filters, milestone: e.target.value })}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none"
              >
                <option value="All">All Milestones</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Section (locked for section-scoped roles) */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-muted)] mb-1">SECTION</label>
              <select
                value={scope.section ?? filters.section}
                onChange={(e) => setFilters({ ...filters, section: e.target.value })}
                disabled={!!scope.section}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none disabled:bg-surface disabled:text-muted"
              >
                <option value="All">All Sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-muted)] mb-1">MODEL</label>
              <select
                value={filters.model}
                onChange={(e) => setFilters({ ...filters, model: e.target.value })}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none"
              >
                <option value="All">All Models</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Vendor */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-muted)] mb-1">VENDOR</label>
              <select
                value={scope.vendor ?? filters.vendor}
                onChange={(e) => setFilters({ ...filters, vendor: e.target.value })}
                disabled={!!scope.vendor}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none disabled:bg-surface disabled:text-muted"
              >
                <option value="All">All Vendors</option>
                {vendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Scope Type */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-muted)] mb-1">SCOPE TYPE</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value as any })}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none"
              >
                <option value="All">New Part + ECN</option>
                <option value="NewPart">New Part</option>
                <option value="ECN">ECN</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-muted)] mb-1">MRD START</label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1 text-xs bg-white text-[var(--color-text)] focus:outline-none"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-muted)] mb-1">MRD END</label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1 text-xs bg-white text-[var(--color-text)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* ACTIVE FILTER CHIPS: set by dropdowns or by clicking a chart */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4" data-tour="drill-chips">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Filtered by</span>
            {chips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-secondary pl-2.5 pr-1.5 py-0.5 text-xs text-primary"
              >
                {chip.label}
                <button
                  onClick={() => setFilters((f) => chip.clear(f))}
                  className="rounded-full px-1 leading-none text-primary hover:bg-white"
                  aria-label={`Remove filter ${chip.label}`}
                  title="Remove this filter"
                >
                  <FbIcon name="close" size={12} />
                </button>
              </span>
            ))}
            <button
              onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, startDate: f.startDate, endDate: f.endDate }))}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        {chips.length > 0 && <DrillPartsList instances={drillInstances} activity={activity} />}

        {/* CUSTOMIZATION CONTROLS BAR (Only visible in Edit Mode) */}
        {editMode && (
          <div className="bg-secondary border border-[#bfdbfe] rounded-lg p-3.5 mb-4 flex flex-wrap items-center justify-between gap-3 animate-fade-in text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary"><FbIcon name="tools" size={14} className="mr-1" />Configurator Toolbox:</span>
              <button
                onClick={() => handleAddWidget('chart')}
                className="bg-primary text-white border border-primary rounded px-2.5 py-1 hover:bg-[#1a43c9] transition-colors font-medium"
                title="Choose what to measure, how to group it and how to show it"
              >
                + Custom chart
              </button>
              <button
                onClick={() => handleAddWidget('kpi')}
                className="bg-white border border-[#bfdbfe] rounded px-2.5 py-1 text-primary hover:bg-accent-soft transition-colors font-medium"
              >
                + KPI Tile
              </button>
              <button
                onClick={() => handleAddWidget('donut')}
                className="bg-white border border-[#bfdbfe] rounded px-2.5 py-1 text-primary hover:bg-accent-soft transition-colors font-medium"
              >
                + Donut Chart
              </button>
              <button
                onClick={() => handleAddWidget('stackedBar')}
                className="bg-white border border-[#bfdbfe] rounded px-2.5 py-1 text-primary hover:bg-accent-soft transition-colors font-medium"
              >
                + Stacked Bar
              </button>
              <button
                onClick={() => handleAddWidget('trend')}
                className="bg-white border border-[#bfdbfe] rounded px-2.5 py-1 text-primary hover:bg-accent-soft transition-colors font-medium"
              >
                + Timeline
              </button>
              <button
                onClick={() => handleAddWidget('table')}
                className="bg-white border border-[#bfdbfe] rounded px-2.5 py-1 text-primary hover:bg-accent-soft transition-colors font-medium"
              >
                + Part List Table
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSaveViewModal(true)}
                className="bg-primary text-white rounded px-3 py-1 hover:bg-[#1a43c9] font-medium"
              >
                <FbIcon name="floppy-disk" size={14} className="mr-1" />Save as Named View...
              </button>
              <button
                onClick={handleResetLayout}
                className="bg-white border border-input text-ink-muted rounded px-3 py-1 hover:bg-surface font-medium"
              >
                <FbIcon name="undo" size={14} className="mr-1" />Reset to Auto Layout
              </button>
            </div>
          </div>
        )}

        {/* WIDGET GRID */}
        {activeDashboard.widgets.length === 0 ? (
          <Card>
            <div className="text-center py-16 text-[var(--color-muted)]">
              <p className="mb-2 text-[var(--color-muted)]"><FbIcon name="clipboard-list" size={36} /></p>
              <p className="font-medium">No widgets in this dashboard.</p>
              <p className="text-xs mt-1">Use "Edit Layout" and add widgets from the toolbox.</p>
            </div>
          </Card>
        ) : (
          <div data-tour="dashboard-grid">
          <ReactGridLayout
            className="layout"
            layout={rglLayout}
            cols={12}
            rowHeight={70}
            isDraggable={editMode}
            isResizable={editMode}
            onLayoutChange={handleLayoutChange}
            draggableCancel=".recharts-wrapper, select, input, button"
          >
            {activeDashboard.widgets.map((widget) => {
              // Aggregate real-time filtered metrics
              const widgetData = aggregateWidgetData(
                widget,
                entries,
                activities,
                parts,
                templateRows,
                modelRecords,
                effectiveFilters,
                selectedActivityId,
                DEMO_TODAY
              )

              const isActive = activeWidgetId === widget.id

              return (
                <div
                  key={widget.id}
                  className={`bg-white border rounded-lg p-3 overflow-hidden relative group transition-all duration-200 ${
                    isActive
                      ? 'ring-2 ring-primary border-transparent shadow-md'
                      : 'border-[var(--color-border)] shadow-xs'
                  } ${editMode ? 'hover:border-primary cursor-move' : ''}`}
                  onClick={() => {
                    if (editMode) {
                      setActiveWidgetId(widget.id)
                    }
                  }}
                >
                  {/* EDIT WIDGET OVERLAY OPTION BOXES */}
                  {editMode && (
                    <div className="absolute top-2 right-2 flex gap-1 z-30 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-xs p-1 rounded border border-border shadow-sm">
                      <button
                        title="Configure properties"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveWidgetId(widget.id)
                        }}
                        className="p-1 hover:bg-surface text-ink-muted rounded text-xxs"
                      >
                        <FbIcon name="cog" size={12} className="mr-1" />Props
                      </button>
                      <button
                        title="Duplicate"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDuplicateWidget(widget)
                        }}
                        className="p-1 hover:bg-surface text-ink-muted rounded text-xxs"
                      >
                        <FbIcon name="clipboard" size={12} className="mr-1" />Copy
                      </button>
                      <button
                        title="Remove"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveWidget(widget.id)
                        }}
                        className="p-1 hover:bg-[#fef2f2] text-destructive rounded text-xxs"
                      >
                        <FbIcon name="close" size={12} className="mr-1" />Del
                      </button>
                    </div>
                  )}

                  {/* Render Widget */}
                  <WidgetRenderer
                    widget={widget}
                    data={widgetData}
                    activityId={selectedActivityId}
                    onDrillDown={handleDrillDown}
                  />
                </div>
              )
            })}
          </ReactGridLayout>
          </div>
        )}
        </>
        )}
      </div>

      {/* PROPERTIES DRAWER PANEL (Right-side) */}
      {editMode && activeWidget && (
        <div className="w-80 flex-shrink-0 epmp-card p-4 h-[fit-content] animate-slide-in sticky top-5 z-20">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]">
              Widget Properties
            </h3>
            <button
              onClick={() => setActiveWidgetId(null)}
              className="text-muted hover:text-ink-muted text-xs"
            >
              <FbIcon name="close" size={12} className="mr-1" />Close
            </button>
          </div>

          <div className="flex flex-col gap-3 text-xs">
            {/* Widget ID (Read-only) */}
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase">Widget Key ID</label>
              <div className="font-mono text-xxs text-muted bg-surface p-1.5 rounded mt-0.5 select-all">
                {activeWidget.id}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-[10px] font-bold text-[var(--color-muted)] uppercase mb-1">
                Widget Title
              </label>
              <input
                type="text"
                value={activeWidget.title}
                onChange={(e) => handleUpdateWidgetTitle(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] font-medium"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-[10px] font-bold text-[var(--color-muted)] uppercase mb-1">
                Chart / Widget Type
              </label>
              <select
                value={activeWidget.type}
                onChange={(e) => handleUpdateWidgetType(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="chart">Custom chart</option>
                <option value="kpi">KPI Metric Tile</option>
                <option value="donut">Donut Distribution Chart</option>
                {activeWidget.type === 'stackedBar' && <option value="stackedBar">Stacked Bar (Approval / RYG only)</option>}
                <option value="trend">Dual-line Timeline Trend</option>
                <option value="table">Mini Table Part Grid</option>
                <option value="gauge">Band Gauge Chart</option>
              </select>
            </div>

            {/* Custom chart: what to measure, group by, split by, show as */}
            {activeWidget.type === 'chart' && (
              <ChartControls
                chart={readChartProps(activeWidget.props) ?? DEFAULT_CHART_PROPS}
                activity={activity}
                onChange={handleChartChange}
              />
            )}

            {/* KPI Metric option */}
            {activeWidget.type === 'kpi' && (
              <div>
                <label className="block text-[10px] font-bold text-[var(--color-muted)] uppercase mb-1">
                  Selected Metric
                </label>
                <select
                  value={activeWidget.props.metric || 'totalParts'}
                  onChange={(e) => handleUpdateWidgetProps({ metric: e.target.value })}
                  className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none"
                >
                  <option value="totalParts">Total Parts Count</option>
                  <option value="completionRate">Completion Rate (%)</option>
                  <option value="overdueCount">Overdue Count (Red RYG)</option>
                  <option value="pendingValidationCount">Awaiting Validation (Submitted)</option>
                </select>
              </div>
            )}

            {/* Donut Field options */}
            {activeWidget.type === 'donut' && (
              <div>
                <label className="block text-[10px] font-bold text-[var(--color-muted)] uppercase mb-1">
                  Target Field Binding
                </label>
                <select
                  value={activeWidget.props.field || 'ryg'}
                  onChange={(e) => handleUpdateWidgetProps({ field: e.target.value })}
                  className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none"
                >
                  <option value="ryg">RYG status (Red/Yellow/Green)</option>
                  <option value="type">Applicability type (New Part/ECN)</option>
                  <option value="validationState">Approval validation state</option>
                  {selectedActivityId !== 'overview' &&
                    activity?.fields
                      .filter((f) => f.type === 'dropdown')
                      .map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                </select>
              </div>
            )}

            {/* StackedBar properties */}
            {activeWidget.type === 'stackedBar' && (
              <>
                <div className="bg-accent-soft border border-[#bfdbfe] rounded p-2.5 text-xxs text-ink-muted leading-relaxed">
                  This older widget can only stack by Approval state or RYG. To stack by any field (for example Drawing
                  availability by Model), convert it to a custom chart.
                  <button
                    onClick={() => handleConvertStackedBar()}
                    className="mt-1.5 block bg-primary text-white rounded px-2.5 py-1 font-medium hover:bg-[#1a43c9]"
                  >
                    Convert to custom chart
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-muted)] uppercase mb-1">
                    Value Field (Bar Heights)
                  </label>
                  <select
                    value={activeWidget.props.field || 'validationState'}
                    onChange={(e) => handleUpdateWidgetProps({ field: e.target.value })}
                    className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none"
                  >
                    <option value="validationState">Approval State stacks</option>
                    <option value="ryg">RYG status stacks</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-muted)] uppercase mb-1">
                    Group By (X Axis)
                  </label>
                  <select
                    value={activeWidget.props.groupBy || 'vendorName'}
                    onChange={(e) => handleUpdateWidgetProps({ groupBy: e.target.value })}
                    className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none"
                  >
                    <option value="vendorName">Supplier / Vendor Code</option>
                    <option value="model">Vehicle Program Model</option>
                    <option value="department">Assigned Tech Department</option>
                    <option value="milestone">Milestone</option>
                    <option value="section">Section</option>
                  </select>
                </div>
              </>
            )}

            {/* Gauge Field properties */}
            {activeWidget.type === 'gauge' && (
              <div>
                <label className="block text-[10px] font-bold text-[var(--color-muted)] uppercase mb-1">
                  Accuracy/Percent Field
                </label>
                <select
                  value={activeWidget.props.field || 'accuracy'}
                  onChange={(e) => handleUpdateWidgetProps({ field: e.target.value })}
                  className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none"
                >
                  <option value="accuracy">Accuracy Percent</option>
                  {selectedActivityId !== 'overview' &&
                    activity?.fields
                      .filter((f) => f.type === 'percent' || f.type === 'number')
                      .map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                </select>
              </div>
            )}

            {/* Helper notes */}
            <div className="bg-surface border border-border p-2.5 rounded text-xxs text-muted mt-2 leading-relaxed">
              <strong><FbIcon name="lightbulb" size={14} className="mr-1" />Widget Layout:</strong> Drag to position or grab the tiny bottom-right handle to resize cards. Values refresh live against global filters.
            </div>

            {/* Duplicate & Delete Buttons */}
            <div className="border-t border-border pt-3 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => handleDuplicateWidget(activeWidget)}
              >
                Duplicate
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={() => handleRemoveWidget(activeWidget.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE NAMED VIEW MODAL POPUP */}
      {showSaveViewModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-xl p-5 w-96 max-w-full animate-scale-in">
            <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">Save Dashboard as Named View</h3>
            <p className="text-xs text-[var(--color-muted)] mb-3 leading-relaxed">
              This layout state, custom added widgets, and properties configuration will be saved as a view profile.
            </p>
            <input
              type="text"
              placeholder="e.g. Nippon Progress, ECN Focus View"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded px-3 py-2 text-xs bg-white text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] font-medium mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveViewSubmit()
              }}
            />
            <div className="flex justify-end gap-2 text-xs">
              <Button variant="secondary" onClick={() => { setShowSaveViewModal(false); setNewViewName('') }}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveViewSubmit} disabled={!newViewName.trim()}>
                Save View
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FLOAT MESSAGE TOAST */}
      {toastMessage && (
        <div className="fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-[#101828]/95 backdrop-blur-xs text-white text-xs px-4 py-2.5 rounded-lg shadow-lg z-50 flex items-center gap-2 animate-slide-up">
          <span className="text-primary/60">ℹ</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <CrossActivityCreator
        open={crossCreatorOpen}
        onClose={() => setCrossCreatorOpen(false)}
        onCreate={(draft) => {
          addCrossDashboard({ ...draft, createdBy: currentPersona })
          setCrossCreatorOpen(false)
        }}
      />
    </div>
  )
}
