import { describe, it, expect } from 'vitest'
import { computeBarberStatus, PREP_BUFFER_MIN, SOON_BOOKED_WINDOW_MIN } from '../engine'
import type { BusyWindow, BlockedWindow } from '@/lib/calendar/provider'

const BARBER_ID = 'barber-1'
const NOW = new Date('2025-06-15T14:00:00Z')

function busyWindow(startOffset: number, duration: number): BusyWindow {
  const start = new Date(NOW.getTime() + startOffset * 60_000)
  const end = new Date(start.getTime() + duration * 60_000)
  return { barber_id: BARBER_ID, start, end, label: 'Haircut' }
}

function blockedWindow(startOffset: number, duration: number, note?: string): BlockedWindow {
  const start = new Date(NOW.getTime() + startOffset * 60_000)
  const end = new Date(start.getTime() + duration * 60_000)
  return { barber_id: BARBER_ID, start, end, note: note ?? null }
}

describe('computeBarberStatus', () => {
  it('returns AVAILABLE when no windows', () => {
    const result = computeBarberStatus(BARBER_ID, [], [], NOW)
    expect(result.status).toBe('AVAILABLE')
    expect(result.free_at).toBeNull()
  })

  it('returns BUSY when in active appointment', () => {
    const result = computeBarberStatus(BARBER_ID, [busyWindow(-10, 30)], [], NOW)
    expect(result.status).toBe('BUSY')
    expect(result.free_at).not.toBeNull()
  })

  it('returns BLOCKED when in active block', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [],
      [blockedWindow(-5, 60, 'Picking son up')],
      NOW,
    )
    expect(result.status).toBe('BLOCKED')
    expect(result.status_detail).toBe('Picking son up')
  })

  it('BLOCKED takes priority over BUSY when both active', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [busyWindow(-10, 30)],
      [blockedWindow(-5, 60, 'Lunch')],
      NOW,
    )
    expect(result.status).toBe('BLOCKED')
  })

  it('returns BUSY during 5-minute prep buffer after appointment', () => {
    // Appointment ended 3 minutes ago → still in buffer
    const result = computeBarberStatus(BARBER_ID, [busyWindow(-33, 30)], [], NOW)
    expect(result.status).toBe('BUSY')
    expect(result.status_detail).toBe('Wrapping up')
  })

  it('returns AVAILABLE after 5-minute buffer has elapsed', () => {
    // Appointment ended 6 minutes ago → buffer passed
    const result = computeBarberStatus(BARBER_ID, [busyWindow(-36, 30)], [], NOW)
    expect(result.status).toBe('AVAILABLE')
  })

  it('returns AVAILABLE when appointment ended exactly 5 minutes ago', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [busyWindow(-(30 + PREP_BUFFER_MIN), 30)],
      [],
      NOW,
    )
    expect(result.status).toBe('AVAILABLE')
  })

  it('returns SOON_BOOKED when next appointment within 30 minutes', () => {
    // Appointment starts in 20 min — within SOON_BOOKED window
    const result = computeBarberStatus(BARBER_ID, [busyWindow(20, 30)], [], NOW)
    expect(result.status).toBe('SOON_BOOKED')
    expect(result.next_appointment).not.toBeNull()
  })

  it('returns AVAILABLE when next appointment outside 30 minutes', () => {
    // Appointment starts in 45 min — outside SOON_BOOKED window
    const result = computeBarberStatus(BARBER_ID, [busyWindow(45, 30)], [], NOW)
    expect(result.status).toBe('AVAILABLE')
    expect(result.next_appointment).not.toBeNull()
  })

  it('returns SOON_BOOKED at exactly 30-minute boundary', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [busyWindow(SOON_BOOKED_WINDOW_MIN, 30)],
      [],
      NOW,
    )
    expect(result.status).toBe('SOON_BOOKED')
  })

  it('returns AVAILABLE just past 30-minute boundary', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [busyWindow(SOON_BOOKED_WINDOW_MIN + 1, 30)],
      [],
      NOW,
    )
    expect(result.status).toBe('AVAILABLE')
  })

  it('returns OFF_TODAY for day-long block (>=8 hours)', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [],
      [blockedWindow(-120, 600, 'Day off')], // 10 hours
      NOW,
    )
    expect(result.status).toBe('OFF_TODAY')
    expect(result.status_detail).toBe('Day off')
  })

  it('returns BLOCKED for short block (not OFF_TODAY)', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [],
      [blockedWindow(-5, 90, 'Dentist')], // 1.5 hours
      NOW,
    )
    expect(result.status).toBe('BLOCKED')
  })

  it('passes block notes through to status_detail', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [],
      [blockedWindow(-5, 30, 'Doctor appointment')],
      NOW,
    )
    expect(result.status_detail).toBe('Doctor appointment')
  })

  it('sets free_at to end of active appointment', () => {
    const appt = busyWindow(-10, 30) // ends at NOW + 20min
    const result = computeBarberStatus(BARBER_ID, [appt], [], NOW)
    expect(result.free_at).toEqual(appt.end)
  })

  it('sets free_at to end of block when blocked', () => {
    const block = blockedWindow(-5, 60)
    const result = computeBarberStatus(BARBER_ID, [], [block], NOW)
    expect(result.free_at).toEqual(block.end)
  })

  it('sets next_appointment for AVAILABLE barber with future appointment', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [busyWindow(60, 30)], // appointment in 60 min
      [],
      NOW,
    )
    expect(result.status).toBe('AVAILABLE')
    expect(result.next_appointment).not.toBeNull()
  })
})
