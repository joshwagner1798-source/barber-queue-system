// ---------------------------------------------------------------------------
// Dispatcher Engine — provider-agnostic walk-in assignment
//
// Called every 30-60 seconds by /api/dispatcher.
// Never imports Acuity (or any provider) directly.
// ---------------------------------------------------------------------------

import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { CalendarProvider, BusyWindow, BlockedWindow } from '@/lib/calendar/provider'
import { appendEvent, WALKIN_AUTO_ASSIGNED } from '@/lib/walkin/events'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minutes after last appointment end before a barber is considered FREE. */
export const FREE_BUFFER_MINUTES = 5

/** Minutes a walk-in can stay in CALLED before being marked NO_SHOW. */
export const CALLED_TIMEOUT_MINUTES = 5

/** Safety-net max minutes in IN_SERVICE before auto-completing. */
export const MAX_SERVICE_MINUTES = 45

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BarberComputedStatus = 'FREE' | 'BUSY' | 'UNAVAILABLE'

export interface BarberSyncResult {
  barber_id: string
  status: BarberComputedStatus
  status_detail: string | null
  free_at: Date | null
}

export interface DispatcherResult {
  barbers_synced: number
  assignments_made: number
  no_shows_marked: number
  completions_marked: number
  errors: string[]
}

// ---------------------------------------------------------------------------
// Status computation — pure function, no DB
// ---------------------------------------------------------------------------

