import { describe, it, expect } from 'vitest'
import {
  estimateQueue,
  computeBaseReadyMinutes,
  AVG_WALKIN_MINUTES,
} from '../wait_time_estimator'
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

// ---------------------------------------------------------------------------
// computeBaseReadyMinutes — unit tests (pure function)
// ---------------------------------------------------------------------------

describe('computeBaseReadyMinutes', () => {
  it('returns 0 when at least one barber is available now', () => {
    const result = computeBaseReadyMinutes(
      [availableBarber(BARBER_A_ID, 'Alice')],
      NOW,
    )
    expect(result).toBe(0)
  })

  it('returns minutes until the earliest barber is free', () => {
    const freeIn20 = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const result = computeBaseReadyMinutes(
      [busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', freeIn20)],
      NOW,
    )
    expect(result).toBe(20)
  })

  it('returns minimum across multiple barbers', () => {
    const freeIn20 = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const freeIn35 = new Date(NOW.getTime() + 35 * 60_000).toISOString()
    const result = computeBaseReadyMinutes(
      [
        busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', freeIn35),
        busyBarber(BARBER_B_ID, 'Bob',   'IN_WALKIN', freeIn20),
      ],
      NOW,
    )
    expect(result).toBe(20)
  })

  it('returns 0 when one barber is free even if another is busy', () => {
    const freeIn20 = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const result = computeBaseReadyMinutes(
      [
        availableBarber(BARBER_A_ID, 'Alice'),
        busyBarber(BARBER_B_ID, 'Bob', 'IN_WALKIN', freeIn20),
      ],
      NOW,
    )
    expect(result).toBe(0)
  })

  it('excludes busy barbers with no estimate (spec: treat as not eligible)', () => {
    // BARBER_A is busy, no estimate — must not default to +30
    // BARBER_B is free
    const result = computeBaseReadyMinutes(
      [
        busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', null),
        availableBarber(BARBER_B_ID, 'Bob'),
      ],
      NOW,
    )
    // BARBER_B is free → base = 0, not 30
    expect(result).toBe(0)
  })

  it('returns null when all barbers are busy with no estimate', () => {
    const result = computeBaseReadyMinutes(
      [busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', null)],
      NOW,
    )
    expect(result).toBeNull()
  })

  it('returns null when no barbers exist', () => {
    expect(computeBaseReadyMinutes([], NOW)).toBeNull()
  })

  it('excludes NOT_SCHEDULED and OFF barbers', () => {
    const result = computeBaseReadyMinutes(
      [
        busyBarber(BARBER_A_ID, 'Alice', 'NOT_SCHEDULED', null),
        busyBarber(BARBER_B_ID, 'Bob',   'OFF', null),
      ],
      NOW,
    )
    expect(result).toBeNull()
  })

  it('filters out disabled barbers when walkinEnabledIds is provided', () => {
    // BARBER_A is available but NOT in the walkin-enabled set
    // BARBER_B is busy 15 min but IS walkin-enabled
    const freeIn15 = new Date(NOW.getTime() + 15 * 60_000).toISOString()
    const walkinEnabled = new Set([BARBER_B_ID])

    const result = computeBaseReadyMinutes(
      [
        availableBarber(BARBER_A_ID, 'Alice'),    // disabled (e.g. Tyrik)
        busyBarber(BARBER_B_ID, 'Bob', 'IN_WALKIN', freeIn15),
      ],
      NOW,
      walkinEnabled,
    )
    // BARBER_A excluded → base = 15, not 0
    expect(result).toBe(15)
  })

  it('uses acuityFreeAt fallback when availability.estimated_free_at is null', () => {
    // Barber is busy with no manual estimate, but Acuity says free in 10 min
    const acuityFreeAt = new Map([[BARBER_A_ID, new Date(NOW.getTime() + 10 * 60_000).toISOString()]])
    const result = computeBaseReadyMinutes(
      [busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', null)],
      NOW,
      undefined,
      acuityFreeAt,
    )
    expect(result).toBe(10)
  })

  it('clamps stale estimates (free_at in the past) to 0', () => {
    const stale = new Date(NOW.getTime() - 5 * 60_000).toISOString() // 5 min ago
    const result = computeBaseReadyMinutes(
      [busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', stale)],
      NOW,
    )
    expect(result).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// estimateQueue — wait formula tests
// ---------------------------------------------------------------------------

describe('estimateQueue — wait formula', () => {
  // -----------------------------------------------------------------------
  // First walk-in (i=0): wait = base_ready_minutes (NO +30 added)
  // -----------------------------------------------------------------------
  it('first walk-in gets exactly base_ready_minutes — no +30 added', () => {
    const avail = shopAvailability([availableBarber(BARBER_A_ID, 'Alice')])
    const result = estimateQueue(avail, [walkin(1)], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates[0].estimated_wait_minutes).toBe(0)
    expect(result.base_ready_minutes).toBe(0)
  })

  it('first walk-in with barber busy 15 min gets wait=15, not wait=45', () => {
    const freeIn15 = new Date(NOW.getTime() + 15 * 60_000).toISOString()
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', freeIn15),
    ])
    const result = estimateQueue(avail, [walkin(1)], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates[0].estimated_wait_minutes).toBe(15)
    expect(result.base_ready_minutes).toBe(15)
  })

  // -----------------------------------------------------------------------
  // Formula: each additional walk-in ahead adds exactly AVG_WALKIN_MINUTES
  // -----------------------------------------------------------------------
  it('stacks wait times correctly: 0, 30, 60 for three walk-ins with one free barber', () => {
    const avail = shopAvailability([availableBarber(BARBER_A_ID, 'Alice')])
    const result = estimateQueue(
      avail,
      [walkin(1), walkin(2), walkin(3)],
      SERVICES,
      EMPTY_BARBER_SERVICES,
    )

    expect(result.estimates[0].estimated_wait_minutes).toBe(0)
    expect(result.estimates[1].estimated_wait_minutes).toBe(30)
    expect(result.estimates[2].estimated_wait_minutes).toBe(60)
  })

  it('stacks correctly when base > 0', () => {
    const freeIn10 = new Date(NOW.getTime() + 10 * 60_000).toISOString()
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', freeIn10),
    ])
    const result = estimateQueue(
      avail,
      [walkin(1), walkin(2), walkin(3)],
      SERVICES,
      EMPTY_BARBER_SERVICES,
    )

    expect(result.estimates[0].estimated_wait_minutes).toBe(10)       // base
    expect(result.estimates[1].estimated_wait_minutes).toBe(10 + 30)  // base + 1*30
    expect(result.estimates[2].estimated_wait_minutes).toBe(10 + 60)  // base + 2*30
  })

  // -----------------------------------------------------------------------
  // No eligible barbers → -1
  // -----------------------------------------------------------------------
  it('returns -1 when all barbers are OFF / not scheduled', () => {
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'OFF', null),
    ])
    const result = estimateQueue(avail, [walkin(1)], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates[0].estimated_wait_minutes).toBe(-1)
    expect(result.base_ready_minutes).toBeNull()
  })

  it('returns -1 when all eligible barbers are busy with no estimate', () => {
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', null),
    ])
    const result = estimateQueue(avail, [walkin(1)], SERVICES, EMPTY_BARBER_SERVICES)

    // No estimate → base=null → wait=-1 (not 30!)
    expect(result.estimates[0].estimated_wait_minutes).toBe(-1)
    expect(result.base_ready_minutes).toBeNull()
  })

  // -----------------------------------------------------------------------
  // walkin_enabled filter — appointment-only barbers must not affect wait time
  // -----------------------------------------------------------------------
  it('excludes appointment-only barbers from wait calculation', () => {
    // BARBER_A (Tyrik) available but walkin_enabled=false
    // BARBER_B walkin_enabled=true but busy 20 min
    const freeIn20 = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const walkinEnabled = new Set([BARBER_B_ID])

    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Tyrik'),                              // disabled
      busyBarber(BARBER_B_ID, 'Marcus', 'IN_WALKIN', freeIn20),
    ])
    const result = estimateQueue(
      avail,
      [walkin(1)],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      walkinEnabled,
    )

    // Should NOT be 0 (from Tyrik) — should be 20 (from Marcus)
    expect(result.estimates[0].estimated_wait_minutes).toBe(20)
    expect(result.base_ready_minutes).toBe(20)
  })

  it('returns -1 when the only available barber is walkin_disabled', () => {
    const walkinEnabled = new Set<string>() // empty — no one is walkin-enabled

    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Tyrik'),
    ])
    const result = estimateQueue(
      avail,
      [walkin(1)],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      walkinEnabled,
    )

    expect(result.estimates[0].estimated_wait_minutes).toBe(-1)
    expect(result.next_available_barber).toBeNull()
  })

  it('next_available_barber only shows walkin-eligible barbers', () => {
    const walkinEnabled = new Set([BARBER_B_ID])
    const freeIn5 = new Date(NOW.getTime() + 5 * 60_000).toISOString()

    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Tyrik'),                            // disabled
      busyBarber(BARBER_B_ID, 'Marcus', 'IN_WALKIN', freeIn5),
    ])
    const result = estimateQueue(
      avail,
      [],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      walkinEnabled,
    )

    expect(result.next_available_barber?.barber_id).toBe(BARBER_B_ID)
  })

  // -----------------------------------------------------------------------
  // Multi-barber: formula is per walk-in ahead, not per barber slot
  // With the formula (base + i*30), two free barbers still give 0/30/60:
  // walk-in #2 gets wait=30 (one person ahead), not 0.
  // -----------------------------------------------------------------------
  it('with two free barbers: formula gives 0, 30, 60 (conservative positional estimate)', () => {
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
      availableBarber(BARBER_B_ID, 'Bob'),
    ])
    const result = estimateQueue(
      avail,
      [walkin(1), walkin(2), walkin(3)],
      SERVICES,
      EMPTY_BARBER_SERVICES,
    )

    expect(result.estimates[0].estimated_wait_minutes).toBe(0)   // i=0
    expect(result.estimates[1].estimated_wait_minutes).toBe(30)  // i=1
    expect(result.estimates[2].estimated_wait_minutes).toBe(60)  // i=2
    // Suggestions still use two barbers for the simulation
    expect(result.estimates[0].suggested_barber_id).not.toBeNull()
    expect(result.estimates[1].suggested_barber_id).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // PREFERRED walk-in suggestion still honours barber preference
  // (wait is still formula-based)
  // -----------------------------------------------------------------------
  it('PREFERRED walk-in: wait time uses formula, suggestion honours preference', () => {
    const freeIn20 = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const avail = shopAvailability([
      availableBarber(BARBER_A_ID, 'Alice'),
      busyBarber(BARBER_B_ID, 'Bob', 'IN_WALKIN', freeIn20),
    ])
    const queue = [
      walkin(1, { preference_type: 'PREFERRED', preferred_barber_id: BARBER_B_ID }),
    ]

    const result = estimateQueue(avail, queue, SERVICES, EMPTY_BARBER_SERVICES)

    // base = 0 (Alice is free), i=0 → wait = 0
    expect(result.estimates[0].estimated_wait_minutes).toBe(0)
    // Suggestion still points at preferred barber
    expect(result.estimates[0].suggested_barber_id).toBe(BARBER_B_ID)
  })

  // -----------------------------------------------------------------------
  // base_ready_minutes is exposed on the QueueEstimate
  // -----------------------------------------------------------------------
  it('exposes base_ready_minutes on the result', () => {
    const freeIn12 = new Date(NOW.getTime() + 12 * 60_000).toISOString()
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', freeIn12),
    ])
    const result = estimateQueue(avail, [], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.base_ready_minutes).toBe(12)
  })

  // -----------------------------------------------------------------------
  // average_wait_minutes
  // -----------------------------------------------------------------------
  it('calculates correct average wait: (0 + 30) / 2 = 15', () => {
    const avail = shopAvailability([availableBarber(BARBER_A_ID, 'Alice')])
    const result = estimateQueue(
      avail,
      [walkin(1), walkin(2)],
      SERVICES,
      EMPTY_BARBER_SERVICES,
    )
    expect(result.average_wait_minutes).toBe(15)
  })

  // -----------------------------------------------------------------------
  // Empty queue
  // -----------------------------------------------------------------------
  it('returns empty estimates and 0 average for empty queue', () => {
    const avail = shopAvailability([availableBarber(BARBER_A_ID, 'Alice')])
    const result = estimateQueue(avail, [], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.estimates).toHaveLength(0)
    expect(result.average_wait_minutes).toBe(0)
  })

  // -----------------------------------------------------------------------
  // All wait times are non-negative or exactly -1
  // -----------------------------------------------------------------------
  it('all wait times are >= 0 or exactly -1', () => {
    const freeIn10 = new Date(NOW.getTime() + 10 * 60_000).toISOString()
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', freeIn10),
    ])
    const result = estimateQueue(
      avail,
      [walkin(1), walkin(2), walkin(3)],
      SERVICES,
      EMPTY_BARBER_SERVICES,
    )

    for (const est of result.estimates) {
      expect(est.estimated_wait_minutes === -1 || est.estimated_wait_minutes >= 0).toBe(true)
    }
  })

  // -----------------------------------------------------------------------
  // acuityFreeAt is used when availability estimate is missing
  // -----------------------------------------------------------------------
  it('uses acuityFreeAt when availability has no estimate', () => {
    // Barber is busy but availability says no estimate
    // Acuity says free in 8 minutes
    const acuityFreeAt = new Map([
      [BARBER_A_ID, new Date(NOW.getTime() + 8 * 60_000).toISOString()],
    ])
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'IN_WALKIN', null),
    ])

    const result = estimateQueue(
      avail,
      [walkin(1)],
      SERVICES,
      EMPTY_BARBER_SERVICES,
      undefined,
      acuityFreeAt,
    )

    expect(result.estimates[0].estimated_wait_minutes).toBe(8)
    expect(result.base_ready_minutes).toBe(8)
  })

  // -----------------------------------------------------------------------
  // next_available_barber
  // -----------------------------------------------------------------------
  it('reports next_available_barber as the earliest free walkin-eligible barber', () => {
    const avail = shopAvailability([availableBarber(BARBER_A_ID, 'Alice')])
    const result = estimateQueue(avail, [], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.next_available_barber?.barber_id).toBe(BARBER_A_ID)
  })

  it('returns null next_available_barber when all barbers are OFF', () => {
    const avail = shopAvailability([
      busyBarber(BARBER_A_ID, 'Alice', 'OFF', null),
    ])
    const result = estimateQueue(avail, [], SERVICES, EMPTY_BARBER_SERVICES)

    expect(result.next_available_barber).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AVG_WALKIN_MINUTES constant
// ---------------------------------------------------------------------------

describe('AVG_WALKIN_MINUTES', () => {
  it('is 30', () => {
    expect(AVG_WALKIN_MINUTES).toBe(30)
  })
})
