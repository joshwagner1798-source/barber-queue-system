// ---------------------------------------------------------------------------
// getEligibleWalkinBarbers — canonical walk-in eligibility function
//
// Uses the SAME data sources as the TV barber-cards display:
//   • barber_status        — Acuity real-time override (FREE/BUSY/UNAVAILABLE)
//   • provider_blocks      — Acuity-synced blocks (currently active)
//   • provider_appointments — Acuity-synced appointments (active + upcoming)
//   • calendar_connections — off_until_at (long-term absences)
//
// Additional walk-in-specific checks:
//   • walkin_enabled = true (Tyrik/Will are false — appointment-only)
//   • Schedule check via business_hours + shop timezone (only when no Acuity override)
//   • 15-minute appointment buffer: reject if next appointment starts < 15 min from now
//
// Returns two lists:
//   eligible — barbers who CAN take a walk-in, with readyMinutes (0 = free now)
//   rejected — barbers who cannot, with detailed reasons[] for debug logging
// ---------------------------------------------------------------------------

import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, BusinessHours } from '@/types/database'
import { getShopLocalTime, getBarberHoursForDay } from './availability'

// Minutes before an upcoming appointment where we block new walk-in starts
const WALKIN_ELIGIBILITY_BUFFER_MINUTES = 15

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EligibleWalkinBarber {
  barberId: string
  name: string
  /** Minutes until barber is free to start a walk-in. 0 = available right now. */
  readyMinutes: number
}

export interface RejectedWalkinBarber {
  barberId: string
  name: string
  /** Human-readable rejection reasons — logged server-side to diagnose "no ready barbers". */
  reasons: string[]
}

export interface WalkinEligibilityResult {
  eligible: EligibleWalkinBarber[]
  rejected: RejectedWalkinBarber[]
}

// ---------------------------------------------------------------------------
// Row shapes (Supabase generated types resolve most inserts/selects as never)
// ---------------------------------------------------------------------------

type BarberRow    = { id: string; first_name: string; last_name: string; walkin_enabled: boolean | null }
type StatusRow    = { barber_id: string; status: string; free_at: string | null }
type BlockRow     = { barber_id: string; start_at: string; end_at: string }
type ApptRow      = { barber_id: string; end_at: string }
type UpcomingRow  = { barber_id: string; start_at: string }
type ConnRow      = { barber_id: string; off_until_at: string | null }
type ShopRow      = { timezone: string | null }

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Determine which barbers are eligible to receive a walk-in right now.
 *
 * Matches barber-card logic (Acuity override first, then provider data)
 * with additional walk-in-specific filters.
 *
 * @param supabase  Any Supabase client with read access to the tables below
 * @param shopId    Shop to query
 * @param now       Reference time (defaults to Date.now())
 */
