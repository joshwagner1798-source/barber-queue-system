import { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Shop,
  BusinessHours,
  TimeBlock,
  Appointment,
  BarberState,
} from '@/types/database'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minutes before a booked appointment where a barber is blocked for walk-ins. */
export const WALKIN_APPOINTMENT_BUFFER_MINUTES = 30

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type AvailabilityReason =
  | 'AVAILABLE'
  | 'NOT_SCHEDULED'
  | 'SHOP_CLOSED'
  | 'ON_BREAK'
  | 'IN_APPOINTMENT'
  | 'APPOINTMENT_BUFFER'
  | 'IN_WALKIN'
  | 'OFF'
  | 'CLEANUP'
  | 'OTHER'

export interface BarberAvailability {
  barber_id: string
  barber_name: string
  available: boolean
  reason: AvailabilityReason
  estimated_free_at: string | null
  current_state: BarberState['state'] | null
  shift_start: string | null
  shift_end: string | null
}

export interface ShopAvailability {
  shop_id: string
  calculated_at: string
  shop_open: boolean
  shop_hours: { open: string; close: string } | null
  barbers: BarberAvailability[]
  available_count: number
  total_active_count: number
}

// ---------------------------------------------------------------------------
// Timezone helpers (no external deps — uses Intl API)
// ---------------------------------------------------------------------------

export function getShopLocalTime(timezone: string | null | undefined) {
  // Default to America/New_York if timezone is missing from the shop record
  timezone = timezone || 'America/New_York'
  const now = new Date()

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '0'

  const year = parseInt(get('year'))
  const month = parseInt(get('month')) - 1
  const day = parseInt(get('day'))
  const hour = parseInt(get('hour'))
  const minute = parseInt(get('minute'))
  const second = parseInt(get('second'))

  // 0 = Sunday, matches PostgreSQL extract(dow) and JS getDay()
  const dayOfWeek = new Date(year, month, day).getDay()

  const timeString = [
    String(hour).padStart(2, '0'),
    String(minute).padStart(2, '0'),
    String(second).padStart(2, '0'),
  ].join(':')

  return { dayOfWeek, timeString, now }
}

function isTimeInRange(current: string, open: string, close: string): boolean {
  return current >= open && current < close
}

// ---------------------------------------------------------------------------
// Data fetching — 8 parallel queries
// ---------------------------------------------------------------------------

type AssignmentRow = Database['public']['Tables']['assignments']['Row']
type BarberRow = Pick<Database['public']['Tables']['users']['Row'], 'id' | 'first_name' | 'last_name'>

async function fetchAvailabilityData(
  supabase: SupabaseClient<Database>,
  shopId: string,
) {
  const now = new Date()
  const nowISO = now.toISOString()
  const bufferCutoffISO = new Date(
    now.getTime() + WALKIN_APPOINTMENT_BUFFER_MINUTES * 60_000,
  ).toISOString()

  const [
    shopResult,
    barbersResult,
    hoursResult,
    blocksResult,
    appointmentsResult,
    upcomingApptsResult,
    statesResult,
    assignmentsResult,
  ] = await Promise.all([
    supabase.from('shops').select('*').eq('id', shopId).single(),

    supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('shop_id', shopId)
      .eq('role', 'barber')
      .eq('is_active', true),

    supabase.from('business_hours').select('*').eq('shop_id', shopId),

    // Time blocks overlapping right now (ignores recurrence_rule for v1)
    supabase
      .from('time_blocks')
      .select('*')
      .eq('shop_id', shopId)
      .lte('start_datetime', nowISO)
      .gte('end_datetime', nowISO),

    // Active appointments overlapping right now
    supabase
      .from('appointments')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed'])
      .lte('start_time', nowISO)
      .gte('end_time', nowISO),

    // Upcoming appointments starting within the safety buffer
    supabase
      .from('appointments')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed'])
      .gt('start_time', nowISO)
      .lte('start_time', bufferCutoffISO),

    supabase.from('barber_state').select('*').eq('shop_id', shopId),

    // Walk-in assignments still in progress (no ended_at)
    supabase
      .from('assignments')
      .select('*')
      .eq('shop_id', shopId)
      .is('ended_at', null),
  ])

  if (shopResult.error)
    throw new Error(`Failed to fetch shop: ${shopResult.error.message}`)
  if (barbersResult.error)
    throw new Error(`Failed to fetch barbers: ${barbersResult.error.message}`)

  return {
    shop: shopResult.data as unknown as Shop,
    barbers: (barbersResult.data ?? []) as unknown as BarberRow[],
    hours: (hoursResult.data ?? []) as unknown as BusinessHours[],
    blocks: (blocksResult.data ?? []) as unknown as TimeBlock[],
    appointments: (appointmentsResult.data ?? []) as unknown as Appointment[],
    upcomingAppointments: (upcomingApptsResult.data ?? []) as unknown as Appointment[],
    states: (statesResult.data ?? []) as unknown as BarberState[],
    assignments: (assignmentsResult.data ?? []) as unknown as AssignmentRow[],
  }
}

