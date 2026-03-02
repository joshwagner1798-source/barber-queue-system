import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Service, Walkin } from '@/types/database'
import {
  getShopAvailability,
  type ShopAvailability,
  type BarberAvailability,
} from './availability'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Average minutes per walk-in service. Used in the wait formula:
 *   wait(i) = base_ready_minutes + i * AVG_WALKIN_MINUTES
 * where i is the 0-indexed position in the WAITING queue (0 = first in line).
 */
export const AVG_WALKIN_MINUTES = 30

// Internal fallback for the SIMULATION (suggested_barber_id only — NOT used
// for the wait formula). Keeps the barber-suggestion simulation functional
// even when we lack an estimate.
const SIMULATION_FALLBACK_MINUTES = 30

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BarberServiceRow = Database['public']['Tables']['barber_services']['Row']

export interface WalkinEstimate {
  walkin_id: string
  position: number
  service_type: string
  preference_type: Walkin['preference_type']
  estimated_wait_minutes: number   // -1 = no eligible barbers
  estimated_start_at: string | null
  suggested_barber_id: string | null
  suggested_barber_name: string | null
}

export interface QueueEstimate {
  shop_id: string
  calculated_at: string
  shop_open: boolean
  estimates: WalkinEstimate[]
  next_available_barber: {
    barber_id: string
    barber_name: string
    free_at: string
  } | null
  average_wait_minutes: number
  base_ready_minutes: number | null   // minutes until earliest walkin-eligible barber is free
}

// ---------------------------------------------------------------------------
// computeBaseReadyMinutes — pure function
//
// Returns the minimum minutes-until-free across all walkin-eligible barbers.
// This is the "base" in the formula: wait(i) = base + i * AVG_WALKIN_MINUTES.
//
// Rules per barber:
//   • available=true                     → 0
//   • busy, estimated_free_at known      → max(0, free_at - now)
//   • busy, estimated_free_at from Acuity (acuityFreeAt map) → max(0, free_at - now)
//   • busy, NO estimate anywhere         → excluded (spec: "treat as not eligible")
//   • NOT_SCHEDULED / SHOP_CLOSED / OFF  → excluded
//   • walkin_enabled=false               → excluded (filtered by walkinEnabledIds)
//
// Returns null if no eligible barbers exist at all.
// ---------------------------------------------------------------------------

export function computeBaseReadyMinutes(
  barbers: BarberAvailability[],
  now: Date,
  walkinEnabledIds?: Set<string>,
  /** Acuity-synced free_at per barber (from barber_status table, more accurate for appt-based shops). */
  acuityFreeAt?: Map<string, string | null>,
): number | null {
  let minMs: number | null = null

  for (const b of barbers) {
    // Filter to walkin-eligible barbers only
    if (walkinEnabledIds && !walkinEnabledIds.has(b.barber_id)) continue

    // Barbers not working today — skip entirely
    if (
      b.reason === 'NOT_SCHEDULED' ||
      b.reason === 'SHOP_CLOSED' ||
      b.reason === 'OFF'
    ) continue

    let readyMs: number

    if (b.available) {
      readyMs = 0
    } else {
      // Resolve the best available estimate:
      // 1. availability cascade (barber_state / native appointments / blocks)
      // 2. Acuity barber_status.free_at (more accurate for Acuity-based shops)
      const estimatedFreeAt =
        b.estimated_free_at ??
        acuityFreeAt?.get(b.barber_id) ??
        null

      if (!estimatedFreeAt) {
        // No estimate for this busy barber — exclude from base calculation.
        // Spec: "else if unknown: treat as not eligible".
        // (The barber is still in the suggestion simulation below.)
        continue
      }

      const freeAt = new Date(estimatedFreeAt)
      // Clamp: if estimate is stale (in the past), treat as free now
      readyMs = Math.max(0, freeAt.getTime() - now.getTime())
    }

    if (minMs === null || readyMs < minMs) minMs = readyMs
  }

  if (minMs === null) return null
  return Math.round(minMs / 60_000)
}

