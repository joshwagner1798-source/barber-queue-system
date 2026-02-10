import type { Walkin, BarberState } from '@/types/database'

type WalkinStatus = Walkin['status']
type BarberStateValue = BarberState['state']

export const VALID_WALKIN_TRANSITIONS: Record<WalkinStatus, WalkinStatus[]> = {
  WAITING: ['CALLED', 'REMOVED'],
  CALLED: ['IN_SERVICE', 'NO_SHOW', 'WAITING', 'REMOVED'],
  IN_SERVICE: ['DONE', 'REMOVED'],
  NO_SHOW: [],
  DONE: [],
  REMOVED: [],
}

export function validateWalkinTransition(
  from: WalkinStatus,
  to: WalkinStatus
): { valid: boolean; error?: string } {
  const allowed = VALID_WALKIN_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    return {
      valid: false,
      error: `Invalid transition from ${from} to ${to}`,
    }
  }
  return { valid: true }
}

export const VALID_BARBER_STATES: Set<BarberStateValue> = new Set([
  'AVAILABLE',
  'IN_CHAIR',
  'ON_BREAK',
  'OFF',
  'CLEANUP',
  'OTHER',
])
