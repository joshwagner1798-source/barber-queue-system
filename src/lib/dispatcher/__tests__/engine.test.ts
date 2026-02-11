import { describe, it, expect } from 'vitest'
import { computeBarberStatus, FREE_BUFFER_MINUTES } from '../engine'
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
  it('returns FREE when no windows', () => {
    const result = computeBarberStatus(BARBER_ID, [], [], NOW)
    expect(result.status).toBe('FREE')
    expect(result.free_at).toBeNull()
  })

  it('returns BUSY when in active appointment', () => {
    const result = computeBarberStatus(BARBER_ID, [busyWindow(-10, 30)], [], NOW)
    expect(result.status).toBe('BUSY')
    expect(result.free_at).not.toBeNull()
  })

  it('returns UNAVAILABLE when in active block', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [],
      [blockedWindow(-5, 60, 'Picking son up')],
      NOW,
    )
    expect(result.status).toBe('UNAVAILABLE')
    expect(result.status_detail).toBe('Picking son up')
  })

  it('UNAVAILABLE takes priority over BUSY when both active', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [busyWindow(-10, 30)],
      [blockedWindow(-5, 60, 'Lunch')],
      NOW,
    )
    expect(result.status).toBe('UNAVAILABLE')
  })

  it('returns BUSY during 5-minute readiness buffer after appointment', () => {
    // Appointment ended 3 minutes ago → still in buffer
    const result = computeBarberStatus(BARBER_ID, [busyWindow(-33, 30)], [], NOW)
    expect(result.status).toBe('BUSY')
    expect(result.status_detail).toBe('Readiness buffer')
  })

  it('returns FREE after 5-minute buffer has elapsed', () => {
    // Appointment ended 6 minutes ago → buffer passed
    const result = computeBarberStatus(BARBER_ID, [busyWindow(-36, 30)], [], NOW)
    expect(result.status).toBe('FREE')
  })

  it('returns FREE when appointment ended exactly 5 minutes ago', () => {
    const result = computeBarberStatus(
      BARBER_ID,
      [busyWindow(-(30 + FREE_BUFFER_MINUTES), 30)],
      [],
      NOW,
    )
    expect(result.status).toBe('FREE')
  })

  it('returns BUSY for future appointment (not yet started)', () => {
    // Appointment starts in 10 min — should be FREE (not yet started)
    const result = computeBarberStatus(BARBER_ID, [busyWindow(10, 30)], [], NOW)
    expect(result.status).toBe('FREE')
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

  it('sets free_at to end of block when unavailable', () => {
    const block = blockedWindow(-5, 60)
    const result = computeBarberStatus(BARBER_ID, [], [block], NOW)
    expect(result.free_at).toEqual(block.end)
  })
})
