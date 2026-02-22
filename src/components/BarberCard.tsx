'use client'

import { useEffect, useState } from 'react'

// barber_state.state values → display label + colour + glow
const STATUS_CONFIG: Record<string, { label: string; badge: string; glow: string }> = {
  AVAILABLE: { label: 'READY',    badge: 'bg-emerald-500 text-white',   glow: 'shadow-emerald-500/30' },
  IN_CHAIR:  { label: 'BUSY',     badge: 'bg-amber-500  text-white',    glow: 'shadow-amber-500/30'   },
  ON_BREAK:  { label: 'ON BREAK', badge: 'bg-blue-500   text-white',    glow: 'shadow-blue-500/30'    },
  CLEANUP:   { label: 'BUSY',     badge: 'bg-amber-500  text-white',    glow: 'shadow-amber-500/30'   },
  OFF:       { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300', glow: 'shadow-black/40'       },
  OTHER:     { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300', glow: 'shadow-black/40'       },
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (d.toDateString() === now.toDateString()) return time
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`
}

function formatCountdown(targetIso: string): string {
  const diffMs = new Date(targetIso).getTime() - Date.now()
  if (diffMs <= 0) return 'Available Now'
  const total = Math.floor(diffMs / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `Ready in ${h}h ${m}m ${s}s`
  if (m > 0) return `Ready in ${m}m ${s}s`
  return `Ready in ${s}s`
}

interface Props {
  firstName: string
  lastName: string
  avatarUrl: string | null
  /** barber_state.state — AVAILABLE | IN_CHAIR | ON_BREAK | CLEANUP | OFF | OTHER */
  status: string
  /** ISO timestamp of next scheduled item (appointment or block) */
  nextAppointmentAt: string | null
  /** Whether the next item is a block or a regular appointment */
  nextKind?: 'APPT' | 'BLOCK' | null
  /** Notes for the blocked time, if applicable */
  nextNotes?: string | null
  /** ISO timestamp when current appointment ends — drives live countdown */
  freeAt?: string | null
  /** Extra classes applied to the root card div */
  className?: string
  /** Extra classes applied to the <img> element */
  imageClassName?: string
}

export function BarberCard({
  firstName,
  lastName,
  avatarUrl,
  status,
  nextAppointmentAt,
  nextKind = null,
  nextNotes = null,
  freeAt = null,
  className,
  imageClassName,
}: Props) {
  const shortName = `${firstName} ${lastName.charAt(0)}.`
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.OFF

  // Live countdown — ticks every second when freeAt is set
  const [countdownText, setCountdownText] = useState<string | null>(
    freeAt ? formatCountdown(freeAt) : null,
  )
  useEffect(() => {
    if (!freeAt) { setCountdownText(null); return }
    setCountdownText(formatCountdown(freeAt))
    const id = setInterval(() => setCountdownText(formatCountdown(freeAt)), 1000)
    return () => clearInterval(id)
  }, [freeAt])

  const isAvailableNow = status === 'AVAILABLE' || countdownText === 'Available Now'

  // Build the "next time" label shown next to the name
  let nextLabel: string
  if (nextAppointmentAt) {
    const time = formatTime(nextAppointmentAt)
    nextLabel = nextKind === 'BLOCK' ? `BLOCKED ${time}` : time
  } else {
    nextLabel = 'No Appts'
  }

  return (
    <div
      className={`relative w-44 h-72 rounded-xl overflow-hidden flex-shrink-0 shadow-xl ${cfg.glow} bg-zinc-900 ring-1 ring-white/10${className ? ` ${className}` : ''}`}
    >
      {/* Photo — full-bleed */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={shortName}
          className={`absolute inset-0 w-full h-full object-cover object-top${imageClassName ? ` ${imageClassName}` : ''}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-zinc-400 text-4xl font-bold select-none">
            {firstName.charAt(0)}{lastName.charAt(0)}
          </span>
        </div>
      )}

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-black via-black/85 to-transparent pointer-events-none" />

      {/* Info overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 z-10">
        {/* Primary: Name — next time */}
        <p className="text-white font-black text-xl leading-tight tracking-wide">
          {shortName}
          <span className={`${nextKind === 'BLOCK' ? 'text-orange-400' : 'text-amber-300'}`}>
            {' '}— {nextLabel}
          </span>
        </p>

        {/* Block notes if present */}
        {nextKind === 'BLOCK' && nextNotes && (
          <p className="text-orange-300 text-xs mt-0.5 leading-tight opacity-90">{nextNotes}</p>
        )}

        {/* Countdown when busy */}
        {countdownText && !isAvailableNow && (
          <p className="text-amber-300 font-bold text-sm tabular-nums mt-1 leading-tight">
            {countdownText}
          </p>
        )}
        {isAvailableNow && (
          <p className="text-emerald-400 font-bold text-sm mt-1 leading-tight">Available Now</p>
        )}
      </div>

      {/* Status badge — top-right */}
      <div className="absolute top-2 right-2 z-10">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tracking-wide ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>
    </div>
  )
}
