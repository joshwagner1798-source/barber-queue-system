import { describe, it, expect } from 'vitest'
import { getWalkinDuration } from '../service_duration'

describe('getWalkinDuration', () => {
  const defaultSettings = { default_walkin_minutes: 30 }
  const settingsWithServices = {
    default_walkin_minutes: 30,
    service_durations: { beard: 20, 'cut+beard': 45 },
  }

  it('returns shop default when walk-in has no service_type', () => {
    expect(getWalkinDuration({ service_type: null }, defaultSettings)).toBe(30)
  })

  it('returns shop default when service_type not in service_durations', () => {
    expect(getWalkinDuration({ service_type: 'cut' }, settingsWithServices)).toBe(30)
  })

  it('returns service-specific duration when service_type matches', () => {
    expect(getWalkinDuration({ service_type: 'beard' }, settingsWithServices)).toBe(20)
  })

  it('returns service-specific duration for multi-word service type', () => {
    expect(getWalkinDuration({ service_type: 'cut+beard' }, settingsWithServices)).toBe(45)
  })

  it('returns shop default when service_durations map is absent', () => {
    expect(getWalkinDuration({ service_type: 'beard' }, defaultSettings)).toBe(30)
  })

  it('returns shop default when service_type is undefined', () => {
    expect(getWalkinDuration({}, defaultSettings)).toBe(30)
  })
})