export async function getEligibleWalkinBarbers(
  supabase: SupabaseClient<Database>,
  shopId: string,
  now: Date = new Date(),
): Promise<WalkinEligibilityResult> {
  const nowIso = now.toISOString()
  const bufferCutoff = new Date(
    now.getTime() + WALKIN_ELIGIBILITY_BUFFER_MINUTES * 60_000,
  ).toISOString()

  const [
    barbersResult,
    barberStatusResult,
    currentBlocksResult,
    currentApptsResult,
    upcomingApptsResult,
    calendarConnsResult,
    shopResult,
    businessHoursResult,
  ] = await Promise.all([
    // All active barbers + walkin_enabled flag
    supabase
      .from('users')
      .select('id, first_name, last_name, walkin_enabled')
      .eq('shop_id', shopId)
      .eq('role', 'barber')
      .eq('is_active', true),

    // Acuity real-time override (FREE / BUSY / UNAVAILABLE)
    supabase
      .from('barber_status')
      .select('barber_id, status, free_at')
      .eq('shop_id', shopId),

    // Currently-active provider blocks (same filter as /api/tv)
    supabase
      .from('provider_blocks')
      .select('barber_id, start_at, end_at')
      .eq('shop_id', shopId)
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    // Currently-ongoing appointments (same filter as /api/tv)
    supabase
      .from('provider_appointments')
      .select('barber_id, end_at')
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .eq('status', 'ACTIVE')
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    // Upcoming appointments starting within the 15-min buffer
    supabase
      .from('provider_appointments')
      .select('barber_id, start_at')
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .not('status', 'in', '("CANCELLED","DELETED")')
      .gt('start_at', nowIso)
      .lte('start_at', bufferCutoff),

    // Long-term absences via Acuity calendar sync
    supabase
      .from('calendar_connections')
      .select('barber_id, off_until_at')
      .eq('shop_id', shopId)
      .eq('provider', 'acuity')
      .eq('active', true),

    // Shop timezone for schedule check fallback
    supabase.from('shops').select('timezone').eq('id', shopId).single(),

    // Business hours for schedule check (used only when no Acuity override)
    supabase.from('business_hours').select('*').eq('shop_id', shopId),
  ])

  // ── Build lookup maps ────────────────────────────────────────────────────

  const barbers = (barbersResult.data ?? []) as unknown as BarberRow[]

  const statusMap = new Map<string, StatusRow>()
  for (const s of (barberStatusResult.data ?? []) as unknown as StatusRow[]) {
    statusMap.set(s.barber_id, s)
  }

  const blockMap = new Map<string, BlockRow>()
  for (const b of (currentBlocksResult.data ?? []) as unknown as BlockRow[]) {
    if (!blockMap.has(b.barber_id)) blockMap.set(b.barber_id, b)
  }

  const activeApptMap = new Map<string, ApptRow>()
  for (const a of (currentApptsResult.data ?? []) as unknown as ApptRow[]) {
    if (!activeApptMap.has(a.barber_id)) activeApptMap.set(a.barber_id, a)
  }

  const nextApptMap = new Map<string, UpcomingRow>()
  for (const a of (upcomingApptsResult.data ?? []) as unknown as UpcomingRow[]) {
    if (!nextApptMap.has(a.barber_id)) nextApptMap.set(a.barber_id, a)
  }

  const offUntilMap = new Map<string, string | null>()
  for (const c of (calendarConnsResult.data ?? []) as unknown as ConnRow[]) {
    offUntilMap.set(c.barber_id, c.off_until_at)
  }

  const shopTimezone =
    ((shopResult.data as unknown as ShopRow | null)?.timezone) ?? 'America/New_York'
  const { dayOfWeek, timeString } = getShopLocalTime(shopTimezone)
  const hours = (businessHoursResult.data ?? []) as unknown as BusinessHours[]

  // ── Evaluate each barber ─────────────────────────────────────────────────

  const eligible: EligibleWalkinBarber[] = []
  const rejected: RejectedWalkinBarber[] = []

  for (const barber of barbers) {
    const name = `${barber.first_name} ${barber.last_name}`
    const reasons: string[] = []

    // ── 1. walkin_enabled gate ───────────────────────────────────────────
    if (barber.walkin_enabled === false) {
      rejected.push({
        barberId: barber.id,
        name,
        reasons: ['walkin_enabled=false (appointment-only barber)'],
      })
      continue
    }

    let readyMinutes = 0
    let acuityOverridesFree = false

    // ── 2. Acuity barber_status override (highest priority) ─────────────
    const bs = statusMap.get(barber.id)

    if (bs) {
      if (bs.status === 'UNAVAILABLE') {
        rejected.push({
          barberId: barber.id,
          name,
          reasons: [`Acuity override: UNAVAILABLE (barber is blocked in Acuity)`],
        })
        continue
      }

      if (bs.status === 'BUSY') {
        if (bs.free_at) {
          const freeAtMs = new Date(bs.free_at).getTime()
          readyMinutes = Math.max(0, Math.round((freeAtMs - now.getTime()) / 60_000))
          reasons.push(`Acuity: BUSY — free in ~${readyMinutes}min (free_at=${bs.free_at})`)
        } else {
          readyMinutes = 30
          reasons.push('Acuity: BUSY — free_at unknown, using fallback 30min')
        }
        // Continue — still eligible (just busy for now); check buffer below
      } else if (bs.status === 'FREE') {
        readyMinutes = 0
        acuityOverridesFree = true
        reasons.push('Acuity override: FREE')
        // Skip provider data checks — Acuity is authoritative when it says FREE
      }
    }

    // ── 3–6: Provider data checks (skipped when Acuity says FREE) ────────
    if (!acuityOverridesFree) {
      // 3. off_until_at — long-term absence
      const offUntil = offUntilMap.get(barber.id)
      if (offUntil && new Date(offUntil) > now) {
        rejected.push({
          barberId: barber.id,
          name,
          reasons: [`OFF until ${offUntil} (calendar_connections.off_until_at)`],
        })
        continue
      }

      // 4. Active provider block
      const block = blockMap.get(barber.id)
      if (block) {
        rejected.push({
          barberId: barber.id,
          name,
          reasons: [`Provider block active (end_at=${block.end_at})`],
        })
        continue
      }

      // 5. Active appointment — still eligible, but busy until it ends
      const appt = activeApptMap.get(barber.id)
      if (appt) {
        const apptFreeMs = new Date(appt.end_at).getTime()
        const busyMin = Math.max(0, Math.round((apptFreeMs - now.getTime()) / 60_000))
        readyMinutes = Math.max(readyMinutes, busyMin)
        reasons.push(`In appointment — free in ~${busyMin}min (end_at=${appt.end_at})`)
      }

      // 6. Schedule check via business_hours (only when no Acuity override at all)
      //    If barber has no barber_status row, we don't have Acuity data for them.
      if (!bs) {
        const todayHours = getBarberHoursForDay(barber.id, dayOfWeek, hours)
        if (!todayHours) {
          rejected.push({
            barberId: barber.id,
            name,
            reasons: [
              `Not scheduled today — no business_hours for barber on day_of_week=${dayOfWeek} (timezone=${shopTimezone})`,
            ],
          })
          continue
        }
        const { open_time, close_time } = todayHours
        if (timeString < open_time || timeString >= close_time) {
          rejected.push({
            barberId: barber.id,
            name,
            reasons: [
              `Outside shift hours (shift ${open_time}–${close_time}, now=${timeString}, timezone=${shopTimezone})`,
            ],
          })
          continue
        }
      }
    }

    // ── 7. Appointment buffer check (applies to ALL barbers, even Acuity FREE) ──
    const nextAppt = nextApptMap.get(barber.id)
    if (nextAppt) {
      const minsToAppt = Math.max(
        0,
        Math.round((new Date(nextAppt.start_at).getTime() - now.getTime()) / 60_000),
      )
      rejected.push({
        barberId: barber.id,
        name,
        reasons: [
          `Upcoming appointment starts in ${minsToAppt}min (start_at=${nextAppt.start_at}) — within ${WALKIN_ELIGIBILITY_BUFFER_MINUTES}-min buffer`,
        ],
      })
      continue
    }

    // ── Eligible ─────────────────────────────────────────────────────────
    eligible.push({ barberId: barber.id, name, readyMinutes })
  }

  return { eligible, rejected }
}
