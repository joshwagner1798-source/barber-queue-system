// ---------------------------------------------------------------------------
// Low-level Acuity Scheduling v1 REST client (server-side only)
// ---------------------------------------------------------------------------

import type {
  AcuityAppointment,
  AcuityBlock,
  AcuityCalendar,
} from '@/types/acuity'

const ACUITY_BASE = 'https://acuityscheduling.com/api/v1'

function getAuthHeader(): string {
  const userId = process.env.ACUITY_USER_ID
  const apiKey = process.env.ACUITY_API_KEY
  if (!userId || !apiKey) {
    throw new Error('ACUITY_USER_ID and ACUITY_API_KEY must be set')
  }
  return 'Basic ' + Buffer.from(`${userId}:${apiKey}`).toString('base64')
}

async function acuityFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${ACUITY_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: getAuthHeader() },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Acuity ${path} failed (${res.status}): ${body}`)
  }

  return res.json() as Promise<T>
}

/**
 * Fetch appointments for a specific calendar on a date range.
 * Automatically filters out canceled and no-show appointments.
 */
export async function fetchAppointments(
  calendarId: number,
  minDate: string, // YYYY-MM-DD
  maxDate: string,
): Promise<AcuityAppointment[]> {
  const raw = await acuityFetch<AcuityAppointment[]>('/appointments', {
    calendarID: String(calendarId),
    minDate,
    maxDate,
    canceled: 'false',
  })
  // Double-filter: Acuity sometimes returns stale data
  return raw.filter((a) => !a.canceled && !a.noShow)
}

/**
 * Fetch blocked time for a specific calendar on a date range.
 */
export async function fetchBlocks(
  calendarId: number,
  minDate: string,
  maxDate: string,
): Promise<AcuityBlock[]> {
  return acuityFetch<AcuityBlock[]>('/blocks', {
    calendarID: String(calendarId),
    minDate,
    maxDate,
  })
}

/**
 * Fetch all calendars (staff members) from the Acuity account.
 */
export async function fetchCalendars(): Promise<AcuityCalendar[]> {
  return acuityFetch<AcuityCalendar[]>('/calendars')
}

/**
 * Fetch a single appointment by its Acuity ID.
 * Used by the webhook handler to hydrate a minimal payload.
 */
export async function fetchAppointmentById(id: string): Promise<AcuityAppointment> {
  return acuityFetch<AcuityAppointment>(`/appointments/${id}`)
}

/**
 * List appointments across an optional calendar within a date range.
 * Includes canceled appointments (caller decides how to handle them).
 */
export async function fetchAppointmentsList(params: {
  calendarID?: string
  minDate: string // YYYY-MM-DD
  maxDate: string // YYYY-MM-DD
}): Promise<AcuityAppointment[]> {
  const query: Record<string, string> = {
    minDate: params.minDate,
    maxDate: params.maxDate,
    // Do NOT pass canceled= at all: omitting it returns both active and canceled.
    // canceled=true means "only canceled"; canceled=false means "only active".
  }
  if (params.calendarID) {
    query.calendarID = params.calendarID
  }
  return acuityFetch<AcuityAppointment[]>('/appointments', query)
}
