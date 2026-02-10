import { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Walkin,
  Service,
  WalkinEvent,
} from '@/types/database'
import {
  getShopAvailability,
  type ShopAvailability,
  type BarberAvailability,
  type AvailabilityReason,
} from './availability'
import { estimateQueue, type WalkinEstimate } from './wait_time_estimator'
import { WALKIN_AUTO_ASSIGNED } from './events'

// ---------------------------------------------------------------------------
// Snapshot shape — the single read-optimized view for the frontend
// ---------------------------------------------------------------------------

type BarberStateValue = Database['public']['Tables']['barber_state']['Row']['state']
type AssignmentRow = Database['public']['Tables']['assignments']['Row']
type BarberServiceRow = Database['public']['Tables']['barber_services']['Row']

export interface SnapshotBarber {
  barber_id: string
  barber_name: string
  available: boolean
  reason: AvailabilityReason
  estimated_free_at: string | null
  current_state: BarberStateValue | null
  shift_start: string | null
  shift_end: string | null
  current_walkin_id: string | null
  minutes_until_free: number | null
}

export interface SnapshotWaitingWalkin {
  id: string
  position: number
  service_type: string
  preference_type: Walkin['preference_type']
  preferred_barber_id: string | null
  joined_at: string
  estimated_wait_minutes: number
  suggested_barber_id: string | null
  suggested_barber_name: string | null
}

export interface SnapshotCalledWalkin {
  id: string
  service_type: string
  preference_type: Walkin['preference_type']
  called_by_barber_id: string | null
  called_by_barber_name: string | null
}

export interface SnapshotInServiceWalkin {
  id: string
  service_type: string
  barber_id: string
  barber_name: string
  started_at: string
}

export interface ShopSnapshot {
  shop_open: boolean
  shop_hours: { open: string; close: string } | null

  barbers: SnapshotBarber[]

  queue: {
    waiting: SnapshotWaitingWalkin[]
    called: SnapshotCalledWalkin[]
    in_service: SnapshotInServiceWalkin[]
  }

  stats: {
    available_barbers: number
    total_active_barbers: number
    waiting_count: number
    called_count: number
    in_service_count: number
    average_wait_minutes: number
    next_available_barber: {
      barber_id: string
      barber_name: string
      free_at: string
    } | null
  }
}

// ---------------------------------------------------------------------------
// Data fetching — everything the projector needs beyond availability
// ---------------------------------------------------------------------------

async function fetchProjectionData(
  supabase: SupabaseClient<Database>,
  shopId: string,
) {
  const [
    calledResult,
    inServiceResult,
    assignmentsResult,
    autoAssignEventsResult,
    servicesResult,
    barberSvcResult,
  ] = await Promise.all([
    // CALLED walk-ins
    supabase
      .from('walkins')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'CALLED'),

    // IN_SERVICE walk-ins
    supabase
      .from('walkins')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'IN_SERVICE'),

    // Active assignments (barber ↔ walk-in link)
    supabase
      .from('assignments')
      .select('*')
      .eq('shop_id', shopId)
      .is('ended_at', null),

    // Recent auto-assign events (for CALLED → barber mapping)
    supabase
      .from('events')
      .select('*')
      .eq('shop_id', shopId)
      .eq('type', WALKIN_AUTO_ASSIGNED)
      .order('created_at', { ascending: false })
      .limit(50),

    supabase
      .from('services')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true),

    supabase.from('barber_services').select('*'),
  ])

  return {
    called: (calledResult.data ?? []) as unknown as Walkin[],
    inService: (inServiceResult.data ?? []) as unknown as Walkin[],
    assignments: (assignmentsResult.data ?? []) as unknown as AssignmentRow[],
    autoAssignEvents: (autoAssignEventsResult.data ?? []) as unknown as WalkinEvent[],
    services: (servicesResult.data ?? []) as unknown as Service[],
    barberServices: (barberSvcResult.data ?? []) as unknown as BarberServiceRow[],
  }
}

// ---------------------------------------------------------------------------
// Snapshot builder — pure function, combines availability + queue data
// ---------------------------------------------------------------------------

