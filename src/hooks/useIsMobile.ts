import { useEffect, useState } from 'react'

/** True below the `lg` breakpoint (1024 px), where the sidebar collapses into the drawer. */
const Q = '(max-width: 1023px)'
export function useIsMobile(): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(Q).matches)
  useEffect(() => {
    const mq = window.matchMedia(Q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}


/**
 * Touch axis lock for scrollable tables: once a drag starts mostly sideways (or mostly up/down), the
 * other axis is frozen until the gesture and its momentum end, so tables never scroll diagonally.
 */
export function useTableAxisLock() {
  useEffect(() => {
    const SEL = '.tbl-sleeve, .table-scroll, .page-sticky-head'
    let box: HTMLElement | null = null
    let x0 = 0, y0 = 0, locked = false, timer = 0
    const reset = (el: HTMLElement) => { el.style.overflowX = ''; el.style.overflowY = '' }
    const start = (e: TouchEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(SEL)
      if (!el) return
      window.clearTimeout(timer)
      if (box && box !== el) reset(box)
      box = el; locked = false
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY
    }
    const move = (e: TouchEvent) => {
      if (!box || locked) return
      const dx = Math.abs(e.touches[0].clientX - x0), dy = Math.abs(e.touches[0].clientY - y0)
      if (dx < 6 && dy < 6) return
      locked = true
      if (dx > dy) box.style.overflowY = 'hidden'
      else box.style.overflowX = 'hidden'
    }
    const end = () => {
      const el = box
      if (!el) return
      // keep the lock through the momentum glide, then restore both axes
      timer = window.setTimeout(() => { reset(el); if (box === el) box = null }, 700)
    }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', end, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
    }
  }, [])
}
