// ---------------------------------------------------------------------------
// AcuityProvider — CalendarProvider adapter for Acuity Scheduling
// ---------------------------------------------------------------------------

import type {
  CalendarProvider,
  BusyWindow,
  BlockedWindow,
  CalendarInfo,
} from './provider'
import {
  fetchAppointments,
  fetchAppointmentById,
  fetchAppointmentsList,
  fetchBlocks,
  fetchCalendars,
  fetchAppointmentTypes,
  fetchAvailabilityDates,
  fetchAvailabilityTimes,
} from './acuity-client'
import type { AcuityAppointment, AcuityAppointmentType, AcuityBlock } from '@/types/acuity'

/** Format a Date as YYYY-MM-DD for Acuity API date params. */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export class AcuityProvider implements CalendarProvider {
  async getBusyWindows(
    barberId: string,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<BusyWindow[]> {
    const appointments = await fetchAppointments(
      Number(calendarId),
      toDateStr(from),
      toDateStr(to),
    )

    return appointments.map((a) => ({
      barber_id: barberId,
      start: new Date(a.datetime),
      end: new Date(a.endTime),
      label: a.type,
    }))
  }

  async getBlockedWindows(
    barberId: string,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<BlockedWindow[]> {
    const blocks = await fetchBlocks(
      Number(calendarId),
      toDateStr(from),
      toDateStr(to),
    )

    return blocks.map((b) => ({
      barber_id: barberId,
      start: new Date(b.start),
      end: new Date(b.end),
      note: b.notes ?? null,
    }))
  }

  async getCalendars(): Promise<CalendarInfo[]> {
    const cals = await fetchCalendars()
    return cals.map((c) => ({
      external_id: String(c.id),
      name: c.name,
      email: c.email,
    }))
  }

  /** Fetch a single appointment by Acuity ID (string form). */
  async getAppointment(id: string): Promise<AcuityAppointment> {
    return fetchAppointmentById(id)
  }

  /**
   * List appointments in a date window, optionally scoped to one calendar.
   * Includes canceled so callers can set status=CANCELLED.
   */
  async listAppointments(params: {
    calendarID?: string
    minDate: string
    maxDate: string
  }): Promise<AcuityAppointment[]> {
    return fetchAppointmentsList(params)
  }

  /**
   * List blocked times for a specific calendar within a date window.
   * Uses the same auth and date format as listAppointments.
   */
  async listBlocks(params: {
    calendarID: string
    minDate: string
    maxDate: string
  }): Promise<AcuityBlock[]> {
    return fetchBlocks(Number(params.calendarID), params.minDate, params.maxDate)
  }

  /** Fetch all appointment types configured in the Acuity account. */
  async listAppointmentTypes(): Promise<AcuityAppointmentType[]> {
    return fetchAppointmentTypes()
  }

  /**
   * Returns the ISO UTC string of the first available booking slot for the
   * given calendar that is NOT today, or null if the calendar has availability
   * today (meaning the barber is working today).
   *
   * Algorithm:
   *   1. Fetch availability dates for the current month; find first date >= todayNy.
   *   2. If first date === todayNy → barber is working today → return null.
   *   3. If no date found in current month, fetch next month too.
   *   4. Fetch times for that first future date; return times[0] as ISO UTC.
   *   5. If no times found at all → return null (treat as working).
   */
  async getNextAvailableTime(params: {
    calendarID: string
    appointmentTypeID: string
    todayNy: string // YYYY-MM-DD
  }): Promise<string | null> {
    const calId = Number(params.calendarID)
    const apptTypeId = Number(params.appointmentTypeID)
    const todayNy = params.todayNy

    // Current month and next month strings (YYYY-MM)
    const currentMonth = todayNy.slice(0, 7)
    const [yr, mo] = todayNy.split('-').map(Number)
    const nextMonthDate = new Date(Date.UTC(yr, mo, 1)) // mo is already 1-based so this goes to next month
    const nextMonth = nextMonthDate.toISOString().slice(0, 7)

    // Fetch current month dates
    let dates = await fetchAvailabilityDates(calId, apptTypeId, currentMonth)

    // Filter to dates >= today
    const futureDates = dates.filter((d) => d.date >= todayNy)

    // If today is available, barber is working today
    if (futureDates.length > 0 && futureDates[0].date === todayNy) {
      return null
    }

    // Find first future date (not today)
    let firstFutureDate = futureDates.find((d) => d.date > todayNy)

    // If not found in current month, check next month
    if (!firstFutureDate) {
      const nextDates = await fetchAvailabilityDates(calId, apptTypeId, nextMonth)
      firstFutureDate = nextDates.find((d) => d.date > todayNy)
    }

    if (!firstFutureDate) {
      // No availability found — treat as working (don't mark as off)
      return null
    }

    // Fetch times for the first future date
    const times = await fetchAvailabilityTimes(calId, apptTypeId, firstFutureDate.date)
    if (times.length === 0) return null

    return new Date(times[0].time).toISOString()
  }
}
