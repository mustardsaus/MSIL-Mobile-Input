import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { getReleaseState } from '../../engine'
import { fmtDate, partInScope } from '../scope'
import { useExceptionData } from '../exceptions/useExceptionData'

interface Note {
  key: string
  tag: string
  title: string
  sub: string
  to: string
}

const TAG_STYLE: Record<string, string> = {
  Deviation: 'bg-amber-100 text-amber-800',
  Action: 'bg-indigo-100 text-indigo-800',
  Delay: 'bg-red-100 text-red-800',
  Release: 'bg-blue-100 text-blue-800'
}

/**
 * Bell in the header: what needs the current role right now (deviation decisions, actions, delay reasons and the
 * release handshake). It is a live in-app list, not a push or email notification.
 */
export function NotificationBell() {
  const { parts, partReleases, partAcks } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const { attention } = useExceptionData()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const notes = useMemo<Note[]>(() => {
    const out: Note[] = []
    const live = parts.filter((p) => !p.supersededBy && partInScope(p, currentPersona))
    const states = live.map((p) => getReleaseState(p.partNo, partReleases, partAcks))
    if (currentPersona === 'Vendor') {
      const n = states.filter((s) => s === 'Released').length
      if (n) out.push({ key: 'rel-v', tag: 'Release', title: `${n} part${n === 1 ? '' : 's'} released to you`, sub: 'Acknowledge or return them', to: '/mywork' })
    } else if (currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM') {
      const n = states.filter((s) => s === 'Returned').length
      if (n) out.push({ key: 'rel-p', tag: 'Release', title: `${n} part${n === 1 ? '' : 's'} returned by the vendor`, sub: 'Fix the details and release again', to: '/mywork' })
    }
    for (const a of attention.slice(0, 8)) {
      out.push({
        key: a.type + a.key, tag: a.type, title: a.title, sub: `${a.note}${a.due ? ' · ' + fmtDate(a.due) : ''}`,
        to: a.rowId && a.partNo ? `/activities/${a.rowId}?part=${encodeURIComponent(a.partNo)}` : `/exceptions?tab=${a.tab}`
      })
    }
    return out
  }, [parts, partReleases, partAcks, currentPersona, attention])
  const count = notes.length + Math.max(0, attention.length - 8)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications, ${count} waiting`}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white bg-white/80 shadow-[0_4px_14px_rgba(80,90,160,.10)] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#344054" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white">{count > 99 ? '99+' : count}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[46px] z-50 w-[360px] max-w-[92vw] rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 pb-1 pt-1">
            <span className="text-[13px] font-semibold text-[var(--color-text)]">Needs your attention</span>
            <Link to="/exceptions" onClick={() => setOpen(false)} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">Exception Management ›</Link>
          </div>
          {notes.length === 0 ? (
            <p className="m-0 px-2 py-6 text-center text-[12px] text-[var(--color-muted)]">Nothing is waiting for you.</p>
          ) : (
            <div className="max-h-[360px] overflow-auto">
              {notes.map((n) => (
                <Link
                  key={n.key}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-[var(--color-secondary)] focus:bg-[var(--color-secondary)] focus:outline-none"
                >
                  <span className={`whitespace-nowrap mt-0.5 flex-none rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${TAG_STYLE[n.tag] ?? 'bg-slate-100 text-slate-700'}`}>{n.tag}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-[var(--color-text)]">{n.title}</span>
                    <span className="block truncate text-[10.5px] text-[var(--color-muted)]">{n.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
