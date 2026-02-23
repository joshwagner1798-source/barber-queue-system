'use client'

import { useEffect, useState } from 'react'

const STATUS_CONFIG: Record<string, { label: string; badge: string; glow: string }> = {
  AVAILABLE: { label: 'READY',    badge: 'bg-emerald-500 text-white',   glow: 'shadow-emerald-500/30' },
  IN_CHAIR:  { label: 'BUSY',     badge: 'bg-amber-500  text-white',    glow: 'shadow-amber-500/30'   },
  ON_BREAK:  { label: 'ON BREAK', badge: 'bg-blue-500   text-white',    glow: 'shadow-blue-500/30'    },
  BLOCKED:   { label: 'BLOCKED',  badge: 'bg-red-600    text-white',    glow: 'shadow-red-600/40'     },
  CLEANUP:   { label: 'BUSY',     badge: 'bg-amber-500  text-white',    glow: 'shadow-amber-500/30'   },
  OFF:       { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300', glow: 'shadow-black/40'       },
  OTHER:     { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300', glow: 'shadow-black/40'       },
}

const nyTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const nyDateFmt = new Intl.DateTimeFormat('en-CA', {
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
  const [yr, mo, dy] = todayStr.split('-').map(Number)
  const tomorrowStr = nyDateFmt.format(new Date(Date.UTC(yr, mo - 1, dy + 1)))
  const time = nyTimeFmt.format(d)
  if (dDate === todayStr)    return time
  if (dDate === tomorrowStr) return `Tom ${time}`
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
  status: string
  nextApptAt: string | null
  nextClientName?: string | null
  busyReason?: 'appointment' | 'blocked' | null
  /** Pre-computed note for the current block (always 'Blocked' if no note) */
  blockedNoteShort?: string | null
  /** ISO end of current appointment/block — drives countdown for IN_CHAIR/BLOCKED */
  freeAt?: string | null
  /** Label for OFF state, e.g. "Off until Wed 10:20 AM" */
  offLabel?: string | null
  className?: string
  imageClassName?: string
}

export function BarberCard({
  firstName,
  lastName,
  avatarUrl,
  status,
  nextApptAt,
  nextClientName = null,
  busyReason = null,
  blockedNoteShort = null,
  freeAt = null,
  offLabel = null,
  className,
  imageClassName,
}: Props) {
  const shortName = `${firstName} ${lastName.charAt(0)}.`
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.OFF

  // Live countdown — used for both IN_CHAIR and BLOCKED
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
  const isBlocked = busyReason === 'blocked'
  const isOff     = status === 'OFF'

  const apptTime = nextApptAt ? formatTime(nextApptAt) : null

  // Next appointment line — shown always (even when blocked or off)
  const nextApptText = apptTime
    ? `Next ${apptTime}${nextClientName ? ` (${nextClientName})` : ''}`
    : 'No appts'

  return (
    <div
      className={`relative flex flex-col rounded-xl ring-1 ring-white/10 shadow-xl ${cfg.glow} bg-zinc-900${className ? ` ${className}` : ''}`}
    >
      {/* ── Photo section (overflow-hidden confined here only) ── */}
      <div className="relative overflow-hidden rounded-t-xl flex-1 min-h-0">
        {/* Per-card status glow */}
        {status === 'AVAILABLE' && (
          <div className="absolute inset-0 bg-emerald-500/20 animate-pulse pointer-events-none z-0" />
        )}
        {status === 'IN_CHAIR' && (
          <div className="absolute inset-0 bg-amber-500/20 animate-pulse pointer-events-none z-0" />
        )}
        {status === 'ON_BREAK' && (
          <div className="absolute inset-0 bg-blue-500/15 pointer-events-none z-0" />
        )}
        {status === 'BLOCKED' && (
          <div className="absolute inset-0 bg-red-600/30 animate-pulse pointer-events-none z-0" />
        )}

        {/* Photo */}
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
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

        {/* Status badge — top-right, inside photo area */}
        <div className="absolute top-2 right-2 z-10">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tracking-wide ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* ── Text section — NO overflow-hidden, text never clipped ── */}
      <div className="px-3 pt-2 pb-3 bg-black/90 rounded-b-xl">
        {/* Main line: "Josh W. — Next 2:30 PM (Tom)"  or  "Josh W. — No appts" */}
        <p className="text-white font-black text-lg leading-snug break-words whitespace-normal">
          {shortName}{' '}
          <span className="font-normal text-white/40">—</span>{' '}
          <span className={`font-semibold ${isOff ? 'text-zinc-400' : 'text-amber-300'}`}>
            {nextApptText}
          </span>
        </p>

        {/* Blocked note — only when actively blocked */}
        {isBlocked && blockedNoteShort && (
          <p className="text-red-400 text-sm font-bold break-words leading-tight mt-0.5">
            {blockedNoteShort}
          </p>
        )}

        {/* Off label */}
        {isOff && offLabel && (
          <p className="text-zinc-400 text-sm leading-tight mt-0.5 break-words">
            {offLabel}
          </p>
        )}

        {/* Live countdown — shown for BLOCKED and IN_CHAIR */}
        {countdownText && !isAvailableNow ? (
          <p className={`font-bold text-xs tabular-nums leading-tight mt-0.5 ${isBlocked ? 'text-red-300' : 'text-amber-300'}`}>
            {countdownText}
          </p>
        ) : isAvailableNow ? (
          <p className="text-emerald-400 font-bold text-xs leading-tight mt-0.5">Available Now</p>
        ) : null}
      </div>
    </div>
  )
}
