// barber_state.state values → display label + colour
const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  AVAILABLE: { label: 'READY',     classes: 'bg-emerald-500 text-white' },
  IN_CHAIR:  { label: 'BUSY',      classes: 'bg-amber-500  text-white' },
  ON_BREAK:  { label: 'ON BREAK',  classes: 'bg-blue-500   text-white' },
  CLEANUP:   { label: 'BUSY',      classes: 'bg-amber-500  text-white' },
  OFF:       { label: 'OFF',       classes: 'bg-zinc-600   text-zinc-300' },
  OTHER:     { label: 'OFF',       classes: 'bg-zinc-600   text-zinc-300' },
}

function formatNextAppt(iso: string | null): string {
  if (!iso) return 'No upcoming appts'
  const appt = new Date(iso)
  const now = new Date()
  const time = appt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  if (appt.toDateString() === now.toDateString()) return `Next: ${time}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (appt.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`
  return `${appt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`
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
    <div className="relative w-44 flex flex-col">
      {/* Status badge — top-right corner */}
      <div className="absolute top-3 right-3 z-10">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tracking-wide ${cfg.classes}`}
        >
          {cfg.label}
        </span>
      </div>

      {/* Photo area — no background; transparent PNG floats freely */}
      <div className="relative h-52 flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="absolute bottom-0 left-0 w-full h-full object-contain object-bottom"
            style={{ background: 'transparent' }}
          />
        ) : (
          /* Fallback initials circle when no photo */
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-2xl font-bold select-none">
            {firstName.charAt(0)}
            {lastName.charAt(0)}
          </div>
        )}
      </div>

      {/* Info strip */}
      <div className="bg-zinc-800 rounded-2xl border border-zinc-700 shadow-2xl px-4 py-3">
        <p className="text-white font-bold text-base leading-tight">{displayName}</p>
        <p className="text-zinc-400 text-xs mt-0.5">{apptText}</p>
      </div>
    </div>
  )
}
