// ---------------------------------------------------------------------------
// slot-generator.ts
//
// Generates bookable time slots for a barber on a given date.
// Conflict sources (all checked in parallel):
//   1. Native appointments table (status=pending|confirmed)
//   2. provider_appointments table (status=ACTIVE, kind=appointment)
//   3. Acuity busy windows via provider.getBusyWindows()
//   4. Acuity blocks via provider.getBlockedWindows()
//
// Slot step = service duration + PREP_BUFFER_MIN (5 min), matching engine.ts.
// Slots within TOO_SOON_MINUTES (30) of now are not bookable.
// ---------------------------------------------------------------------------

import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { CalendarProvider } from '@/lib/calendar/provider'
import { getBarberHoursForDay } from '@/lib/walkin/availability'
import type { BusinessHours } from '@/types/database'

// ---------------------------------------------------------------------------
// Constants — match dispatcher engine.ts values
// ---------------------------------------------------------------------------

/** Buffer after each slot before the next slot may begin (minutes). */
const PREP_BUFFER_MIN = 5

/** Slots within this many minutes of now are marked TOO_SOON. */
const TOO_SOON_MINUTES = 30

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlotStatus = 'AVAILABLE' | 'BUSY' | 'TOO_SOON' | 'OUTSIDE_HOURS'

export interface BookingSlot {
  start: string  // ISO UTC
  end: string    // ISO UTC
  status: SlotStatus
}

export interface GenerateSlotsParams {
  barberId: string
  calendarId: string | null  // users.acuity_calendar_id — null means skip Acuity calls
  date: string               // YYYY-MM-DD in shop timezone
  shopId: string
  duration: number           // service duration in minutes
  timezone: string           // shop timezone e.g. 'America/New_York'
}

export interface GenerateSlotsResult {
  barber_id: string
  date: string
  timezone: string
  slots: BookingSlot[]
  shop_open: boolean
  barber_scheduled: boolean
}

// ---------------------------------------------------------------------------
// Timezone helper
// Convert a local date + HH:MM time string to a UTC Date object.
// Uses Intl.DateTimeFormat to determine the UTC offset at that moment,
// matching the pattern in src/lib/walkin/availability.ts (no external deps).
// ---------------------------------------------------------------------------

function localTimeToUTC(dateStr: string, hhmm: string, timezone: string): Date {
  const [hh, mm] = hhmm.split(':').map(Number)
  const [year, month, day] = dateStr.split('-').map(Number)

  // Step 1: Create a test UTC date treating local time as UTC
  const testUTC = new Date(Date.UTC(year, month - 1, day, hh, mm, 0))

  // Step 2: Format testUTC in the target timezone to get actual local representation
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(testUTC)
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0')

  const localH = get('hour')
  const localM = get('minute')

  // Step 3: Compute delta — how far off is our test from what we actually want
  let deltaMin = (hh * 60 + mm) - (localH * 60 + localM)
  // Normalize for date crossings
  if (deltaMin > 720) deltaMin -= 1440
  if (deltaMin < -720) deltaMin += 1440

  return new Date(testUTC.getTime() + deltaMin * 60_000)
}

/**
 * Get the day-of-week (0=Sun…6=Sat) for a YYYY-MM-DD date string
 * as it would appear in the given timezone.
 */
function getDayOfWeek(dateStr: string, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
  })
  // Build a date at noon UTC to avoid date-line crossings
  const [year, month, day] = dateStr.split('-').map(Number)
  const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const parts = fmt.formatToParts(noonUTC)
  const weekdayAbbr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'

  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return map[weekdayAbbr] ?? 0
}

// ---------------------------------------------------------------------------
// Overlap check — half-open interval [slotStart, slotEnd) vs [wStart, wEnd)
// ---------------------------------------------------------------------------

function overlaps(
  slotStart: Date,
  slotEnd: Date,
  wStart: Date,
  wEnd: Date,
): boolean {
  return slotStart < wEnd && slotEnd > wStart
}

// ---------------------------------------------------------------------------
// generateBookingSlots — single barber, single date
// ---------------------------------------------------------------------------