export function computeBarberStatus(
  barberId: string,
  busyWindows: BusyWindow[],
  blockedWindows: BlockedWindow[],
  now: Date,
): BarberSyncResult {
  // Check for active block first (UNAVAILABLE takes priority display-wise)
  const activeBlock = blockedWindows.find(
    (b) => b.start <= now && now < b.end,
  )
  if (activeBlock) {
    return {
      barber_id: barberId,
      status: 'UNAVAILABLE',
      status_detail: activeBlock.note,
      free_at: activeBlock.end,
    }
  }

  // Check for active appointment
  const activeAppt = busyWindows.find(
    (b) => b.start <= now && now < b.end,
  )
  if (activeAppt) {
    return {
      barber_id: barberId,
      status: 'BUSY',
      status_detail: activeAppt.label ?? null,
      free_at: activeAppt.end,
    }
  }

  // Check 5-minute readiness buffer after last ended appointment
  const endedAppts = busyWindows
    .filter((b) => b.end <= now)
    .sort((a, b) => b.end.getTime() - a.end.getTime())

  if (endedAppts.length > 0) {
    const lastEnd = endedAppts[0].end
    const bufferEnd = new Date(lastEnd.getTime() + FREE_BUFFER_MINUTES * 60_000)
    if (now < bufferEnd) {
      return {
        barber_id: barberId,
        status: 'BUSY',
        status_detail: 'Readiness buffer',
        free_at: bufferEnd,
      }
    }
  }

  // No conflicts — barber is FREE
  return {
    barber_id: barberId,
    status: 'FREE',
    status_detail: null,
    free_at: null,
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function runDispatcher(
  admin: SupabaseClient<Database>,
  shopId: string,
  provider: CalendarProvider,
): Promise<DispatcherResult> {
  const result: DispatcherResult = {
    barbers_synced: 0,
    assignments_made: 0,
    no_shows_marked: 0,
    completions_marked: 0,
    errors: [],
  }

  const now = new Date()

  // -----------------------------------------------------------------------
  // 1. Load barbers with calendar IDs
  // -----------------------------------------------------------------------
  const { data: barbers, error: barbersErr } = await admin
    .from('users')
    .select('id, first_name, last_name, acuity_calendar_id')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)
    .not('acuity_calendar_id', 'is', null)

  if (barbersErr) {
    result.errors.push(`Failed to load barbers: ${barbersErr.message}`)
    return result
  }

  type BarberRow = { id: string; first_name: string; last_name: string; acuity_calendar_id: string }
  const barberRows = (barbers ?? []) as unknown as BarberRow[]

  if (barberRows.length === 0) return result

  // -----------------------------------------------------------------------
  // 2. Fetch provider data for all barbers in parallel
  // -----------------------------------------------------------------------
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Store previous statuses to detect transitions
  const { data: prevStatuses } = await admin
    .from('barber_status')
    .select('barber_id, status')
    .eq('shop_id', shopId)

  type PrevRow = { barber_id: string; status: string }
  const prevMap = new Map<string, string>()
  for (const p of (prevStatuses ?? []) as unknown as PrevRow[]) {
    prevMap.set(p.barber_id, p.status)
  }

  const syncResults: BarberSyncResult[] = []
  const fetchPromises = barberRows.map(async (b) => {
    try {
      const [busy, blocked] = await Promise.all([
        provider.getBusyWindows(b.id, b.acuity_calendar_id, today, tomorrow),
        provider.getBlockedWindows(b.id, b.acuity_calendar_id, today, tomorrow),
      ])
      return computeBarberStatus(b.id, busy, blocked, now)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`Provider error for barber ${b.first_name}: ${msg}`)
      return null
    }
  })

  const fetchResults = await Promise.all(fetchPromises)
  for (const r of fetchResults) {
    if (r) syncResults.push(r)
  }

  // -----------------------------------------------------------------------
  // 3. Upsert barber_status table
  // -----------------------------------------------------------------------
  for (const sr of syncResults) {
    // @ts-expect-error — Supabase generated types resolve upsert param to never
    const { error } = await admin.from('barber_status').upsert(
      {
        shop_id: shopId,
        barber_id: sr.barber_id,
        status: sr.status,
        status_detail: sr.status_detail,
        free_at: sr.free_at?.toISOString() ?? null,
        last_synced_at: now.toISOString(),
      },
      { onConflict: 'shop_id,barber_id' },
    )
    if (error) {
      result.errors.push(`Upsert barber_status ${sr.barber_id}: ${error.message}`)
    } else {
      result.barbers_synced++
    }
  }

  // -----------------------------------------------------------------------
  // 4. Auto-complete: calendar signal
  //    If barber transitioned to BUSY and has an IN_SERVICE walkin → DONE
  // -----------------------------------------------------------------------
  for (const sr of syncResults) {
    const prev = prevMap.get(sr.barber_id)
    const becameBusy = sr.status === 'BUSY' && prev !== 'BUSY'

    if (becameBusy) {
      // Find active IN_SERVICE walkin for this barber
      const { data: activeWalkins } = await admin
        .from('walkins')
        .select('id')
        .eq('shop_id', shopId)
        .eq('assigned_barber_id', sr.barber_id)
        .eq('status', 'IN_SERVICE')

      type WRow = { id: string }
      for (const w of (activeWalkins ?? []) as unknown as WRow[]) {
        // @ts-expect-error — Supabase generated types resolve update param to never
        await admin.from('walkins').update({ status: 'DONE' }).eq('id', w.id)

        // End the assignment
        await admin
          .from('assignments')
          // @ts-expect-error — Supabase generated types resolve update param to never
          .update({ ended_at: now.toISOString() })
          .eq('walkin_id', w.id)
          .is('ended_at', null)

        result.completions_marked++
      }
    }
  }

  // Fallback: IN_SERVICE for > MAX_SERVICE_MINUTES → auto-complete
  const maxCutoff = new Date(now.getTime() - MAX_SERVICE_MINUTES * 60_000).toISOString()
  const { data: staleInService } = await admin
    .from('walkins')
    .select('id')
    .eq('shop_id', shopId)
    .eq('status', 'IN_SERVICE')
    .lt('called_at', maxCutoff)

  type SRow = { id: string }
  for (const w of (staleInService ?? []) as unknown as SRow[]) {
    // @ts-expect-error — Supabase generated types resolve update param to never
    await admin.from('walkins').update({ status: 'DONE' }).eq('id', w.id)
    await admin
      .from('assignments')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({ ended_at: now.toISOString() })
      .eq('walkin_id', w.id)
      .is('ended_at', null)
    result.completions_marked++
  }

  // -----------------------------------------------------------------------
  // 5. Enforce 5-min CALLED timeout → NO_SHOW
  // -----------------------------------------------------------------------
  const calledCutoff = new Date(now.getTime() - CALLED_TIMEOUT_MINUTES * 60_000).toISOString()
  const { data: expiredCalled } = await admin
    .from('walkins')
    .select('id')
    .eq('shop_id', shopId)
    .eq('status', 'CALLED')
    .lt('called_at', calledCutoff)

  type ERow = { id: string }
  for (const w of (expiredCalled ?? []) as unknown as ERow[]) {
    // @ts-expect-error — Supabase generated types resolve update param to never
    await admin.from('walkins').update({ status: 'NO_SHOW' }).eq('id', w.id)
    // End assignment if exists
    await admin
      .from('assignments')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({ ended_at: now.toISOString() })
      .eq('walkin_id', w.id)
      .is('ended_at', null)
    result.no_shows_marked++
  }

  // -----------------------------------------------------------------------
  // 6. Auto-assign walk-ins to FREE barbers
  // -----------------------------------------------------------------------
  const freeBarbers = syncResults.filter((sr) => sr.status === 'FREE')

  for (const fb of freeBarbers) {
    // Check if this barber already has an active CALLED or IN_SERVICE walkin
    const { data: activeForBarber } = await admin
      .from('walkins')
      .select('id')
      .eq('shop_id', shopId)
      .eq('assigned_barber_id', fb.barber_id)
      .in('status', ['CALLED', 'IN_SERVICE'])
      .limit(1)

    if ((activeForBarber ?? []).length > 0) continue // already serving someone

    // Priority 1: oldest PREFERRED walk-in wanting this barber
    const { data: preferred } = await admin
      .from('walkins')
      .select('id, display_name')
      .eq('shop_id', shopId)
      .eq('status', 'WAITING')
      .eq('preference_type', 'PREFERRED')
      .eq('preferred_barber_id', fb.barber_id)
      .order('position', { ascending: true })
      .limit(1)

    type WalkinRow = { id: string; display_name: string | null }
    let target: WalkinRow | null = null

    if ((preferred ?? []).length > 0) {
      target = (preferred as unknown as WalkinRow[])[0]
    } else {
      // Priority 2: oldest ANY walk-in (FIFO)
      const { data: anyWalkin } = await admin
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

    if (!target) continue // no one to assign

    // Optimistic lock: only update if still WAITING
    const { data: updated, error: assignErr } = await admin
      .from('walkins')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({
        status: 'CALLED',
        assigned_barber_id: fb.barber_id,
        called_at: now.toISOString(),
      })
      .eq('id', target.id)
      .eq('status', 'WAITING')
      .select('id')

    if (assignErr || !(updated as unknown as { id: string }[] | null)?.length) {
      continue // someone else got it, skip
    }

    // Create assignment record
    // @ts-expect-error — Supabase generated types resolve insert param to never
    await admin.from('assignments').insert({
      shop_id: shopId,
      walkin_id: target.id,
      barber_id: fb.barber_id,
    })

    // Find barber name for event payload
    const barber = barberRows.find((b) => b.id === fb.barber_id)
    const barberName = barber ? `${barber.first_name} ${barber.last_name}` : ''

    await appendEvent(admin, {
      shop_id: shopId,
      type: WALKIN_AUTO_ASSIGNED,
      actor_user_id: null,
      payload: {
        walkin_id: target.id,
        barber_id: fb.barber_id,
        barber_name: barberName,
        display_name: target.display_name,
      },
    })

    result.assignments_made++
  }

  return result
}
