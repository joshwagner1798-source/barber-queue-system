// ---------------------------------------------------------------------------
// queue-booking-bridge.ts
//
// Connects the walk-in queue to the booking flow.
// Called after a walk-in is created to decide whether to nudge the customer
// toward booking a future appointment instead of waiting.
//
// Threshold: suggest booking if estimated wait >= SUGGEST_WAIT_THRESHOLD_MIN (45 min).
// If should_suggest: find the earliest available slot today, then tomorrow.
// ---------------------------------------------------------------------------

import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'
import { generateSlotsForAllBarbers } from './slot-generator'
import { computeWalkinWaitMinutes, AVG_WALKIN_MINUTES } from '@/lib/walkin/wait_time_estimator'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUGGEST_WAIT_THRESHOLD_MIN = 45
const DEFAULT_SERVICE_DURATION   = 30

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EarliestSlot {
  barber_id: string
  barber_name: string
  start: string   // ISO UTC
  end: string     // ISO UTC
  date: string    // YYYY-MM-DD in shop timezone
}

export interface BookingSuggestion {
  should_suggest: boolean
  estimated_wait_minutes: number
  earliest_slot: EarliestSlot | null
  booking_url: string | null
}

// ---------------------------------------------------------------------------
// toDateStr — format a Date as YYYY-MM-DD in the given timezone
// ---------------------------------------------------------------------------

function toLocalDateStr(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(date)
}

// ---------------------------------------------------------------------------
// getBookingSuggestion
//
// @param queuePosition — 1-indexed position the customer was just assigned
// ---------------------------------------------------------------------------

export async function getBookingSuggestion(
  supabase: SupabaseClient<Database>,
  shopId: string,
  queuePosition: number,
): Promise<BookingSuggestion> {
  // ── 0. Only suggest booking if native scheduling is enabled ───────────────
  const { data: settingsData } = await supabase
    .from('shop_settings')
    .select('scheduling_mode')
    .eq('shop_id', shopId)
    .maybeSingle()

  type SettingsRow = { scheduling_mode: string | null }
  const mode = (settingsData as unknown as SettingsRow | null)?.scheduling_mode ?? 'off'

  if (mode !== 'native') {
    return {
      should_suggest: false,
      estimated_wait_minutes: 0,
      earliest_slot: null,
      booking_url: null,
    }
  }

  // ── 1. Estimate wait for this position ────────────────────────────────────
  // computeWalkinWaitMinutes takes a 0-indexed position
  const waitMinutes = await computeWalkinWaitMinutes(
    supabase,
    shopId,
    Math.max(0, queuePosition - 1),
  ).catch(() => null)

  const estimatedWait = waitMinutes ?? (queuePosition - 1) * AVG_WALKIN_MINUTES

  if (estimatedWait < SUGGEST_WAIT_THRESHOLD_MIN) {
    return {
      should_suggest: false,
      estimated_wait_minutes: estimatedWait,
      earliest_slot: null,
      booking_url: null,
    }
  }

  // ── 2. Find earliest available slot — today then tomorrow ─────────────────
  const { data: shopData } = await supabase
    .from('shops')
    .select('timezone')
    .eq('id', shopId)
    .single()

  type ShopRow = { timezone: string | null }
  const timezone = (shopData as unknown as ShopRow | null)?.timezone ?? 'America/New_York'

  const provider = new AcuityProvider()
  const now = new Date()

  // Load barber names for display
  const { data: barberData } = await supabase
    .from('users')
    .select('id, first_name, last_name')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)

  type BarberNameRow = { id: string; first_name: string; last_name: string }
  const barberNames = new Map<string, string>()
  for (const b of (barberData ?? []) as unknown as BarberNameRow[]) {
    barberNames.set(b.id, `${b.first_name} ${b.last_name}`)
  }

  // Search today and tomorrow
  const datesToSearch = [
    toLocalDateStr(now, timezone),
    toLocalDateStr(new Date(now.getTime() + 24 * 60 * 60_000), timezone),
  ]

  for (const date of datesToSearch) {
    let allResults
    try {
      allResults = await generateSlotsForAllBarbers(
        supabase,
        provider,
        shopId,
        date,
        timezone,
        DEFAULT_SERVICE_DURATION,
      )
    } catch {
      continue
    }

    // Find the earliest AVAILABLE slot across all barbers
    let earliest: EarliestSlot | null = null

    for (const result of allResults.results) {
      const firstAvailable = result.slots.find((s) => s.status === 'AVAILABLE')
      if (!firstAvailable) continue

      if (!earliest || firstAvailable.start < earliest.start) {
        earliest = {
          barber_id: result.barber_id,
          barber_name: barberNames.get(result.barber_id) ?? 'Barber',
          start: firstAvailable.start,
          end: firstAvailable.end,
          date: result.date,
        }
      }
    }

    if (earliest) {
      const bookingUrl = `/book?barber_id=${earliest.barber_id}&start=${encodeURIComponent(earliest.start)}`
      return {
        should_suggest: true,
        estimated_wait_minutes: estimatedWait,
        earliest_slot: earliest,
        booking_url: bookingUrl,
      }
    }
  }

  // No slots found but wait is long — still suggest booking (let /book show options)
  return {
    should_suggest: true,
    estimated_wait_minutes: estimatedWait,
    earliest_slot: null,
    booking_url: '/book',
  }
}
