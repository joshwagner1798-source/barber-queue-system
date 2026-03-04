'use client'

import { useEffect, useState } from 'react'

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

function tick(): string {
  return fmt.format(new Date())
}

export function NewYorkClock() {
  const [time, setTime] = useState<string>('')

  useEffect(() => {
    setTime(tick())
    const id = setInterval(() => setTime(tick()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!time) return null

  return (
    <p className="text-6xl font-bold text-white tabular-nums tracking-tight drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">
      {time}
    </p>
  )
}