// ---------------------------------------------------------------------------
// Schedule resolution
// ---------------------------------------------------------------------------

export function getBarberHoursForDay(
  barberId: string,
  dayOfWeek: number,
  allHours: BusinessHours[],
): BusinessHours | null {
  // Barber-specific hours take priority
  const barberHours = allHours.find(
    (h) => h.barber_id === barberId && h.day_of_week === dayOfWeek,
  )
  if (barberHours) return barberHours.is_closed ? null : barberHours

  // Fall back to shop-level default
  const shopHours = allHours.find(
    (h) => h.barber_id === null && h.day_of_week === dayOfWeek,
  )
  if (shopHours) return shopHours.is_closed ? null : shopHours

  return null
}

// ---------------------------------------------------------------------------
// Priority cascade — resolves a single barber's walk-in availability
//
// Order (first match wins):
//   1. SHOP_CLOSED         — shop-level hours say closed today
//   2. NOT_SCHEDULED       — barber has no shift or outside shift window
//   3. barber_state        — real-time override (OFF, ON_BREAK, IN_CHAIR, …)
//   4. time_blocks         — scheduled breaks / closures
//   5. active appointments — currently in a booked appointment
//   6. APPOINTMENT_BUFFER  — booked appointment starts within 30 min
//   7. AVAILABLE           — no conflicts, open for walk-ins
// ---------------------------------------------------------------------------

