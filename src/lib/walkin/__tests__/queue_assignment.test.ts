import { describe, it, expect } from 'vitest'
import { findNextWalkinForBarber } from '../queue_assignment'
import {
  BARBER_A_ID,
  BARBER_B_ID,
  BARBER_C_ID,
  SERVICE_CUT,
  NOW,
  walkin,
  appointment,
  availableBarber,
  busyBarber,
  EMPTY_BARBER_SERVICES,
} from './fixtures'

const SERVICES = [SERVICE_CUT]

describe('findNextWalkinForBarber', () => {
  // -----------------------------------------------------------------------
  // Scenario 5: PREFERRED barber chosen
  // -----------------------------------------------------------------------
  it('assigns PREFERRED walk-in to their chosen barber (priority over position)', () => {
    const queue = [
      walkin(1, { preference_type: 'ANY' }),
      walkin(2, { preference_type: 'PREFERRED', preferred_barber_id: BARBER_A_ID }),
    ]

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      [], // no upcoming appointments
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result).not.toBeNull()
    expect(result!.walkin_id).toBe('walkin-2')
    expect(result!.barber_id).toBe(BARBER_A_ID)
  })

  it('skips PREFERRED walk-in waiting for a different barber', () => {
    const queue = [
      walkin(1, { preference_type: 'PREFERRED', preferred_barber_id: BARBER_B_ID }),
      walkin(2, { preference_type: 'ANY' }),
    ]

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      [],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result).not.toBeNull()
    expect(result!.walkin_id).toBe('walkin-2') // skipped walkin-1
  })

  // -----------------------------------------------------------------------
  // Scenario 6: FIFO when no preference
  // -----------------------------------------------------------------------
  it('assigns first-in-line ANY walk-in (FIFO)', () => {
    const queue = [
      walkin(1, { preference_type: 'ANY' }),
      walkin(2, { preference_type: 'ANY' }),
      walkin(3, { preference_type: 'ANY' }),
    ]

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      [],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result).not.toBeNull()
    expect(result!.walkin_id).toBe('walkin-1')
    expect(result!.walkin_position).toBe(1)
  })

  it('respects position order even if array is unordered', () => {
    const queue = [
      walkin(3, { preference_type: 'ANY' }),
      walkin(1, { preference_type: 'ANY' }),
      walkin(2, { preference_type: 'ANY' }),
    ]

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      [],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result!.walkin_id).toBe('walkin-1')
  })

  // -----------------------------------------------------------------------
  // Appointment conflict blocks assignment
  // -----------------------------------------------------------------------
  it('returns null when appointment conflict exists', () => {
    const queue = [walkin(1)]
    // Appointment in 15 min — service takes 30 min + 5 min buffer = 35 > 15
    const upcomingAppt = appointment(BARBER_A_ID, 15, 30)

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      [upcomingAppt],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result).toBeNull()
  })

  it('allows assignment when appointment is far enough away', () => {
    const queue = [walkin(1)]
    // Appointment in 60 min — service takes 30 + 5 = 35 < 60
    const farAppt = appointment(BARBER_A_ID, 60, 30)

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      [farAppt],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result).not.toBeNull()
    expect(result!.walkin_id).toBe('walkin-1')
  })

  // -----------------------------------------------------------------------
  // Barber not available → no assignment
  // -----------------------------------------------------------------------
  it('returns null when barber is not available', () => {
    const queue = [walkin(1)]

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', null),
      queue,
      [],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Empty queue → no assignment
  // -----------------------------------------------------------------------
  it('returns null when queue is empty', () => {
    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      [],
      [],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result).toBeNull()
  })

  // -----------------------------------------------------------------------
  // FASTEST preference treated like ANY
  // -----------------------------------------------------------------------
  it('assigns FASTEST walk-in same as ANY', () => {
    const queue = [walkin(1, { preference_type: 'FASTEST' })]

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      [],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      NOW,
    )

    expect(result).not.toBeNull()
    expect(result!.walkin_id).toBe('walkin-1')
  })

  // -----------------------------------------------------------------------
  // Service duration uses override
  // -----------------------------------------------------------------------
  it('uses barber-specific duration override', () => {
    const queue = [walkin(1)]
    const barberSvc = [{
      id: 'bs-1',
      barber_id: BARBER_A_ID,
      service_id: SERVICE_CUT.id,
      price_override: null,
      duration_override: 15, // faster barber
      created_at: NOW.toISOString(),
    }]

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      [],
      SERVICES,
      barberSvc,
      NOW,
    )

    expect(result).not.toBeNull()
    expect(result!.service_duration_minutes).toBe(15)
  })
})
