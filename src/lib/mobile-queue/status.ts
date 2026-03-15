const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export interface BarberStatusInput {
  status: string
  busy_reason?: string | null
  free_at?: string | null
  blocked_until?: string | null
  off_label?: string | null
}

export function getBarberStatusText(barber: BarberStatusInput): string {
  if (barber.status === 'FREE') return 'Available Now'

  if (barber.status === 'BUSY' && barber.busy_reason === 'appointment' && barber.free_at) {
    return `Ready at ${timeFmt.format(new Date(barber.free_at))}`
  }

  // API returns UNAVAILABLE (not BUSY) for blocked barbers
  if (barber.status === 'UNAVAILABLE' && barber.busy_reason === 'blocked' && barber.blocked_until) {
    return `Unavailable until ${timeFmt.format(new Date(barber.blocked_until))}`
  }

  if (barber.status === 'UNAVAILABLE' || barber.status === 'BUSY') {
    return 'Unavailable'
  }

  if (barber.status === 'OFF') {
    return barber.off_label ?? 'Off'
  }

  return 'Unavailable'
}

export type StatusColor = 'emerald' | 'amber' | 'red' | 'zinc'

export function getBarberStatusColor(status: string): StatusColor {
  switch (status) {
    case 'FREE':        return 'emerald'
    case 'BUSY':        return 'amber'
    case 'UNAVAILABLE': return 'red'
    case 'OFF':         return 'zinc'
    default:            return 'zinc'
  }
}
