import { Icon as FbIcon } from '../../components/Icon'
import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  options: { value: string; label?: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}

/** Filter dropdown that lets several values be ticked at once. Nothing ticked = no filter. */
export function MultiSelect({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-9 min-w-[130px] items-center justify-between gap-2 rounded-lg border px-3 text-[11px] ${
          selected.length ? 'border-[var(--color-accent)] bg-[#eef4ff] text-[var(--color-accent)]' : 'border-[var(--color-border)] bg-[#f9fafb] text-[#344054]'
        }`}
      >
        <span className="truncate">
          {label}
          {selected.length > 0 && <strong> · {selected.length}</strong>}
        </span>
        <FbIcon name="chevron-down" size={14} />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute z-30 mt-1 max-h-64 min-w-[200px] overflow-auto rounded-lg border border-[var(--color-border)] bg-white p-1.5 shadow-lg">
          {options.length === 0 && <div className="px-2 py-1.5 text-[11px] text-[var(--color-muted)]">No values</div>}
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-[var(--color-surface)]">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>{o.label ?? o.value}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)]">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