function buildSnapshot(
  availability: ShopAvailability,
  waitingQueue: Walkin[],
  queueEstimates: WalkinEstimate[],
  called: Walkin[],
  inService: Walkin[],
  assignments: AssignmentRow[],
  autoAssignEvents: WalkinEvent[],
  barberNames: Map<string, string>,
): ShopSnapshot {
  // Map walk-in ID → barber from auto-assign events (most recent wins)
  const calledByBarber = new Map<string, { id: string; name: string }>()
  for (const evt of autoAssignEvents) {
    const p = evt.payload as Record<string, unknown>
    const walkinId = p.walkin_id as string
    if (!calledByBarber.has(walkinId)) {
      calledByBarber.set(walkinId, {
        id: p.barber_id as string,
        name: (p.barber_name as string) ?? barberNames.get(p.barber_id as string) ?? '',
      })
    }
  }

  // Map barber ID → active walk-in (from assignments)
  const barberWalkin = new Map<string, string>()
  for (const a of assignments) {
    barberWalkin.set(a.barber_id, a.walkin_id)
  }

  // Map walkin ID → assignment (for started_at)
  const walkinAssignment = new Map<string, AssignmentRow>()
  for (const a of assignments) {
    walkinAssignment.set(a.walkin_id, a)
  }

  // Estimate map: walkin_id → estimate
  const estimateMap = new Map<string, WalkinEstimate>()
  for (const e of queueEstimates) {
    estimateMap.set(e.walkin_id, e)
  }

  // --- Build barbers ---
  const now = new Date(availability.calculated_at)
  const barbers: SnapshotBarber[] = availability.barbers.map(
    (b: BarberAvailability) => {
      let minutes_until_free: number | null
      if (b.available) {
        minutes_until_free = 0
      } else if (b.estimated_free_at) {
        const diffMs = new Date(b.estimated_free_at).getTime() - now.getTime()
        minutes_until_free = Math.max(0, Math.ceil(diffMs / 60_000))
      } else {
        minutes_until_free = null
      }

      return {
        barber_id: b.barber_id,
        barber_name: b.barber_name,
        available: b.available,
        reason: b.reason,
        estimated_free_at: b.estimated_free_at,
        current_state: b.current_state,
        shift_start: b.shift_start,
        shift_end: b.shift_end,
        current_walkin_id: barberWalkin.get(b.barber_id) ?? null,
        minutes_until_free,
      }
    },
  )

  // --- Build queue sections ---
  const waiting: SnapshotWaitingWalkin[] = [...waitingQueue]
    .sort((a, b) => a.position - b.position)
    .map((w) => {
      const est = estimateMap.get(w.id)
      return {
        id: w.id,
        position: w.position,
        service_type: w.service_type,
        preference_type: w.preference_type,
        preferred_barber_id: w.preferred_barber_id,
        joined_at: w.created_at,
        estimated_wait_minutes: est?.estimated_wait_minutes ?? -1,
        suggested_barber_id: est?.suggested_barber_id ?? null,
        suggested_barber_name: est?.suggested_barber_name ?? null,
      }
    })

  const calledList: SnapshotCalledWalkin[] = called.map((w) => {
    const cb = calledByBarber.get(w.id)
    return {
      id: w.id,
      service_type: w.service_type,
      preference_type: w.preference_type,
      called_by_barber_id: cb?.id ?? null,
      called_by_barber_name: cb?.name ?? null,
    }
  })

  const inServiceList: SnapshotInServiceWalkin[] = inService.map((w) => {
    const assignment = walkinAssignment.get(w.id)
    const bName =
      barberNames.get(assignment?.barber_id ?? '') ?? ''
    return {
      id: w.id,
      service_type: w.service_type,
      barber_id: assignment?.barber_id ?? '',
      barber_name: bName,
      started_at: assignment?.started_at ?? w.updated_at,
    }
  })

  // --- Stats ---
  const validEstimates = waiting.filter((w) => w.estimated_wait_minutes >= 0)
  const avgWait =
    validEstimates.length > 0
      ? Math.round(
          validEstimates.reduce((s, w) => s + w.estimated_wait_minutes, 0) /
            validEstimates.length,
        )
      : 0

  // Find next available barber from availability data
  const availableBarbers = availability.barbers.filter((b) => b.available)
  const nextBarber =
    availableBarbers.length > 0
      ? {
          barber_id: availableBarbers[0].barber_id,
          barber_name: availableBarbers[0].barber_name,
          free_at: availability.calculated_at,
        }
      : (() => {
          // Find the soonest-to-be-free barber
          const busy = availability.barbers
            .filter((b) => b.estimated_free_at)
            .sort(
              (a, b) =>
                new Date(a.estimated_free_at!).getTime() -
                new Date(b.estimated_free_at!).getTime(),
            )
          return busy.length > 0
            ? {
                barber_id: busy[0].barber_id,
                barber_name: busy[0].barber_name,
                free_at: busy[0].estimated_free_at!,
              }
            : null
        })()

  return {
    shop_open: availability.shop_open,
    shop_hours: availability.shop_hours,
    barbers,
    queue: {
      waiting,
      called: calledList,
      in_service: inServiceList,
    },
    stats: {
      available_barbers: availability.available_count,
      total_active_barbers: availability.total_active_count,
      waiting_count: waiting.length,
      called_count: calledList.length,
      in_service_count: inServiceList.length,
      average_wait_minutes: avgWait,
      next_available_barber: nextBarber,
    },
  }
}