export function resolveBarber(
  barberId: string,
  barberName: string,
  timeString: string,
  dayOfWeek: number,
  shopClosed: boolean,
  hours: BusinessHours[],
  blocks: TimeBlock[],
  appointments: Appointment[],
  upcomingAppointments: Appointment[],
  states: BarberState[],
  assignments: AssignmentRow[],
): BarberAvailability {
  const base: BarberAvailability = {
    barber_id: barberId,
    barber_name: barberName,
    available: false,
    reason: 'NOT_SCHEDULED',
    estimated_free_at: null,
    current_state: null,
    shift_start: null,
    shift_end: null,
  }

  // P1 — SHOP_CLOSED
  if (shopClosed) {
    base.reason = 'SHOP_CLOSED'
    return base
  }

  // P2 — NOT_SCHEDULED (no shift today)
  const todayHours = getBarberHoursForDay(barberId, dayOfWeek, hours)
  if (!todayHours) {
    base.reason = 'NOT_SCHEDULED'
    return base
  }

  base.shift_start = todayHours.open_time
  base.shift_end = todayHours.close_time

  // P2 — NOT_SCHEDULED (outside shift window)
  if (!isTimeInRange(timeString, todayHours.open_time, todayHours.close_time)) {
    base.reason = 'NOT_SCHEDULED'
    return base
  }

  // P3 — barber_state override
  const state = states.find((s) => s.barber_id === barberId) ?? null
  base.current_state = state?.state ?? null

  if (state) {
    switch (state.state) {
      case 'OFF':
        base.reason = 'OFF'
        return base

      case 'ON_BREAK': {
        base.reason = 'ON_BREAK'
        const block = blocks.find(
          (b) => b.barber_id === barberId || b.barber_id === null,
        )
        base.estimated_free_at =
          block?.end_datetime ?? state.manual_free_at ?? null
        return base
      }

      case 'CLEANUP':
        base.reason = 'CLEANUP'
        base.estimated_free_at = state.manual_free_at ?? null
        return base

      case 'OTHER':
        base.reason = 'OTHER'
        base.estimated_free_at = state.manual_free_at ?? null
        return base

      case 'IN_CHAIR': {
        // Determine if serving an appointment or walk-in
        const appt = appointments.find((a) => a.barber_id === barberId)
        if (appt) {
          base.reason = 'IN_APPOINTMENT'
          base.estimated_free_at = appt.end_time
        } else {
          base.reason = 'IN_WALKIN'
          base.estimated_free_at = state.manual_free_at ?? null
        }
        return base
      }

      case 'AVAILABLE':
        // Fall through — verify against schedule data below
        break
    }
  }

  // P4 — time_blocks (catches conflicts even without barber_state)

  // Shop-wide time block (e.g. holiday closure during the day)
  const shopBlock = blocks.find((b) => b.barber_id === null)
  if (shopBlock) {
    base.reason = 'ON_BREAK'
    base.estimated_free_at = shopBlock.end_datetime
    return base
  }

  // Barber-specific time block
  const barberBlock = blocks.find((b) => b.barber_id === barberId)
  if (barberBlock) {
    base.reason = 'ON_BREAK'
    base.estimated_free_at = barberBlock.end_datetime
    return base
  }

  // P5 — active appointment
  const activeAppt = appointments.find((a) => a.barber_id === barberId)
  if (activeAppt) {
    base.reason = 'IN_APPOINTMENT'
    base.estimated_free_at = activeAppt.end_time
    return base
  }

  // Active walk-in assignment
  const activeAssignment = assignments.find((a) => a.barber_id === barberId)
  if (activeAssignment) {
    base.reason = 'IN_WALKIN'
    base.estimated_free_at = state?.manual_free_at ?? null
    return base
  }

  // P6 — APPOINTMENT_BUFFER (30 min safety rule)
  const upcomingAppt = upcomingAppointments.find(
    (a) => a.barber_id === barberId,
  )
  if (upcomingAppt) {
    base.reason = 'APPOINTMENT_BUFFER'
    base.estimated_free_at = upcomingAppt.end_time
    return base
  }

  // P7 — AVAILABLE (no conflicts)
  base.available = true
  base.reason = 'AVAILABLE'
  return base
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function getShopAvailability(
  supabase: SupabaseClient<Database>,
  shopId: string,
): Promise<ShopAvailability> {
  const data = await fetchAvailabilityData(supabase, shopId)
  const { dayOfWeek, timeString, now } = getShopLocalTime(data.shop.timezone)

  // Determine shop-level open/closed for today
  const shopHoursToday = data.hours.find(
    (h) => h.barber_id === null && h.day_of_week === dayOfWeek,
  )
  const shopExplicitlyClosed = shopHoursToday?.is_closed === true
  const shopOpen =
    !!shopHoursToday &&
    !shopHoursToday.is_closed &&
    isTimeInRange(timeString, shopHoursToday.open_time, shopHoursToday.close_time)

  // Resolve each barber
  const barbers = data.barbers.map((b) =>
    resolveBarber(
      b.id,
      `${b.first_name} ${b.last_name}`,
      timeString,
      dayOfWeek,
      shopExplicitlyClosed,
      data.hours,
      data.blocks,
      data.appointments,
      data.upcomingAppointments,
      data.states,
      data.assignments,
    ),
  )

  return {
    shop_id: shopId,
    calculated_at: now.toISOString(),
    shop_open: shopOpen,
    shop_hours:
      shopHoursToday && !shopHoursToday.is_closed
        ? { open: shopHoursToday.open_time, close: shopHoursToday.close_time }
        : null,
    barbers,
    available_count: barbers.filter((b) => b.available).length,
    total_active_count: data.barbers.length,
  }
}