// ---------------------------------------------------------------------------
// Duration resolution
// ---------------------------------------------------------------------------

function buildDurationLookup(
  services: Service[],
  barberServices: BarberServiceRow[],
) {
  const baseDurations = new Map<string, number>()
  const serviceIdByName = new Map<string, string>()

  for (const s of services) {
    baseDurations.set(s.name.toLowerCase(), s.duration_minutes)
    serviceIdByName.set(s.name.toLowerCase(), s.id)
  }

  const overrides = new Map<string, number>()
  for (const bs of barberServices) {
    if (bs.duration_override != null) {
      overrides.set(`${bs.service_id}:${bs.barber_id}`, bs.duration_override)
    }
  }

  return {
    get(serviceType: string, barberId?: string): number {
      const key = serviceType.toLowerCase()
      const base = baseDurations.get(key) ?? SIMULATION_FALLBACK_MINUTES
      if (!barberId) return base
      const serviceId = serviceIdByName.get(key)
      if (!serviceId) return base
      return overrides.get(`${serviceId}:${barberId}`) ?? base
    },
  }
}

// ---------------------------------------------------------------------------
// Barber timeline — used ONLY for suggested_barber_id simulation.
// NOT used for wait time calculation (that uses the formula instead).
// ---------------------------------------------------------------------------

interface BarberSlot {
  barber_id: string
  barber_name: string
  free_at: Date
}

function buildBarberTimeline(
  barbers: BarberAvailability[],
  now: Date,
  walkinEnabledIds?: Set<string>,
  acuityFreeAt?: Map<string, string | null>,
): BarberSlot[] {
  const slots: BarberSlot[] = []

  for (const b of barbers) {
    // Only walkin-eligible barbers get walk-in suggestions
    if (walkinEnabledIds && !walkinEnabledIds.has(b.barber_id)) continue

    if (
      b.reason === 'NOT_SCHEDULED' ||
      b.reason === 'SHOP_CLOSED' ||
      b.reason === 'OFF'
    ) continue

    let freeAt: Date
    if (b.available) {
      freeAt = now
    } else {
      const estimatedFreeAt =
        b.estimated_free_at ??
        acuityFreeAt?.get(b.barber_id) ??
        null

      if (estimatedFreeAt) {
        freeAt = new Date(estimatedFreeAt)
        if (freeAt < now) freeAt = now // clamp stale estimates
      } else {
        // No estimate — use fallback ONLY for barber suggestion simulation,
        // not for the wait formula. This barber is excluded from base calc above.
        freeAt = new Date(now.getTime() + SIMULATION_FALLBACK_MINUTES * 60_000)
      }
    }

    slots.push({ barber_id: b.barber_id, barber_name: b.barber_name, free_at: freeAt })
  }

  return slots
}

function findEarliestSlot(slots: BarberSlot[]): BarberSlot | null {
  if (slots.length === 0) return null
  return slots.reduce((best, s) => (s.free_at < best.free_at ? s : best))
}

// ---------------------------------------------------------------------------
// Core estimation — pure function, no DB calls
//
// Wait time formula:
//   estimated_wait_minutes(i) = base_ready_minutes + i * AVG_WALKIN_MINUTES
//
// where i is the 0-indexed position in the sorted WAITING queue
// (i=0 for the first person in line, i=1 for second, etc.).
//
// This ensures:
//   - First walk-in (i=0): wait = base_ready_minutes only (no +30)
//   - Each additional walk-in ahead adds exactly AVG_WALKIN_MINUTES
//
// The barber-suggestion simulation (suggested_barber_id / estimated_start_at)
// uses a separate timeline and is informational only — it does not affect
// the wait_minutes values.
// ---------------------------------------------------------------------------

