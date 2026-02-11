import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Service, Walkin } from '@/types/database'
import {
  getShopAvailability,
  type ShopAvailability,
  type BarberAvailability,
} from './availability'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const DEFAULT_SERVICE_MINUTES = 30

type BarberServiceRow = Database['public']['Tables']['barber_services']['Row']

export interface WalkinEstimate {
  walkin_id: string
  position: number
  service_type: string
  preference_type: Walkin['preference_type']
  estimated_wait_minutes: number
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
}

// ---------------------------------------------------------------------------
// Duration resolution
// ---------------------------------------------------------------------------

/**
 * Build a lookup: (service_type, barber_id?) → duration_minutes.
 *
 * Walk-ins store service_type as a string (e.g. "cut"). We match against
 * services.name (case-insensitive). barber_services may override duration
 * per barber.
 */
function buildDurationLookup(
  services: Service[],
  barberServices: BarberServiceRow[],
) {
  // service name (lowercase) → base duration
  const baseDurations = new Map<string, number>()
  // service name (lowercase) → service id
  const serviceIdByName = new Map<string, string>()

  for (const s of services) {
    baseDurations.set(s.name.toLowerCase(), s.duration_minutes)
    serviceIdByName.set(s.name.toLowerCase(), s.id)
  }

  // (service_id, barber_id) → override duration
  const overrides = new Map<string, number>()
  for (const bs of barberServices) {
    if (bs.duration_override != null) {
      overrides.set(`${bs.service_id}:${bs.barber_id}`, bs.duration_override)
    }
  }

  return {
    /** Get duration in minutes for a service_type, optionally for a specific barber. */
    get(serviceType: string, barberId?: string): number {
      const key = serviceType.toLowerCase()
      const base = baseDurations.get(key) ?? DEFAULT_SERVICE_MINUTES
      if (!barberId) return base

      const serviceId = serviceIdByName.get(key)
      if (!serviceId) return base

      return overrides.get(`${serviceId}:${barberId}`) ?? base
    },
  }
}

// ---------------------------------------------------------------------------
// Barber timeline — tracks when each barber becomes free
// ---------------------------------------------------------------------------

interface BarberSlot {
  barber_id: string
  barber_name: string
  free_at: Date
}

function buildBarberTimeline(
  barbers: BarberAvailability[],
  now: Date,
): BarberSlot[] {
  const slots: BarberSlot[] = []

  for (const b of barbers) {
    // Skip barbers who can't serve anyone today
    if (
      b.reason === 'NOT_SCHEDULED' ||
      b.reason === 'SHOP_CLOSED' ||
      b.reason === 'OFF'
    ) {
      continue
    }

    let freeAt: Date
    if (b.available) {
      // Ready right now
      freeAt = now
    } else if (b.estimated_free_at) {
      freeAt = new Date(b.estimated_free_at)
      // If estimate is in the past (stale data), treat as available now
      if (freeAt < now) freeAt = now
    } else {
      // Busy with no estimate — assume DEFAULT_SERVICE_MINUTES from now
      freeAt = new Date(now.getTime() + DEFAULT_SERVICE_MINUTES * 60_000)
    }

    slots.push({
      barber_id: b.barber_id,
      barber_name: b.barber_name,
      free_at: freeAt,
    })
  }

  return slots
}

function findEarliestSlot(slots: BarberSlot[]): BarberSlot | null {
  if (slots.length === 0) return null
  return slots.reduce((best, s) => (s.free_at < best.free_at ? s : best))
}

// ---------------------------------------------------------------------------
// Core simulation — pure function, no DB calls
// ---------------------------------------------------------------------------

export function estimateQueue(
  availability: ShopAvailability,
  waitingQueue: Walkin[],
  services: Service[],
  barberServices: BarberServiceRow[],
): QueueEstimate {
  const now = new Date(availability.calculated_at)
  const durations = buildDurationLookup(services, barberServices)
  const timeline = buildBarberTimeline(availability.barbers, now)

  // Snapshot: who is the very next free barber (before any simulation)?
  const nextFree = findEarliestSlot(timeline)
  const nextAvailableBarber = nextFree
    ? {
        barber_id: nextFree.barber_id,
        barber_name: nextFree.barber_name,
        free_at: nextFree.free_at.toISOString(),
      }
    : null

  const estimates: WalkinEstimate[] = []

  // Process queue in position order — each walk-in "claims" a barber slot
  const sorted = [...waitingQueue].sort((a, b) => a.position - b.position)

  for (const walkin of sorted) {
    // No barbers in the timeline at all
    if (timeline.length === 0) {
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

    let chosen: BarberSlot | null = null

    if (
      walkin.preference_type === 'PREFERRED' &&
      walkin.preferred_barber_id
    ) {
      // Customer wants a specific barber — wait for them
      chosen =
        timeline.find((s) => s.barber_id === walkin.preferred_barber_id) ?? null
    }

    if (!chosen) {
      // ANY or FASTEST or preferred barber unavailable — take earliest
      chosen = findEarliestSlot(timeline)
    }

    if (!chosen) {
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

    const waitMs = Math.max(0, chosen.free_at.getTime() - now.getTime())
    const waitMinutes = Math.round(waitMs / 60_000)
    const serviceDuration = durations.get(walkin.service_type, chosen.barber_id)

    estimates.push({
      walkin_id: walkin.id,
      position: walkin.position,
      service_type: walkin.service_type,
      preference_type: walkin.preference_type,
      estimated_wait_minutes: waitMinutes,
      estimated_start_at: chosen.free_at.toISOString(),
      suggested_barber_id: chosen.barber_id,
      suggested_barber_name: chosen.barber_name,
    })

    // Advance this barber's timeline — they're now busy for service_duration
    chosen.free_at = new Date(
      chosen.free_at.getTime() + serviceDuration * 60_000,
    )
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
  }
}

// ---------------------------------------------------------------------------
// Orchestrator — fetches all data and runs the simulation
// ---------------------------------------------------------------------------

export async function getQueueEstimate(
  supabase: SupabaseClient<Database>,
  shopId: string,
): Promise<QueueEstimate> {
  // Run availability + data fetches in parallel
  const [availability, walkinsResult, servicesResult, barberServicesResult] =
    await Promise.all([
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
    ])

  const waitingQueue = (walkinsResult.data ?? []) as unknown as Walkin[]
  const services = (servicesResult.data ?? []) as unknown as Service[]
  const barberServices =
    (barberServicesResult.data ?? []) as unknown as BarberServiceRow[]

  return estimateQueue(availability, waitingQueue, services, barberServices)
}
