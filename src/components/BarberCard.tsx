'use client'

import { useEffect, useState } from 'react'

// barber_state.state values → display label + colour
const STATUS_CONFIG: Record<string, { label: string; badge: string; glow: string }> = {
  AVAILABLE: { label: 'READY',    badge: 'bg-emerald-500 text-white',   glow: 'shadow-emerald-500/30' },
  IN_CHAIR:  { label: 'BUSY',     badge: 'bg-amber-500  text-white',    glow: 'shadow-amber-500/30'   },
  ON_BREAK:  { label: 'ON BREAK', badge: 'bg-blue-500   text-white',    glow: 'shadow-blue-500/30'    },
  BLOCKED:   { label: 'BLOCKED',  badge: 'bg-red-600    text-white',    glow: 'shadow-red-600/40'     },
  CLEANUP:   { label: 'BUSY',     badge: 'bg-amber-500  text-white',    glow: 'shadow-amber-500/30'   },
  OFF:       { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300', glow: 'shadow-black/40'       },
  OTHER:     { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300', glow: 'shadow-black/40'       },
}

// Shared Intl formatters — created once, reused on every tick
const nyTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const nyDateFmt = new Intl.DateTimeFormat('en-CA', {
  // en-CA produces YYYY-MM-DD — handy for string comparison
  timeZone: 'America/New_York',
})
const nyMonthDayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
})

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()

  const dDate    = nyDateFmt.format(d)
  const todayStr = nyDateFmt.format(now)

  // Tomorrow in NY: add 1 calendar day to today's NY date
  const [yr, mo, dy] = todayStr.split('-').map(Number)
  const tomorrowStr = nyDateFmt.format(new Date(Date.UTC(yr, mo - 1, dy + 1)))

  const time = nyTimeFmt.format(d)

  if (dDate === todayStr)    return time
  if (dDate === tomorrowStr) return `Tomorrow ${time}`
  return `${nyMonthDayFmt.format(d)} ${time}`
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
  /** ISO timestamp of next scheduled appointment (kind='appointment' only) */
  nextApptAt: string | null
  /** Client first name for the next appointment */
  nextApptClientFirst?: string | null
  /** Whether something is currently running ('appointment' | 'blocked' | null) */
  busyReason?: 'appointment' | 'blocked' | null
  /** Short note label when currently blocked */
  blockedNoteShort?: string | null
  /** ISO timestamp when current appointment/block ends — drives live countdown */
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
  nextApptAt,
  nextApptClientFirst = null,
  busyReason = null,
  blockedNoteShort = null,
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

  const isAvailableNow = countdownText === 'Available Now'

  // ── Build row-2 info pieces ───────────────────────────────────────────────
  const apptTime = nextApptAt ? formatTime(nextApptAt) : null

  return (
    <div
      className={`relative w-44 h-72 rounded-xl overflow-hidden flex-shrink-0 shadow-xl ${cfg.glow} bg-zinc-900 ring-1 ring-white/10${className ? ` ${className}` : ''}`}
    >
      {/* Per-card status glow — clipped by overflow-hidden, can't bleed out */}
      {status === 'AVAILABLE' && (
        <div className="absolute inset-0 bg-emerald-500/20 animate-pulse pointer-events-none" style={{ zIndex: 0 }} />
      )}
      {status === 'IN_CHAIR' && (
        <div className="absolute inset-0 bg-amber-500/20 animate-pulse pointer-events-none" style={{ zIndex: 0 }} />
      )}
      {status === 'ON_BREAK' && (
        <div className="absolute inset-0 bg-blue-500/15 pointer-events-none" style={{ zIndex: 0 }} />
      )}
      {status === 'BLOCKED' && (
        <div className="absolute inset-0 bg-red-600/30 animate-pulse pointer-events-none" style={{ zIndex: 0 }} />
      )}

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
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black via-black/90 to-transparent pointer-events-none" />

      {/* Info overlay — 2 rows */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 z-10">

        {/* Row 1: Barber name */}
        <p className="text-white font-black text-xl leading-tight drop-shadow-lg">
          {shortName}
        </p>

        {/* Row 2: Appointment info */}
        <div className="mt-1 leading-snug drop-shadow-lg text-base font-semibold">
          {busyReason === 'blocked' ? (
            <p className="text-red-400 break-words">
              {blockedNoteShort ? `Blocked: ${blockedNoteShort}` : 'Blocked'}
            </p>
          ) : apptTime ? (
            <p className="text-amber-300">
              {/* "Next 6:00 PM" stays on one piece; client name can wrap after the dash */}
              <span className="whitespace-nowrap text-white/60">Next </span>
              <span className="whitespace-nowrap">{apptTime}</span>
              {nextApptClientFirst && (
                <><span className="whitespace-nowrap"> —</span> {nextApptClientFirst}</>
              )}
            </p>
          ) : (
            <p className="text-zinc-400">No appts</p>
          )}
        </div>

        {/* Countdown */}
        <div className="h-5 mt-1">
          {countdownText && !isAvailableNow ? (
            <p className="text-amber-300 font-bold text-sm tabular-nums leading-tight">
              {countdownText}
            </p>
          ) : isAvailableNow ? (
            <p className="text-emerald-400 font-bold text-sm leading-tight">Available Now</p>
          ) : null}
        </div>
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
