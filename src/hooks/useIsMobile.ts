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

