/**
 * Shared test fixtures for walk-in queue tests.
 *
 * All timestamps assume "now" = 2025-06-15T14:00:00Z (Sunday, 2pm UTC).
 * Shop timezone = America/Chicago (CDT = UTC-5, so local = 9:00 AM Sunday).
 */

import type {
  BusinessHours,
  TimeBlock,
  Appointment,
  BarberState,
  Walkin,
  Service,
} from '@/types/database'
import type { Database } from '@/types/database'
import type { ShopAvailability, BarberAvailability } from '../availability'

type AssignmentRow = Database['public']['Tables']['assignments']['Row']
type BarberServiceRow = Database['public']['Tables']['barber_services']['Row']

// ---------------------------------------------------------------------------
// Time anchors
// ---------------------------------------------------------------------------

export const NOW = new Date('2025-06-15T14:00:00Z')
export const NOW_ISO = NOW.toISOString()
export const DAY_OF_WEEK = 0 // Sunday
export const TIME_STRING = '09:00:00' // 9 AM CDT

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

export const SHOP_ID = 'shop-001'
export const BARBER_A_ID = 'barber-a'
export const BARBER_B_ID = 'barber-b'
export const BARBER_C_ID = 'barber-c'
export const SERVICE_CUT_ID = 'svc-cut'

// ---------------------------------------------------------------------------
// Business hours — shop open Sunday 8am–6pm, all barbers use shop default
// ---------------------------------------------------------------------------

export const SHOP_HOURS_SUNDAY: BusinessHours = {
  id: 'bh-1',
  shop_id: SHOP_ID,
  barber_id: null,
  day_of_week: 0, // Sunday
  open_time: '08:00:00',
  close_time: '18:00:00',
  is_closed: false,
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
}

export const SHOP_HOURS_CLOSED: BusinessHours = {
  ...SHOP_HOURS_SUNDAY,
  is_closed: true,
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export const SERVICE_CUT: Service = {
  id: SERVICE_CUT_ID,
  shop_id: SHOP_ID,
  name: 'cut',
  description: null,
  duration_minutes: 30,
  price: 25,
  deposit_amount: null,
  category: null,
  is_active: true,
  display_order: 0,
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
}

// ---------------------------------------------------------------------------
// Barber states
// ---------------------------------------------------------------------------

export function barberState(
  barberId: string,
  state: BarberState['state'],
  overrides?: Partial<BarberState>,
): BarberState {
  return {
    shop_id: SHOP_ID,
    barber_id: barberId,
    state,
    state_since: NOW_ISO,
    manual_free_at: null,
    updated_at: NOW_ISO,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export function appointment(
  barberId: string,
  startOffset: number,
  durationMinutes: number,
  overrides?: Partial<Appointment>,
): Appointment {
  const start = new Date(NOW.getTime() + startOffset * 60_000)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  return {
    id: `appt-${barberId}-${startOffset}`,
    shop_id: SHOP_ID,
    customer_id: 'cust-1',
    barber_id: barberId,
    service_id: SERVICE_CUT_ID,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    service_price: 25,
    deposit_amount: 0,
    status: 'confirmed',
    notes: null,
    cancelled_at: null,
    cancellation_reason: null,
    cancelled_by: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Walk-ins
// ---------------------------------------------------------------------------

export function walkin(
  position: number,
  overrides?: Partial<Walkin>,
): Walkin {
  return {
    id: `walkin-${position}`,
    shop_id: SHOP_ID,
    created_at: new Date(NOW.getTime() - position * 60_000).toISOString(),
    service_type: 'cut',
    preference_type: 'ANY',
    preferred_barber_id: null,
    status: 'WAITING',
    position,
    notes: null,
    client_id: null,
    display_name: null,
    assigned_barber_id: null,
    called_at: null,
    updated_at: NOW_ISO,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Barber availability (pre-built for downstream tests)
// ---------------------------------------------------------------------------

export function availableBarber(
  barberId: string,
  name: string,
): BarberAvailability {
  return {
    barber_id: barberId,
    barber_name: name,
    available: true,
    reason: 'AVAILABLE',
    estimated_free_at: null,
    current_state: 'AVAILABLE',
    shift_start: '08:00:00',
    shift_end: '18:00:00',
  }
}

export function busyBarber(
  barberId: string,
  name: string,
  reason: BarberAvailability['reason'],
  freeAt: string | null,
): BarberAvailability {
  return {
    barber_id: barberId,
    barber_name: name,
    available: false,
    reason,
    estimated_free_at: freeAt,
    current_state: 'IN_CHAIR',
    shift_start: '08:00:00',
    shift_end: '18:00:00',
  }
}

// ---------------------------------------------------------------------------
// ShopAvailability builder
// ---------------------------------------------------------------------------

export function shopAvailability(
  barbers: BarberAvailability[],
): ShopAvailability {
  return {
    shop_id: SHOP_ID,
    calculated_at: NOW_ISO,
    shop_open: true,
    shop_hours: { open: '08:00:00', close: '18:00:00' },
    barbers,
    available_count: barbers.filter((b) => b.available).length,
    total_active_count: barbers.length,
  }
}

// ---------------------------------------------------------------------------
// Empty defaults
// ---------------------------------------------------------------------------

export const EMPTY_HOURS: BusinessHours[] = []
export const EMPTY_BLOCKS: TimeBlock[] = []
export const EMPTY_APPOINTMENTS: Appointment[] = []
export const EMPTY_STATES: BarberState[] = []
export const EMPTY_ASSIGNMENTS: AssignmentRow[] = []
export const EMPTY_SERVICES: Service[] = []
export const EMPTY_BARBER_SERVICES: BarberServiceRow[] = []