// ---------------------------------------------------------------------------
// Persist projection to shop_state_projection table
// ---------------------------------------------------------------------------

async function persistProjection(
  supabase: SupabaseClient<Database>,
  shopId: string,
  snapshot: ShopSnapshot,
): Promise<number> {
  // Read current revision
  const { data: existing } = await supabase
    .from('shop_state_projection')
    .select('revision')
    .eq('shop_id', shopId)
    .single()

  type ProjRow = { revision: number }
  const currentRevision = existing
    ? (existing as unknown as ProjRow).revision
    : 0
  const nextRevision = currentRevision + 1

  // @ts-expect-error — Supabase generated types resolve .upsert() param to `never`
  const { error } = await supabase.from('shop_state_projection').upsert(
    {
      shop_id: shopId,
      revision: nextRevision,
      snapshot: snapshot as unknown as Database['public']['Tables']['shop_state_projection']['Row']['snapshot'],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'shop_id' },
  )

  if (error) throw new Error(`Failed to persist projection: ${error.message}`)
  return nextRevision
}

// ---------------------------------------------------------------------------
// Main entry point — project + persist
// ---------------------------------------------------------------------------

export async function refreshShopProjection(
  supabase: SupabaseClient<Database>,
  shopId: string,
): Promise<{ snapshot: ShopSnapshot; revision: number }> {
  // 1. Availability (single call — reused for barber state + queue estimates)
  const availability = await getShopAvailability(supabase, shopId)

  // 2. Fetch queue data + services in parallel
  const [projData, walkinsResult] = await Promise.all([
    fetchProjectionData(supabase, shopId),
    supabase
      .from('walkins')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'WAITING')
      .order('position', { ascending: true }),
  ])

  const waitingQueue = (walkinsResult.data ?? []) as unknown as Walkin[]

  // 3. Run wait time simulation using the pure function (no duplicate DB call)
  const queueEstimate = estimateQueue(
    availability,
    waitingQueue,
    projData.services,
    projData.barberServices,
  )

  // 4. Build barber name lookup for in-service enrichment
  const barberNames = new Map<string, string>()
  for (const b of availability.barbers) {
    barberNames.set(b.barber_id, b.barber_name)
  }

  // 5. Assemble snapshot
  const snapshot = buildSnapshot(
    availability,
    waitingQueue,
    queueEstimate.estimates,
    projData.called,
    projData.inService,
    projData.assignments,
    projData.autoAssignEvents,
    barberNames,
  )

  // 6. Persist
  const revision = await persistProjection(supabase, shopId, snapshot)

  return { snapshot, revision }
}
