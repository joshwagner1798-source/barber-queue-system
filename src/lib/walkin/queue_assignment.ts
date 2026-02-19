import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Walkin, Appointment, Service } from '@/types/database'
import { getShopAvailability, type BarberAvailability } from './availability'
import { appendEvent, WALKIN_AUTO_ASSIGNED } from './events'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SERVICE_MINUTES = 30
/** Buffer before a booked appointment where we won't start a walk-in (minutes). */
const APPOINTMENT_BUFFER_MINUTES = 5

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BarberServiceRow = Database['public']['Tables']['barber_services']['Row']

export interface AssignmentSuggestion {
  walkin_id: string
  walkin_position: number
  barber_id: string
  barber_name: string
  service_type: string
  service_duration_minutes: number
}

export type AutoAssignmentResult =
  | { assigned: true; suggestion: AssignmentSuggestion }
  | { assigned: false; reason: string }

// ---------------------------------------------------------------------------
// Duration resolution (shared with wait_time_estimator pattern)
// ---------------------------------------------------------------------------

function getServiceDuration(
  serviceType: string,
  barberId: string,
  services: Service[],
  barberServices: BarberServiceRow[],
): number {
  const service = services.find(
    (s) => s.name.toLowerCase() === serviceType.toLowerCase(),
  )
  if (!service) return DEFAULT_SERVICE_MINUTES

  const override = barberServices.find(
    (bs) => bs.service_id === service.id && bs.barber_id === barberId,
  )
  return override?.duration_override ?? service.duration_minutes
}

// ---------------------------------------------------------------------------
// Appointment conflict check
// ---------------------------------------------------------------------------

/**
 * Returns true if the barber has a booked appointment starting within
 * `durationMinutes + buffer` from now.  Assigning a walk-in that can't
 * finish before the appointment would create a conflict.
 */
function hasAppointmentConflict(
  barberId: string,
  durationMinutes: number,
  upcomingAppointments: Appointment[],
  now: Date,
): boolean {
  const cutoff = new Date(
    now.getTime() + (durationMinutes + APPOINTMENT_BUFFER_MINUTES) * 60_000,
  )

  return upcomingAppointments.some(
    (a) =>
      a.barber_id === barberId &&
      new Date(a.start_time) <= cutoff &&
      new Date(a.end_time) > now,
  )
}

// ---------------------------------------------------------------------------
// Pure matching — picks the best WAITING walk-in for a barber
// ---------------------------------------------------------------------------

/**
 * Two-pass scan of the WAITING queue:
 *
 * 1. PREFERRED walk-ins that specifically want this barber (lowest position first).
 *    These customers chose to wait for this exact barber — honour that.
 *
 * 2. ANY / FASTEST walk-ins (lowest position first).
 *
 * Returns null if no suitable walk-in exists or if an appointment conflicts.
 */