export async function generateBookingSlots(
  supabase: SupabaseClient<Database>,
  provider: CalendarProvider,
  params: GenerateSlotsParams,
): Promise<GenerateSlotsResult> {
  const { barberId, calendarId, date, shopId, duration, timezone } = params
  const now = new Date()
  const tooSoonCutoff = new Date(now.getTime() + TOO_SOON_MINUTES * 60_000)

  // ── 1. Fetch business hours ───────────────────────────────────────────────
  const { data: hoursData } = await supabase
    .from('business_hours')
    .select('*')
    .eq('shop_id', shopId)

  const hours = (hoursData ?? []) as unknown as BusinessHours[]

  // ── 2. Determine shop open/closed and barber shift for this date ─────────
  const dayOfWeek = getDayOfWeek(date, timezone)

  const shopHoursToday = hours.find(
    (h) => h.barber_id === null && h.day_of_week === dayOfWeek,
  )
  const shopOpen = !!shopHoursToday && !shopHoursToday.is_closed

  const barberHours = getBarberHoursForDay(barberId, dayOfWeek, hours)

  if (!barberHours) {
    return {
      barber_id: barberId,
      date,
      timezone,
      slots: [],
      shop_open: shopOpen,
      barber_scheduled: false,
    }
  }

  // ── 3. Build shift boundaries as UTC ─────────────────────────────────────
  const shiftStart = localTimeToUTC(date, barberHours.open_time, timezone)
  const shiftEnd   = localTimeToUTC(date, barberHours.close_time, timezone)

  // Entire date window for conflict queries
  const [year, month, day] = date.split('-').map(Number)
  const dayStartUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const dayEndUTC   = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0))
  const dayStartISO = dayStartUTC.toISOString()
  const dayEndISO   = dayEndUTC.toISOString()

  // ── 4. Fetch conflict sources ─────────────────────────────────────────────
  // DB sources always run.  Acuity live calls only run when:
  //   a) calendarId is set on the barber, AND
  //   b) ACUITY_USER_ID + ACUITY_API_KEY env vars are present.
  // This lets native scheduling work without Acuity credentials locally.
  const acuityAvailable =
    !!calendarId &&
    !!process.env.ACUITY_USER_ID &&
    !!process.env.ACUITY_API_KEY

  const [
    nativeApptsResult,
    providerApptsResult,
    busyWindows,
    blockedWindows,
  ] = await Promise.all([
    // Native appointments (pending|confirmed) overlapping this date
    supabase
      .from('appointments')
      .select('start_time, end_time')
      .eq('shop_id', shopId)
      .eq('barber_id', barberId)
      .in('status', ['pending', 'confirmed'])
      .lt('start_time', dayEndISO)
      .gt('end_time', dayStartISO),

    // Acuity-synced appointments (ACTIVE) overlapping this date
    supabase
      .from('provider_appointments')
      .select('start_at, end_at')
      .eq('shop_id', shopId)
      .eq('barber_id', barberId)
      .eq('status', 'ACTIVE')
      .eq('kind', 'appointment')
      .lt('start_at', dayEndISO)
      .gt('end_at', dayStartISO),

    // Acuity real-time busy windows — skipped when creds or calendarId absent
    acuityAvailable
      ? provider.getBusyWindows(barberId, calendarId!, dayStartUTC, dayEndUTC).catch(() => [])
      : Promise.resolve([]),

    // Acuity blocks — skipped when creds or calendarId absent
    acuityAvailable
      ? provider.getBlockedWindows(barberId, calendarId!, dayStartUTC, dayEndUTC).catch(() => [])
      : Promise.resolve([]),
  ])

  // Normalize all conflict windows to { start: Date, end: Date }
  type RawAppt = { start_time: string; end_time: string }
  type RawProvAppt = { start_at: string; end_at: string }

  const conflictWindows: Array<{ start: Date; end: Date }> = [
    ...((nativeApptsResult.data ?? []) as unknown as RawAppt[]).map((a) => ({
      start: new Date(a.start_time),
      end: new Date(a.end_time),
    })),
    ...((providerApptsResult.data ?? []) as unknown as RawProvAppt[]).map((a) => ({
      start: new Date(a.start_at),
      end: new Date(a.end_at),
    })),
    ...(busyWindows as Array<{ start: Date; end: Date }>).map((w) => ({ start: w.start, end: w.end })),
    ...(blockedWindows as Array<{ start: Date; end: Date }>).map((w) => ({ start: w.start, end: w.end })),
  ]

  // ── 5. Generate slots ─────────────────────────────────────────────────────
  const stepMs = (duration + PREP_BUFFER_MIN) * 60_000
  const slots: BookingSlot[] = []
  let cursor = shiftStart

  while (cursor < shiftEnd) {
    const slotEnd = new Date(cursor.getTime() + duration * 60_000)

    // Slot must fit entirely within the shift
    if (slotEnd > shiftEnd) break

    const isConflict = conflictWindows.some((w) =>
      overlaps(cursor, slotEnd, w.start, w.end),
    )

    let status: SlotStatus
    if (isConflict) {
      status = 'BUSY'
    } else if (cursor < tooSoonCutoff) {
      status = 'TOO_SOON'
    } else {
      status = 'AVAILABLE'
    }

    slots.push({
      start: cursor.toISOString(),
      end: slotEnd.toISOString(),
      status,
    })

    cursor = new Date(cursor.getTime() + stepMs)
  }

  return {
    barber_id: barberId,
    date,
    timezone,
    slots,
    shop_open: shopOpen,
    barber_scheduled: true,
  }
}

// ---------------------------------------------------------------------------
// generateSlotsForAllBarbers — runs slot generation across all active barbers
// with acuity_calendar_id.  Slot generation failures for individual barbers
// are caught and logged — other barbers continue to be returned.
// ---------------------------------------------------------------------------

export interface AllBarberSlotsResult {
  results: GenerateSlotsResult[]
  errors: Array<{ barber_id: string; error: string }>
}

export async function generateSlotsForAllBarbers(
  supabase: SupabaseClient<Database>,
  provider: CalendarProvider,
  shopId: string,
  date: string,
  timezone: string,
  duration: number,
): Promise<AllBarberSlotsResult> {
  // Load active barbers with Acuity calendar IDs
  const { data: barbersData, error: barbersErr } = await supabase
    .from('users')
    .select('id, acuity_calendar_id')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)
    .not('acuity_calendar_id', 'is', null)

  if (barbersErr) {
    return { results: [], errors: [{ barber_id: 'all', error: barbersErr.message }] }
  }

  type BarberRow = { id: string; acuity_calendar_id: string }
  const barbers = (barbersData ?? []) as unknown as BarberRow[]

  const results: GenerateSlotsResult[] = []
  const errors: Array<{ barber_id: string; error: string }> = []

  await Promise.all(
    barbers.map(async (b) => {
      try {
        const result = await generateBookingSlots(supabase, provider, {
          barberId: b.id,
          calendarId: b.acuity_calendar_id ?? null,
          date,
          shopId,
          duration,
          timezone,
        })
        results.push(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push({ barber_id: b.id, error: msg })
      }
    }),
  )

  return { results, errors }
}
