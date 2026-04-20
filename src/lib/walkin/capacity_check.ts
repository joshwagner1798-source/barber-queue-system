export type CapacityResult =
  | { fits: true; windowMinutes: number; nextCommitmentAt: Date | null }
  | {
      fits: false
      windowMinutes: number
      reason: 'appointment_too_soon' | 'shop_closing' | 'no_window'
      nextCommitmentAt: Date | null
    }

/**
 * Determines whether a barber can start a walk-in right now and finish
 * before their next hard commitment (appointment, block, or shop close).
 *
 * Formula: windowMinutes > estimatedDuration + transitionBuffer
 *
 * Callers must compute nextCommitmentAt as:
 *   min(nextAppointmentAt, nextBlockAt, shopCloseAt) — whichever comes first.
 *
 * @param now               Current time
 * @param nextCommitmentAt  Earliest upcoming commitment, or null if none today
 * @param estimatedDuration Walk-in service duration in minutes (from getWalkinDuration)
 * @param transitionBuffer  Cleanup/prep minutes between services (from shop_settings)
 */
export function canFitWalkin(
  now: Date,
  nextCommitmentAt: Date | null,
  estimatedDuration: number,
  transitionBuffer: number = 5,
): CapacityResult {
  if (nextCommitmentAt === null) {
    return { fits: true, windowMinutes: Infinity, nextCommitmentAt: null }
  }

  const windowMinutes = (nextCommitmentAt.getTime() - now.getTime()) / 60_000
  const required = estimatedDuration + transitionBuffer

  if (windowMinutes > required) {
    return { fits: true, windowMinutes, nextCommitmentAt }
  }

  return {
    fits: false,
    windowMinutes,
    reason: 'appointment_too_soon',
    nextCommitmentAt,
  }
}