export function findNextWalkinForBarber(
  barberId: string,
  barber: BarberAvailability,
  waitingQueue: Walkin[],
  upcomingAppointments: Appointment[],
  services: Service[],
  barberServices: BarberServiceRow[],
  now: Date,
): AssignmentSuggestion | null {
  if (!barber.available) return null

  // Sort by position ascending (should already be, but be safe)
  const sorted = [...waitingQueue].sort((a, b) => a.position - b.position)

  // Helper: try to build a suggestion, checking appointment conflict
  const tryMatch = (walkin: Walkin): AssignmentSuggestion | null => {
    const duration = getServiceDuration(
      walkin.service_type,
      barberId,
      services,
      barberServices,
    )

    if (hasAppointmentConflict(barberId, duration, upcomingAppointments, now)) {
      return null
    }

    return {
      walkin_id: walkin.id,
      walkin_position: walkin.position,
      barber_id: barberId,
      barber_name: barber.barber_name,
      service_type: walkin.service_type,
      service_duration_minutes: duration,
    }
  }

  // Pass 1: PREFERRED walk-ins wanting THIS barber
  for (const w of sorted) {
    if (
      w.preference_type === 'PREFERRED' &&
      w.preferred_barber_id === barberId
    ) {
      const suggestion = tryMatch(w)
      if (suggestion) return suggestion
    }
  }

  // Pass 2: ANY or FASTEST (no barber preference)
  for (const w of sorted) {
    if (w.preference_type === 'ANY' || w.preference_type === 'FASTEST') {
      const suggestion = tryMatch(w)
      if (suggestion) return suggestion
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Queue compaction — close position gaps after a walk-in leaves WAITING
// ---------------------------------------------------------------------------

export async function compactQueuePositions(
  supabase: SupabaseClient<Database>,
  shopId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('walkins')
    .select('id, position')
    .eq('shop_id', shopId)
    .eq('status', 'WAITING')
    .order('position', { ascending: true })

  if (error || !data) return

  type WalkinPos = { id: string; position: number }
  const rows = data as unknown as WalkinPos[]

  // Reassign 1, 2, 3, … — only update rows that actually moved
  for (let i = 0; i < rows.length; i++) {
    const newPos = i + 1
    if (rows[i].position !== newPos) {
      // @ts-expect-error — Supabase generated types resolve .update() param to `never`
      await supabase.from('walkins').update({ position: newPos }).eq('id', rows[i].id)
    }
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator — call when a barber becomes AVAILABLE
// ---------------------------------------------------------------------------

export async function processBarberAvailable(
  supabase: SupabaseClient<Database>,
  shopId: string,
  barberId: string,
  actorUserId: string | null,
): Promise<AutoAssignmentResult> {
  // 1. Get current availability (verifies barber is truly AVAILABLE)
  const availability = await getShopAvailability(supabase, shopId)
  const barber = availability.barbers.find((b) => b.barber_id === barberId)

  if (!barber || !barber.available) {
    return { assigned: false, reason: 'Barber is not available' }
  }

  // 2. Fetch queue + upcoming appointments + services in parallel
  const nowISO = new Date().toISOString()

  const [walkinsResult, appointmentsResult, servicesResult, barberSvcResult] =
    await Promise.all([
      supabase
        .from('walkins')
        .select('*')
        .eq('shop_id', shopId)
        .eq('status', 'WAITING')
        .order('position', { ascending: true }),

      // Appointments starting within the next 2 hours for this barber
      supabase
        .from('appointments')
        .select('*')
        .eq('shop_id', shopId)
        .eq('barber_id', barberId)
        .in('status', ['pending', 'confirmed'])
        .gte('start_time', nowISO)
        .lte(
          'start_time',
          new Date(Date.now() + 120 * 60_000).toISOString(),
        ),

      supabase
        .from('services')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_active', true),

      supabase.from('barber_services').select('*'),
    ])

  const waitingQueue = (walkinsResult.data ?? []) as unknown as Walkin[]
  const appointments = (appointmentsResult.data ?? []) as unknown as Appointment[]
  const services = (servicesResult.data ?? []) as unknown as Service[]
  const barberServices =
    (barberSvcResult.data ?? []) as unknown as BarberServiceRow[]

  if (waitingQueue.length === 0) {
    return { assigned: false, reason: 'No walk-ins waiting' }
  }

  // 3. Find the best match
  const suggestion = findNextWalkinForBarber(
    barberId,
    barber,
    waitingQueue,
    appointments,
    services,
    barberServices,
    new Date(),
  )

  if (!suggestion) {
    return {
      assigned: false,
      reason: 'No suitable walk-in (appointment conflict or preference mismatch)',
    }
  }

  // 4. Transition walk-in WAITING → CALLED
  const { error: updateError } = await supabase
    .from('walkins')
    // @ts-expect-error — Supabase generated types resolve .update() param to `never`
    .update({ status: 'CALLED' })
    .eq('id', suggestion.walkin_id)
    .eq('status', 'WAITING') // optimistic lock — only update if still WAITING

  if (updateError) {
    return { assigned: false, reason: `Failed to update walk-in: ${updateError.message}` }
  }

  // 5. Append event
  try {
    await appendEvent(supabase, {
      shop_id: shopId,
      type: WALKIN_AUTO_ASSIGNED,
      actor_user_id: actorUserId,
      payload: {
        walkin_id: suggestion.walkin_id,
        barber_id: suggestion.barber_id,
        barber_name: suggestion.barber_name,
        position: suggestion.walkin_position,
        service_type: suggestion.service_type,
        service_duration_minutes: suggestion.service_duration_minutes,
      },
    })
  } catch {
    // best-effort — assignment already happened
  }

  // 6. Compact queue positions (fire-and-forget — don't block response)
  compactQueuePositions(supabase, shopId).catch(() => {})

  return { assigned: true, suggestion }
}

// ---------------------------------------------------------------------------
// autoAssignWalkins — single centralized function for all auto-assignment
//
// Iterates all AVAILABLE barbers in a shop and assigns walk-ins.
// Uses optimistic locking to prevent double-assignment.
// Called from: DB trigger (via /api/dispatcher), processBarberAvailable, etc.
// ---------------------------------------------------------------------------

export interface AutoAssignResult {
  assignments_made: number
  errors: string[]
}

export async function autoAssignWalkins(
  supabase: SupabaseClient<Database>,
  shopId: string,
): Promise<AutoAssignResult> {
  const result: AutoAssignResult = { assignments_made: 0, errors: [] }
  const now = new Date()

  // 1. Get barbers with AVAILABLE status from barber_status table
  //    (barber_status is computed by the dispatcher from calendar data)
  const { data: availableStatuses, error: statusErr } = await supabase
    .from('barber_status')
    .select('barber_id')
    .eq('shop_id', shopId)
    .eq('status', 'AVAILABLE')

  if (statusErr) {
    result.errors.push(`Failed to load barber statuses: ${statusErr.message}`)
    return result
  }

  type StatusRow = { barber_id: string }
  const availableBarberIds = (
    (availableStatuses ?? []) as unknown as StatusRow[]
  ).map((r) => r.barber_id)

  if (availableBarberIds.length === 0) return result

  // 2. For each available barber, try to assign next walk-in
  for (const barberId of availableBarberIds) {
    // Skip if barber already has an active assignment
    const { data: activeForBarber } = await supabase
      .from('walkins')
      .select('id')
      .eq('shop_id', shopId)
      .eq('assigned_barber_id', barberId)
      .in('status', ['CALLED', 'IN_SERVICE'])
      .limit(1)

    if ((activeForBarber ?? []).length > 0) continue

    // Priority 1: oldest PREFERRED walk-in wanting this barber
    const { data: preferred } = await supabase
      .from('walkins')
      .select('id, display_name')
      .eq('shop_id', shopId)
      .eq('status', 'WAITING')
      .eq('preference_type', 'PREFERRED')
      .eq('preferred_barber_id', barberId)
      .order('position', { ascending: true })
      .limit(1)

    type WalkinRow = { id: string; display_name: string | null }
    let target: WalkinRow | null = null

    if ((preferred ?? []).length > 0) {
      target = (preferred as unknown as WalkinRow[])[0]
    } else {
      // Priority 2: oldest ANY/FASTEST walk-in (FIFO)
      const { data: anyWalkin } = await supabase
        .from('walkins')
        .select('id, display_name')
        .eq('shop_id', shopId)
        .eq('status', 'WAITING')
        .in('preference_type', ['ANY', 'FASTEST'])
        .order('position', { ascending: true })
        .limit(1)

      if ((anyWalkin ?? []).length > 0) {
        target = (anyWalkin as unknown as WalkinRow[])[0]
      }
    }

    if (!target) continue

    // Optimistic lock: only update if still WAITING (prevents double-assign)
    const { data: updated, error: assignErr } = await supabase
      .from('walkins')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({
        status: 'CALLED',
        assigned_barber_id: barberId,
        called_at: now.toISOString(),
      })
      .eq('id', target.id)
      .eq('status', 'WAITING')
      .select('id')

    if (assignErr || !(updated as unknown as { id: string }[] | null)?.length) {
      continue // someone else got it or it was already assigned
    }

    // Create assignment record
    // @ts-expect-error — Supabase generated types resolve insert param to never
    await supabase.from('assignments').insert({
      shop_id: shopId,
      walkin_id: target.id,
      barber_id: barberId,
    })

    // Get barber name for event
    const { data: barberUser } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', barberId)
      .limit(1)

    type UserRow = { first_name: string; last_name: string }
    const user = (barberUser as unknown as UserRow[] | null)?.[0]
    const barberName = user ? `${user.first_name} ${user.last_name}` : ''

    try {
      await appendEvent(supabase, {
        shop_id: shopId,
        type: WALKIN_AUTO_ASSIGNED,
        actor_user_id: null,
        payload: {
          walkin_id: target.id,
          barber_id: barberId,
          barber_name: barberName,
          display_name: target.display_name,
        },
      })
    } catch {
      // best-effort
    }

    result.assignments_made++
  }

  // Compact queue positions after assignments
  if (result.assignments_made > 0) {
    compactQueuePositions(supabase, shopId).catch(() => {})
  }

  return result
}
