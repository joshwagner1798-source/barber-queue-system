// ---------------------------------------------------------------------------
// Dispatcher Engine — provider-agnostic walk-in assignment
//
// Called every 30-60 seconds by /api/dispatcher.
// Never imports Acuity (or any provider) directly.
// ---------------------------------------------------------------------------

import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { CalendarProvider, BusyWindow, BlockedWindow } from '@/lib/calendar/provider'
import { autoAssignWalkins } from '@/lib/walkin/queue_assignment'
import type { EngineState } from '@/lib/queue/deriveDisplayStatus'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minutes after last appointment end before a barber is considered AVAILABLE. */
export const PREP_BUFFER_MIN = 5

/** If next appointment is within this window, barber is SOON_BOOKED. */
export const SOON_BOOKED_WINDOW_MIN = 30

/** Minutes a walk-in can stay in CALLED before being marked NO_SHOW. */
export const CALLED_TIMEOUT_MINUTES = 5

/** Safety-net max minutes in IN_SERVICE before auto-completing. */
export const MAX_SERVICE_MINUTES = 45

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { EngineState }

export interface BarberSyncResult {
  barber_id: string
  status: EngineState
  status_detail: string | null
  free_at: Date | null
  next_appointment: Date | null
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

/**
 * Derive the internal engine state for a barber given their calendar data.
 *
 * Priority order:
 * 1. OFF_TODAY  — entire day blocked or no windows at all (all blocked)
 * 2. BLOCKED    — current time inside a block window
 * 3. BUSY       — current time inside an appointment (or 5-min prep buffer)
 * 4. SOON_BOOKED — next appointment starts within 30 minutes
 * 5. AVAILABLE  — none of the above
 */
export function computeBarberStatus(
  barberId: string,
  busyWindows: BusyWindow[],
  blockedWindows: BlockedWindow[],
  now: Date,
): BarberSyncResult {
  // --- OFF_TODAY: entire day blocked ---
  // Heuristic: if a single block spans >=8 hours covering now, it's a day off.
  const dayBlock = blockedWindows.find((b) => {
    const durationHrs = (b.end.getTime() - b.start.getTime()) / 3_600_000
    return durationHrs >= 8 && b.start <= now && now < b.end
  })
  if (dayBlock) {
    return {
      barber_id: barberId,
      status: 'OFF_TODAY',
      status_detail: dayBlock.note,
      free_at: dayBlock.end,
      next_appointment: null,
    }
  }

  // --- BLOCKED: current time inside a block window ---
  const activeBlock = blockedWindows.find(
    (b) => b.start <= now && now < b.end,
  )
  if (activeBlock) {
    return {
      barber_id: barberId,
      status: 'BLOCKED',
      status_detail: activeBlock.note,
      free_at: activeBlock.end,
      next_appointment: null,
    }
  }

  // --- BUSY: current time inside an appointment ---
  const activeAppt = busyWindows.find(
    (b) => b.start <= now && now < b.end,
  )
  if (activeAppt) {
    return {
      barber_id: barberId,
      status: 'BUSY',
      status_detail: activeAppt.label ?? null,
      free_at: activeAppt.end,
      next_appointment: null,
    }
  }

  // --- BUSY: 5-minute prep buffer after last ended appointment ---
  const endedAppts = busyWindows
    .filter((b) => b.end <= now)
    .sort((a, b) => b.end.getTime() - a.end.getTime())

  if (endedAppts.length > 0) {
    const lastEnd = endedAppts[0].end
    const bufferEnd = new Date(lastEnd.getTime() + PREP_BUFFER_MIN * 60_000)
    if (now < bufferEnd) {
      return {
        barber_id: barberId,
        status: 'BUSY',
        status_detail: 'Wrapping up',
        free_at: bufferEnd,
        next_appointment: null,
      }
    }
  }

  // --- Find next upcoming appointment (future only) ---
  const futureAppts = busyWindows
    .filter((b) => b.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const nextAppt = futureAppts.length > 0 ? futureAppts[0] : null

  // --- SOON_BOOKED: next appointment within 30 minutes ---
  if (nextAppt) {
    const minsUntil = (nextAppt.start.getTime() - now.getTime()) / 60_000
    if (minsUntil <= SOON_BOOKED_WINDOW_MIN) {
      return {
        barber_id: barberId,
        status: 'SOON_BOOKED',
        status_detail: nextAppt.label ?? null,
        free_at: null,
        next_appointment: nextAppt.start,
      }
    }
  }

  // --- Also check if next appointment is within PREP_BUFFER (5 min) ---
  // Even if no SOON_BOOKED, a 5-min prep window makes barber NOT available
  if (nextAppt) {
    const minsUntil = (nextAppt.start.getTime() - now.getTime()) / 60_000
    if (minsUntil <= PREP_BUFFER_MIN) {
      return {
        barber_id: barberId,
        status: 'SOON_BOOKED',
        status_detail: 'Preparing for appointment',
        free_at: null,
        next_appointment: nextAppt.start,
      }
    }
  }

  // --- AVAILABLE ---
  return {
    barber_id: barberId,
    status: 'AVAILABLE',
    status_detail: null,
    free_at: null,
    next_appointment: nextAppt?.start ?? null,
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
    await admin
      .from('assignments')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({ ended_at: now.toISOString() })
      .eq('walkin_id', w.id)
      .is('ended_at', null)
    result.no_shows_marked++
  }

  // -----------------------------------------------------------------------
  // 6. Auto-assign walk-ins to AVAILABLE barbers
  //    Delegates to the centralized autoAssignWalkins() function.
  // -----------------------------------------------------------------------
  const assignResult = await autoAssignWalkins(admin, shopId)
  result.assignments_made = assignResult.assignments_made
  result.errors.push(...assignResult.errors)

  return result
}
