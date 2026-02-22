// barber_state.state values → display label + colour + glow
const STATUS_CONFIG: Record<string, { label: string; badge: string; glow: string }> = {
  AVAILABLE: { label: 'READY',    badge: 'bg-emerald-500 text-white',      glow: 'shadow-emerald-500/30' },
  IN_CHAIR:  { label: 'BUSY',     badge: 'bg-amber-500  text-white',       glow: 'shadow-amber-500/30'   },
  ON_BREAK:  { label: 'ON BREAK', badge: 'bg-blue-500   text-white',       glow: 'shadow-blue-500/30'    },
  CLEANUP:   { label: 'BUSY',     badge: 'bg-amber-500  text-white',       glow: 'shadow-amber-500/30'   },
  OFF:       { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300',    glow: 'shadow-black/40'        },
  OTHER:     { label: 'OFF',      badge: 'bg-zinc-600   text-zinc-300',    glow: 'shadow-black/40'        },
}

function formatNextAppt(iso: string | null): string {
  if (!iso) return 'No Appts Today'
  const appt = new Date(iso)
  const now = new Date()
  const time = appt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  if (appt.toDateString() === now.toDateString()) return `Next Appt: ${time}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (appt.toDateString() === tomorrow.toDateString()) return `Next Appt: Tomorrow ${time}`
  return `Next Appt: ${appt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`
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
  const apptText = formatNextAppt(nextAppointmentAt)

  return (
    <div
      className={`relative w-36 h-56 rounded-xl overflow-hidden flex-shrink-0 shadow-xl ${cfg.glow} bg-zinc-900 ring-1 ring-white/10`}
    >
      {/* Photo — fills entire card; transparent PNG stands against dark bg */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="absolute inset-0 w-full h-full object-contain object-bottom"
        />
      ) : (
        /* Fallback initials */
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-zinc-400 text-4xl font-bold select-none">
            {firstName.charAt(0)}{lastName.charAt(0)}
          </span>
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />

      {/* Name + appointment info */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 z-10">
        <p className="text-white font-bold text-sm leading-tight tracking-wide">{displayName}</p>
        <p className="text-zinc-300 text-xs mt-0.5 leading-tight">{apptText}</p>
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
