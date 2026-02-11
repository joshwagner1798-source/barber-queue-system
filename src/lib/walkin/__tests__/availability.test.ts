import { describe, it, expect } from 'vitest'
import { resolveBarber } from '../availability'
import {
  SHOP_ID,
  BARBER_A_ID,
  BARBER_B_ID,
  DAY_OF_WEEK,
  TIME_STRING,
  NOW,
  SHOP_HOURS_SUNDAY,
  SHOP_HOURS_CLOSED,
  EMPTY_BLOCKS,
  EMPTY_APPOINTMENTS,
  EMPTY_STATES,
  EMPTY_ASSIGNMENTS,
  barberState,
  appointment,
} from './fixtures'

const HOURS = [SHOP_HOURS_SUNDAY]

describe('resolveBarber', () => {
  // -----------------------------------------------------------------------
  // Scenario 1: Shop closed → SHOP_CLOSED
  // -----------------------------------------------------------------------
  it('returns SHOP_CLOSED when shop is explicitly closed', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      true, // shopClosed
      HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, EMPTY_APPOINTMENTS,
      EMPTY_STATES, EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(false)
    expect(result.reason).toBe('SHOP_CLOSED')
  })

  // -----------------------------------------------------------------------
  // Scenario 2: Barber OFF → OFF
  // -----------------------------------------------------------------------
  it('returns OFF when barber_state is OFF', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, EMPTY_APPOINTMENTS,
      [barberState(BARBER_A_ID, 'OFF')],
      EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(false)
    expect(result.reason).toBe('OFF')
  })

  // -----------------------------------------------------------------------
  // Scenario 3: Barber AVAILABLE (no conflicts)
  // -----------------------------------------------------------------------
  it('returns AVAILABLE when barber is free with no conflicts', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, EMPTY_APPOINTMENTS,
      [barberState(BARBER_A_ID, 'AVAILABLE')],
      EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(true)
    expect(result.reason).toBe('AVAILABLE')
  })

  it('returns AVAILABLE even without explicit barber_state', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, EMPTY_APPOINTMENTS,
      EMPTY_STATES, // no barber_state row
      EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(true)
    expect(result.reason).toBe('AVAILABLE')
  })

  // -----------------------------------------------------------------------
  // Scenario 4: Appointment within 30 min → APPOINTMENT_BUFFER
  // -----------------------------------------------------------------------
  it('returns APPOINTMENT_BUFFER when appointment starts in 20 minutes', () => {
    const upcoming = appointment(BARBER_A_ID, 20, 45)
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS,
      EMPTY_APPOINTMENTS,  // no current appointment
      [upcoming],           // upcoming within buffer
      [barberState(BARBER_A_ID, 'AVAILABLE')],
      EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(false)
    expect(result.reason).toBe('APPOINTMENT_BUFFER')
    expect(result.estimated_free_at).toBe(upcoming.end_time)
  })

  it('returns AVAILABLE when appointment is 45 minutes away (outside buffer)', () => {
    const upcoming = appointment(BARBER_A_ID, 45, 30)
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS,
      EMPTY_APPOINTMENTS,
      [], // no upcoming within buffer (45 > 30)
      [barberState(BARBER_A_ID, 'AVAILABLE')],
      EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(true)
    expect(result.reason).toBe('AVAILABLE')
  })

  // -----------------------------------------------------------------------
  // Barber not scheduled
  // -----------------------------------------------------------------------
  it('returns NOT_SCHEDULED when no hours for today', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      [], // no hours at all
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, EMPTY_APPOINTMENTS,
      EMPTY_STATES, EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(false)
    expect(result.reason).toBe('NOT_SCHEDULED')
  })

  it('returns NOT_SCHEDULED when outside shift hours', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      '23:00:00', // 11 PM — outside 8am-6pm
      DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, EMPTY_APPOINTMENTS,
      EMPTY_STATES, EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(false)
    expect(result.reason).toBe('NOT_SCHEDULED')
  })

  // -----------------------------------------------------------------------
  // IN_CHAIR states
  // -----------------------------------------------------------------------
  it('returns IN_APPOINTMENT when barber is IN_CHAIR with active appointment', () => {
    const activeAppt = appointment(BARBER_A_ID, -15, 45) // started 15 min ago
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS,
      [activeAppt],
      EMPTY_APPOINTMENTS,
      [barberState(BARBER_A_ID, 'IN_CHAIR')],
      EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(false)
    expect(result.reason).toBe('IN_APPOINTMENT')
    expect(result.estimated_free_at).toBe(activeAppt.end_time)
  })

  it('returns IN_WALKIN when barber is IN_CHAIR with no appointment', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS,
      EMPTY_APPOINTMENTS,
      EMPTY_APPOINTMENTS,
      [barberState(BARBER_A_ID, 'IN_CHAIR', {
        manual_free_at: new Date(NOW.getTime() + 20 * 60_000).toISOString(),
      })],
      EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(false)
    expect(result.reason).toBe('IN_WALKIN')
    expect(result.estimated_free_at).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // ON_BREAK
  // -----------------------------------------------------------------------
  it('returns ON_BREAK when barber_state is ON_BREAK', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, EMPTY_APPOINTMENTS,
      [barberState(BARBER_A_ID, 'ON_BREAK')],
      EMPTY_ASSIGNMENTS,
    )
    expect(result.available).toBe(false)
    expect(result.reason).toBe('ON_BREAK')
  })

  // -----------------------------------------------------------------------
  // Shift info
  // -----------------------------------------------------------------------
  it('populates shift_start and shift_end when within shift', () => {
    const result = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false,
      HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, EMPTY_APPOINTMENTS,
      EMPTY_STATES, EMPTY_ASSIGNMENTS,
    )
    expect(result.shift_start).toBe('08:00:00')
    expect(result.shift_end).toBe('18:00:00')
  })

  // -----------------------------------------------------------------------
  // Buffer applies per-barber — other barbers unaffected
  // -----------------------------------------------------------------------
  it('buffer only affects the barber with the upcoming appointment', () => {
    const upcoming = appointment(BARBER_A_ID, 20, 45)

    const resultA = resolveBarber(
      BARBER_A_ID, 'Alice',
      TIME_STRING, DAY_OF_WEEK,
      false, HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, [upcoming],
      [barberState(BARBER_A_ID, 'AVAILABLE')],
      EMPTY_ASSIGNMENTS,
    )

    const resultB = resolveBarber(
      BARBER_B_ID, 'Bob',
      TIME_STRING, DAY_OF_WEEK,
      false, HOURS,
      EMPTY_BLOCKS, EMPTY_APPOINTMENTS, [upcoming], // same list, different barber
      [barberState(BARBER_B_ID, 'AVAILABLE')],
      EMPTY_ASSIGNMENTS,
    )

    expect(resultA.reason).toBe('APPOINTMENT_BUFFER')
    expect(resultB.reason).toBe('AVAILABLE')
    expect(resultB.available).toBe(true)
  })
})
