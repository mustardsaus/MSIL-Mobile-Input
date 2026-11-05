import { Link } from 'react-router-dom'

interface PageHeaderProps {
  title: string
  description?: string
  /** Middle breadcrumb segment, e.g. "Modules". */
  section?: string
  /** Last breadcrumb segment; defaults to the title. */
  crumb?: string
  actions?: React.ReactNode
}

/** EPMP page header: "EPMP › Section › Page" breadcrumb, 25px title, grey description, right-aligned actions. */
export function PageHeader({ title, description, section = 'Workspace', crumb, actions }: PageHeaderProps) {
  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[11px] text-[#596579]" aria-label="Breadcrumb">
        <Link to="/" className="hover:underline">EPMP</Link>
        <span aria-hidden="true">›</span>
        <span>{section}</span>
        <span aria-hidden="true">›</span>
        <span className="text-[#344054]" aria-current="page">{crumb ?? title}</span>
      </nav>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[23px] font-semibold leading-8 tracking-[-0.3px] sm:text-[25px]">{title}</h1>
          {description && (
            <p className="mb-0 mt-1 max-w-[620px] text-xs leading-5 text-[var(--color-muted)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&_a]:whitespace-nowrap max-sm:[&_button]:whitespace-nowrap max-sm:[&_label]:whitespace-nowrap">{actions}</div>}
      </div>
    </>
  )
}
