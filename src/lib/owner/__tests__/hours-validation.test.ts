import { describe, it, expect } from 'vitest'
import { validateHoursRow } from '../hours-validation'

describe('validateHoursRow', () => {
  it('returns null for a valid open day', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '09:00', close_time: '18:00', is_closed: false })
    ).toBeNull()
  })

  it('returns null for a closed day regardless of times', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '18:00', close_time: '09:00', is_closed: true })
    ).toBeNull()
  })

  it('rejects day_of_week above 6', () => {
    expect(
      validateHoursRow({ day_of_week: 7, open_time: '09:00', close_time: '18:00', is_closed: false })
    ).toMatch(/day_of_week/)
  })

  it('rejects negative day_of_week', () => {
    expect(
      validateHoursRow({ day_of_week: -1, open_time: '09:00', close_time: '18:00', is_closed: false })
    ).toMatch(/day_of_week/)
  })

  it('rejects non-integer day_of_week', () => {
    expect(
      validateHoursRow({ day_of_week: 1.5, open_time: '09:00', close_time: '18:00', is_closed: false })
    ).toMatch(/day_of_week/)
  })

  it('rejects open_time missing leading zero', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '9:00', close_time: '18:00', is_closed: false })
    ).toMatch(/open_time/)
  })

  it('rejects non-HH:MM open_time', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: 'foo', close_time: '18:00', is_closed: false })
    ).toMatch(/open_time/)
  })

  it('rejects close_time missing leading zero', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '09:00', close_time: '6:00', is_closed: false })
    ).toMatch(/close_time/)
  })

  it('rejects non-HH:MM close_time', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '09:00', close_time: 'bar', is_closed: false })
    ).toMatch(/close_time/)
  })

  it('rejects open_time equal to close_time when not closed', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '09:00', close_time: '09:00', is_closed: false })
    ).toMatch(/earlier/)
  })

  it('rejects open_time later than close_time when not closed', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '18:00', close_time: '09:00', is_closed: false })
    ).toMatch(/earlier/)
  })

  it('includes the day name in the error message', () => {
    const err = validateHoursRow({ day_of_week: 1, open_time: '18:00', close_time: '09:00', is_closed: false })
    expect(err).toMatch(/Monday/)
  })
})
