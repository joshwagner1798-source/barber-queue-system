'use client'

import { useEffect, useState } from 'react'

/**
 * Returns true if animations should run.
 * Disabled when:
 *  - prefers-reduced-motion media query is active, OR
 *  - the URL contains ?motion=off
 */
export function useMotionEnabled(): boolean {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const params = new URLSearchParams(window.location.search)

    function evaluate() {
      setEnabled(!mq.matches && params.get('motion') !== 'off')
    }

    evaluate()
    mq.addEventListener('change', evaluate)
    return () => mq.removeEventListener('change', evaluate)
  }, [])

  return enabled
}
