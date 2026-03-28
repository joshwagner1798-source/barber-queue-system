const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export interface HoursRow {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

export function validateHoursRow(row: HoursRow): string | null {
  if (!Number.isInteger(row.day_of_week) || row.day_of_week < 0 || row.day_of_week > 6) {
    return 'day_of_week must be an integer 0–6'
  }
  const dayName = DAY_NAMES[row.day_of_week]
  if (!TIME_RE.test(row.open_time)) {
    return `${dayName}: open_time must be in HH:MM format`
  }
  if (!TIME_RE.test(row.close_time)) {
    return `${dayName}: close_time must be in HH:MM format`
  }
  if (!row.is_closed && row.open_time >= row.close_time) {
    return `${dayName}: open_time must be earlier than close_time`
  }
  return null
}
