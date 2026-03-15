import { describe, it, expect } from 'vitest'
import { getBarberStatusText, getBarberStatusColor } from '../status'

function barber(overrides: Record<string, unknown>) {
  return {
    status: 'FREE',
    busy_reason: null,
    free_at: null,
    blocked_until: null,
    off_label: null,
    ...overrides,
  }
}

describe('getBarberStatusText', () => {
  it('returns "Available Now" when FREE', () => {
    expect(getBarberStatusText(barber({ status: 'FREE' }))).toBe('Available Now')
  })

  it('returns "Ready at HH:MM AM/PM" when BUSY with appointment', () => {
    const freeAt = '2026-03-15T19:45:00.000Z'
    const result = getBarberStatusText(barber({ status: 'BUSY', busy_reason: 'appointment', free_at: freeAt }))
    expect(result).toMatch(/^Ready at \d/)
  })

  it('returns "Unavailable until HH:MM" when UNAVAILABLE with blocked_until', () => {
    const blockedUntil = '2026-03-15T20:00:00.000Z'
    const result = getBarberStatusText(barber({ status: 'UNAVAILABLE', busy_reason: 'blocked', blocked_until: blockedUntil }))
    expect(result).toMatch(/^Unavailable until \d/)
  })

  it('returns plain "Unavailable" when UNAVAILABLE without blocked reason', () => {
    expect(getBarberStatusText(barber({ status: 'UNAVAILABLE', busy_reason: null }))).toBe('Unavailable')
  })

  it('returns off_label string when OFF', () => {
    expect(getBarberStatusText(barber({ status: 'OFF', off_label: 'Off until Wed 10:20 AM' }))).toBe('Off until Wed 10:20 AM')
  })

  it('returns "Off" when OFF but off_label is null', () => {
    expect(getBarberStatusText(barber({ status: 'OFF', off_label: null }))).toBe('Off')
  })
})

describe('getBarberStatusColor', () => {
  it('returns emerald for FREE', () => {
    expect(getBarberStatusColor('FREE')).toBe('emerald')
  })

  it('returns amber for BUSY', () => {
    expect(getBarberStatusColor('BUSY')).toBe('amber')
  })

  it('returns red for UNAVAILABLE', () => {
    expect(getBarberStatusColor('UNAVAILABLE')).toBe('red')
  })

  it('returns zinc for OFF', () => {
    expect(getBarberStatusColor('OFF')).toBe('zinc')
  })
})