export function estimateQueue(
  availability: ShopAvailability,
  waitingQueue: Walkin[],
  services: Service[],
  barberServices: BarberServiceRow[],
  /** IDs of barbers with walkin_enabled=true. If omitted, all barbers are used. */
  walkinEnabledIds?: Set<string>,
  /** Acuity-synced free_at per barber (barber_status.free_at). */
  acuityFreeAt?: Map<string, string | null>,
): QueueEstimate {
  const now = new Date(availability.calculated_at)
  const durations = buildDurationLookup(services, barberServices)

  // Build walkin-eligible timeline for suggestions
  const timeline = buildBarberTimeline(
    availability.barbers,
    now,
    walkinEnabledIds,
    acuityFreeAt,
  )

  // Snapshot: who is the very next free WALKIN-ELIGIBLE barber?
  const nextFree = findEarliestSlot(timeline)
  const nextAvailableBarber = nextFree
    ? {
        barber_id: nextFree.barber_id,
        barber_name: nextFree.barber_name,
        free_at: nextFree.free_at.toISOString(),
      }
    : null

  // Compute base_ready_minutes once — shared across all walk-ins
  const base = computeBaseReadyMinutes(
    availability.barbers,
    now,
    walkinEnabledIds,
    acuityFreeAt,
  )

  const estimates: WalkinEstimate[] = []
  const sorted = [...waitingQueue].sort((a, b) => a.position - b.position)

  for (let i = 0; i < sorted.length; i++) {
    const walkin = sorted[i]

    // No walkin-eligible barbers in the shop at all
    if (timeline.length === 0 || base === null) {
      estimates.push({
        walkin_id: walkin.id,
        position: walkin.position,
        service_type: walkin.service_type,
        preference_type: walkin.preference_type,
        estimated_wait_minutes: -1,
        estimated_start_at: null,
        suggested_barber_id: null,
        suggested_barber_name: null,
      })
      continue
    }

    // -----------------------------------------------------------------------
    // Wait time: formula
    // i = 0-indexed rank in the WAITING queue (not DB position, which is 1-indexed)
    // -----------------------------------------------------------------------
    const waitMinutes = base + i * AVG_WALKIN_MINUTES
    const estimatedStartAt = new Date(
      now.getTime() + waitMinutes * 60_000,
    ).toISOString()

    // -----------------------------------------------------------------------
    // Barber suggestion: simulation (informational — picks the earliest slot)
    // -----------------------------------------------------------------------
    let chosen: BarberSlot | null = null

    if (
      walkin.preference_type === 'PREFERRED' &&
      walkin.preferred_barber_id
    ) {
      chosen =
        timeline.find((s) => s.barber_id === walkin.preferred_barber_id) ?? null
    }

    if (!chosen) {
      chosen = findEarliestSlot(timeline)
    }

    estimates.push({
      walkin_id: walkin.id,
      position: walkin.position,
      service_type: walkin.service_type,
      preference_type: walkin.preference_type,
      estimated_wait_minutes: waitMinutes,
      estimated_start_at: estimatedStartAt,
      suggested_barber_id: chosen?.barber_id ?? null,
      suggested_barber_name: chosen?.barber_name ?? null,
    })

    // Advance the chosen barber's simulation slot so the NEXT walk-in gets a
    // different barber suggestion if available.
    if (chosen) {
      const serviceDuration = durations.get(walkin.service_type, chosen.barber_id)
      chosen.free_at = new Date(
        chosen.free_at.getTime() + serviceDuration * 60_000,
      )
    }
  }

  const validEstimates = estimates.filter((e) => e.estimated_wait_minutes >= 0)
  const averageWait =
    validEstimates.length > 0
      ? Math.round(
          validEstimates.reduce((sum, e) => sum + e.estimated_wait_minutes, 0) /
            validEstimates.length,
        )
      : 0

  return {
    shop_id: availability.shop_id,
    calculated_at: availability.calculated_at,
    shop_open: availability.shop_open,
    estimates,
    next_available_barber: nextAvailableBarber,
    average_wait_minutes: averageWait,
    base_ready_minutes: base,
  }
}

