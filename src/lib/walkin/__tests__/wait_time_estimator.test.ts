import { describe, it, expect } from 'vitest'
import { estimateQueue } from '../wait_time_estimator'
import {
  BARBER_A_ID,
  BARBER_B_ID,
  SERVICE_CUT,
  NOW,
  NOW_ISO,
  walkin,
  availableBarber,
  busyBarber,
  shopAvailability,
  EMPTY_BARBER_SERVICES,
} from './fixtures'

const SERVICES = [SERVICE_CUT]

describe('estimateQueue', () => {
  // -----------------------------------------------------------------------
  // Wait time = 0 when barber is free
  // -----------------------------------------------------------------------
  it('estimates 0 wait when barber is available', () => {
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
    ])
    const queue = [walkin(1)]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates).toHaveLength(1)
    expect(result.estimates[0].estimated_wait_minutes).toBe(0)
    expect(result.estimates[0].suggested_barber_id).toBe(BARBER_A_ID)
  })

  // -----------------------------------------------------------------------
  // Wait time = time until barber is free
  // -----------------------------------------------------------------------
  it('estimates wait based on barber free_at', () => {
    const freeIn20 = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', freeIn20),
    ])
    const queue = [walkin(1)]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates[0].estimated_wait_minutes).toBe(20)
  })

  // -----------------------------------------------------------------------
  // No barbers → wait = -1
  // -----------------------------------------------------------------------
  it('returns -1 when no barbers are in timeline', () => {
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'OFF', null),
    ])
    // OFF barbers are excluded from the timeline
    const queue = [walkin(1)]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates[0].estimated_wait_minutes).toBe(-1)
    expect(result.estimates[0].suggested_barber_id).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Multiple walk-ins queue up → increasing wait times
  // -----------------------------------------------------------------------
  it('stacks wait times for multiple walk-ins with one barber', () => {
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
    ])
    const queue = [walkin(1), walkin(2), walkin(3)]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates).toHaveLength(3)
    // Person 1: wait = 0, Person 2: wait = 30 (one cut ahead), Person 3: wait = 60
    expect(result.estimates[0].estimated_wait_minutes).toBe(0)
    expect(result.estimates[1].estimated_wait_minutes).toBe(30)
    expect(result.estimates[2].estimated_wait_minutes).toBe(60)
  })

  it('distributes walk-ins across multiple barbers', () => {
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
      availableBarber(BARBER_B_ID, 'Bob'),
    ])
    const queue = [walkin(1), walkin(2), walkin(3)]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    // Person 1: barber A (wait=0), Person 2: barber B (wait=0), Person 3: first free (wait=30)
    expect(result.estimates[0].estimated_wait_minutes).toBe(0)
    expect(result.estimates[1].estimated_wait_minutes).toBe(0)
    expect(result.estimates[2].estimated_wait_minutes).toBe(30)
  })

  // -----------------------------------------------------------------------
  // PREFERRED walk-in waits for specific barber
  // -----------------------------------------------------------------------
  it('preferred walk-in waits for their barber even if another is free sooner', () => {
    const freeIn20 = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
      busyBarber(BARBER_B_ID, 'Bob', 'IN_WALKIN', freeIn20),
    ])
    const queue = [
      walkin(1, { preference_type: 'PREFERRED', preferred_barber_id: BARBER_B_ID }),
    ]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates[0].estimated_wait_minutes).toBe(20)
    expect(result.estimates[0].suggested_barber_id).toBe(BARBER_B_ID)
  })

  // -----------------------------------------------------------------------
  // All wait times are non-negative or -1
  // -----------------------------------------------------------------------
  it('all wait times are >= 0 or exactly -1', () => {
    const freeIn10 = new Date(NOW.getTime() + 10 * 60_000).toISOString()
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', freeIn10),
    ])
    const queue = [walkin(1), walkin(2), walkin(3)]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    for (const est of result.estimates) {
      expect(est.estimated_wait_minutes === -1 || est.estimated_wait_minutes >= 0).toBe(true)
    }
  })

  // -----------------------------------------------------------------------
  // Average wait time
  // -----------------------------------------------------------------------
  it('calculates correct average wait', () => {
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
    ])
    const queue = [walkin(1), walkin(2)]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    // Person 1: 0, Person 2: 30 → avg = 15
    expect(result.average_wait_minutes).toBe(15)
  })

  // -----------------------------------------------------------------------
  // next_available_barber
  // -----------------------------------------------------------------------
  it('reports next available barber', () => {
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
    ])

    const result = estimateQueue(avail, [], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.next_available_barber).not.toBeNull()
    expect(result.next_available_barber!.barber_id).toBe(BARBER_A_ID)
  })

  it('returns null next_available_barber when all barbers OFF', () => {
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'OFF', null),
    ])

    const result = estimateQueue(avail, [], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.next_available_barber).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Empty queue
  // -----------------------------------------------------------------------
  it('returns empty estimates for empty queue', () => {
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
    ])

    const result = estimateQueue(avail, [], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates).toHaveLength(0)
    expect(result.average_wait_minutes).toBe(0)
  })
})
