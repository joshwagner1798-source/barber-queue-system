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
} from './acuity-client'
import type { AcuityAppointment, AcuityBlock } from '@/types/acuity'

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
}
