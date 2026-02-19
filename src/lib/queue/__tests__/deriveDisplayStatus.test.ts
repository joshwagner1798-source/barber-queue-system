import { describe, it, expect } from 'vitest'
import { deriveDisplayStatus } from '../deriveDisplayStatus'

describe('deriveDisplayStatus', () => {
  it('returns "Available" for AVAILABLE state', () => {
    expect(
      deriveDisplayStatus({ internalState: 'AVAILABLE', nextAppointment: null, blockNote: null }),
    ).toBe('Available')
  })

  it('returns "With client" for BUSY state', () => {
    expect(
      deriveDisplayStatus({ internalState: 'BUSY', nextAppointment: null, blockNote: null }),
    ).toBe('With client')
  })

  it('returns "Off today" for OFF_TODAY state', () => {
    expect(
      deriveDisplayStatus({ internalState: 'OFF_TODAY', nextAppointment: null, blockNote: null }),
    ).toBe('Off today')
  })

  it('returns "Appointment soon" for SOON_BOOKED without next appointment', () => {
    expect(
      deriveDisplayStatus({ internalState: 'SOON_BOOKED', nextAppointment: null, blockNote: null }),
    ).toBe('Appointment soon')
  })

  it('returns "Appointment in Xm" for SOON_BOOKED with next appointment', () => {
    const inFifteen = new Date(Date.now() + 15 * 60_000)
    const result = deriveDisplayStatus({
      internalState: 'SOON_BOOKED',
      nextAppointment: inFifteen,
      blockNote: null,
    })
    expect(result).toMatch(/^Appointment in \d+m$/)
  })

  // BLOCKED display rules
  it('returns "Lunch break" for lunch-related block notes', () => {
    const lunchNotes = ['Lunch', 'Going to eat', 'Grab food', 'Eating', 'Grabbing food', 'Meal time']
    for (const note of lunchNotes) {
      expect(
        deriveDisplayStatus({ internalState: 'BLOCKED', nextAppointment: null, blockNote: note }),
      ).toBe('Lunch break')
    }
  })

  it('returns block note as-is when under 30 chars', () => {
    expect(
      deriveDisplayStatus({ internalState: 'BLOCKED', nextAppointment: null, blockNote: 'Picking son up' }),
    ).toBe('Picking son up')
  })

  it('truncates block note to 30 chars with ellipsis', () => {
    const longNote = 'This is a very long block note that exceeds thirty characters easily'
    const result = deriveDisplayStatus({
      internalState: 'BLOCKED',
      nextAppointment: null,
      blockNote: longNote,
    })
    expect(result.length).toBe(31) // 30 chars + ellipsis
    expect(result).toMatch(/\u2026$/)
  })

  it('returns "Unavailable" for BLOCKED with empty/null note', () => {
    expect(
      deriveDisplayStatus({ internalState: 'BLOCKED', nextAppointment: null, blockNote: null }),
    ).toBe('Unavailable')
    expect(
      deriveDisplayStatus({ internalState: 'BLOCKED', nextAppointment: null, blockNote: '  ' }),
    ).toBe('Unavailable')
  })
})