// ---------------------------------------------------------------------------
// computeWalkinWaitMinutes — async convenience helper
//
// Returns the estimated wait for a walk-in at the given 0-indexed position
// in the WAITING queue without computing the full queue estimate.
//
// walkinPositionZeroIndexed: 0 = first in line, 1 = second, etc.
// Returns null if no walkin-eligible barbers are available.
// ---------------------------------------------------------------------------

export async function computeWalkinWaitMinutes(
  supabase: SupabaseClient<Database>,
  shopId: string,
  walkinPositionZeroIndexed: number,
  now: Date = new Date(),
): Promise<number | null> {
  const [availability, walkinBarbers, statusResult] = await Promise.all([
    getShopAvailability(supabase, shopId),

    supabase
      .from('users')
      .select('id')
      .eq('shop_id', shopId)
      .eq('role', 'barber')
      .eq('is_active', true)
      .eq('walkin_enabled', true),

    supabase
      .from('barber_status')
      .select('barber_id, free_at')
      .eq('shop_id', shopId),
  ])

  type IdRow = { id: string }
  type StatusRow = { barber_id: string; free_at: string | null }

  const walkinEnabledIds = new Set(
    (walkinBarbers.data ?? []).map((r) => (r as unknown as IdRow).id),
  )

  const acuityFreeAt = new Map<string, string | null>()
  for (const s of (statusResult.data ?? []) as unknown as StatusRow[]) {
    acuityFreeAt.set(s.barber_id, s.free_at)
  }

  const base = computeBaseReadyMinutes(
    availability.barbers,
    now,
    walkinEnabledIds,
    acuityFreeAt,
  )

  if (base === null) return null
  return base + walkinPositionZeroIndexed * AVG_WALKIN_MINUTES
}

// ---------------------------------------------------------------------------
// Orchestrator — fetches all data and runs the full queue estimate
// ---------------------------------------------------------------------------

export async function getQueueEstimate(
  supabase: SupabaseClient<Database>,
  shopId: string,
): Promise<QueueEstimate> {
  const [
    availability,
    walkinsResult,
    servicesResult,
    barberServicesResult,
    walkinBarbers,
    statusResult,
  ] = await Promise.all([
    getShopAvailability(supabase, shopId),

    supabase
      .from('walkins')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'WAITING')
      .order('position', { ascending: true }),

    supabase
      .from('services')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true),

    supabase.from('barber_services').select('*'),

    // walkin_enabled filter — only walkin-eligible barbers count toward wait time
    supabase
      .from('users')
      .select('id')
      .eq('shop_id', shopId)
      .eq('role', 'barber')
      .eq('is_active', true)
      .eq('walkin_enabled', true),

    // Acuity-synced free_at — more accurate than manual barber_state for appt-based shops
    supabase
      .from('barber_status')
      .select('barber_id, free_at')
      .eq('shop_id', shopId),
  ])

  type IdRow = { id: string }
  type StatusRow = { barber_id: string; free_at: string | null }

  const walkinEnabledIds = new Set(
    (walkinBarbers.data ?? []).map((r) => (r as unknown as IdRow).id),
  )

  const acuityFreeAt = new Map<string, string | null>()
  for (const s of (statusResult.data ?? []) as unknown as StatusRow[]) {
    acuityFreeAt.set(s.barber_id, s.free_at)
  }

  const waitingQueue = (walkinsResult.data ?? []) as unknown as Walkin[]
  const services = (servicesResult.data ?? []) as unknown as Service[]
  const barberServices =
    (barberServicesResult.data ?? []) as unknown as BarberServiceRow[]

  return estimateQueue(
    availability,
    waitingQueue,
    services,
    barberServices,
    walkinEnabledIds,
    acuityFreeAt,
  )
}
