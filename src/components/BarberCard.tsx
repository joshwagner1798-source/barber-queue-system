// barber_state.state values → display label + colour + glow
const STATUS_CONFIG: Record<string, { label: string; badge: string; glow: string }> = {
  AVAILABLE: { label: 'READY',    badge: 'bg-emerald-500 text-white',   glow: 'shadow-emerald-500/30' },
  IN_CHAIR:  { label: 'BUSY',     badge: 'bg-amber-500  text-white',    glow: 'shadow-amber-500/30'   },
  ON_BREAK:  { label: 'ON BREAK', badge: 'bg-blue-500   text-white',    glow: 'shadow-blue-500/30'    },
  CLEANUP:   { label: 'BUSY',     badge: 'bg-amber-500  text-white',    glow: 'shadow-amber-500/30'   },
  OFF:       { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300', glow: 'shadow-black/40'       },
  OTHER:     { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300', glow: 'shadow-black/40'       },
}

/**
 * Returns { label, time } so we can style them independently.
 * label = "Next Appt:" or null (no-appt case)
 * time  = "4:00 PM", "Tomorrow 4:00 PM", "Mar 5 4:00 PM", or "No Appts Today"
 */
function parseNextAppt(iso: string | null): { label: string | null; time: string } {
  if (!iso) return { label: null, time: 'No Appts Today' }
  const appt = new Date(iso)
  const now = new Date()
  const time = appt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  if (appt.toDateString() === now.toDateString()) {
    return { label: 'Next Appt:', time }
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (appt.toDateString() === tomorrow.toDateString()) {
    return { label: 'Next Appt:', time: `Tomorrow ${time}` }
  }
  const date = appt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { label: 'Next Appt:', time: `${date} ${time}` }
}

interface Props {
  firstName: string
  lastName: string
  avatarUrl: string | null
  /** barber_state.state — AVAILABLE | IN_CHAIR | ON_BREAK | CLEANUP | OFF | OTHER */
  status: string
  /** ISO timestamp from provider_appointments.start_at, or null */
  nextAppointmentAt: string | null
}

export function BarberCard({
  firstName,
  lastName,
  avatarUrl,
  status,
  nextAppointmentAt,
}: Props) {
  const displayName = `${firstName} ${lastName.charAt(0)}.`
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.OFF
  const { label, time } = parseNextAppt(nextAppointmentAt)

  return (
    <div
      className={`relative w-36 h-60 rounded-xl overflow-hidden flex-shrink-0 shadow-xl ${cfg.glow} bg-zinc-900 ring-1 ring-white/10`}
    >
      {/* Photo — full-bleed, covers card edge to edge */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-zinc-400 text-4xl font-bold select-none">
            {firstName.charAt(0)}{lastName.charAt(0)}
          </span>
        </div>
      )}

      {/* Bottom gradient — tall enough for two lines of text */}
      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

      {/* Name + appointment overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 z-10">
        <p className="text-white font-bold text-sm leading-tight tracking-wide mb-1">{displayName}</p>
        {label ? (
          <>
            <p className="text-zinc-400 text-xs leading-none">{label}</p>
            <p className="text-amber-300 font-black text-base leading-tight tracking-wide">{time}</p>
          </>
        ) : (
          <p className="text-zinc-400 font-semibold text-xs leading-tight">{time}</p>
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
