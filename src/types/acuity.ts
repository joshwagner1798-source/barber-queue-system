// ---------------------------------------------------------------------------
// Acuity Scheduling v1 API response types (server-side only)
// https://developers.acuityscheduling.com/reference
// ---------------------------------------------------------------------------

export interface AcuityAppointment {
  id: number
  calendarID: number
  firstName: string
  lastName: string
  datetime: string // ISO 8601
  endTime: string // ISO 8601
  duration: string // minutes as string, e.g. "30"
  type: string // appointment type name
  canceled: boolean
  noShow: boolean
  labels: { id: number; name: string; color: string }[] | null
}

export interface AcuityBlock {
  id: number
  calendarID: number
  start: string // ISO 8601
  end: string // ISO 8601
  notes: string | null // block reason, shown on TV
}

export interface AcuityCalendar {
  id: number
  name: string
  email: string
  description: string
  thumbnail: string
}

export interface AcuityAppointmentType {
  id: number
  name: string
  active: boolean
  calendarIDs: number[]
}

export interface AcuityAvailabilityDate {
  date: string // YYYY-MM-DD
}

export interface AcuityAvailabilityTime {
  time: string // ISO 8601 with offset, e.g. "2026-02-25T10:20:00-0500"
  slotsAvailable: number
}
