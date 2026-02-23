import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Walkins and barber_status use the legacy seed shop_id
const SHOP_ID = '00000000-0000-0000-0000-000000000001'
// Users (barbers) and their appointments were seeded with a different shop_id
const BARBERS_SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

// ── NY timezone formatters (server-side) ─────────────────────────────────────
const nyDateFmt     = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
const nyDowFmt      = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' })
const nyTimeFmt     = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true })
const nyMonthDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })

/**
 * Convert a NY date string (YYYY-MM-DD) + hour (0–23) to a UTC Date, respecting DST.
 * Guesses EST (-5:00) first, then checks the actual NY hour; if off by 1, adjusts for EDT (-4:00).
 */
function nyHourToUTC(nyDateStr: string, hour: number): Date {
  const hhStr = String(hour).padStart(2, '0')
  const guess = new Date(`${nyDateStr}T${hhStr}:00:00-05:00`)
  const nyHourActual = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }).format(guess),
    10,
  )
  if (nyHourActual % 24 === hour) return guess
  // We're in EDT (UTC-4): subtract 1 hour from our EST guess
  return new Date(guess.getTime() - 60 * 60 * 1000)
}

/** Minutes covered by union of block intervals clipped to [windowStart, windowEnd]. */
function computeCoverageMinutes(
  blocks: { start_at: string; end_at: string }[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const wsMs = windowStart.getTime()
  const weMs = windowEnd.getTime()
  const intervals = blocks
    .map((b) => [
      Math.max(new Date(b.start_at).getTime(), wsMs),
      Math.min(new Date(b.end_at).getTime(), weMs),
    ] as [number, number])
    .filter(([s, e]) => s < e)
    .sort((a, b) => a[0] - b[0])

  let total = 0
  let curEnd = -Infinity
  for (const [s, e] of intervals) {
    const effectiveStart = Math.max(s, curEnd)
    if (effectiveStart < e) total += e - effectiveStart
    if (e > curEnd) curEnd = e
  }
  return Math.floor(total / 60_000)
}

/** TV initial load — returns only display-safe data (no phone, no client_id). */
export async function GET() {
  const admin  = createAdminClient()
  const now    = new Date()
  const nowIso = now.toISOString()

  // Today in NY
  const todayNy  = nyDateFmt.format(now)
  const dowNy    = nyDowFmt.format(now)
  const isSunday = dowNy === 'Sunday'

  // Work window today: 09:00 → 19:00 NY
  const workStart = nyHourToUTC(todayNy, 9)
  const workEnd   = nyHourToUTC(todayNy, 19)

  // Tomorrow NY date string (for off_label)
  const [yr, mo, dy] = todayNy.split('-').map(Number)
  const tomorrowNy = nyDateFmt.format(new Date(Date.UTC(yr, mo - 1, dy + 1)))

  const [
    statusResult,
    walkinsResult,
    barbersResult,
    currentBlocksResult,
    currentApptsResult,
    nextApptsResult,
    todayBlocksResult,
  ] = await Promise.all([
    admin.from('barber_status').select('*').eq('shop_id', SHOP_ID),

    admin
      .from('walkins')
      .select(
        'id, status, display_name, position, assigned_barber_id, called_at, preference_type, preferred_barber_id, service_type, created_at',
      )
      .eq('shop_id', SHOP_ID)
      .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
      .order('position', { ascending: true }),

    admin
      .from('users')
      .select('id, first_name, last_name, avatar_url, display_order')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('role', 'barber')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),

    // Currently-active blocks — BLOCKED overrides everything
    // Condition: start_at <= now AND end_at > now
    admin
      .from('provider_blocks')
      .select('barber_id, start_at, end_at, note_short')
      .eq('shop_id', BARBERS_SHOP_ID)
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    // Currently-ongoing appointments (kind='appointment' only)
    admin
      .from('provider_appointments')
      .select('barber_id, end_at')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('kind', 'appointment')
      .eq('status', 'ACTIVE')
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    // Next upcoming appointment per barber
    admin
      .from('provider_appointments')
      .select('barber_id, start_at, client_name')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('kind', 'appointment')
      .gt('start_at', nowIso)
      .not('status', 'in', '("CANCELLED","DELETED")')
      .order('start_at', { ascending: true }),

    // All blocks overlapping today's work window (for OFF detection)
    admin
      .from('provider_blocks')
      .select('barber_id, start_at, end_at')
      .eq('shop_id', BARBERS_SHOP_ID)
      .lt('start_at', workEnd.toISOString())
      .gt('end_at', workStart.toISOString()),
  ])

  // ── Active blocks ─────────────────────────────────────────────────────────
  type BlockRow    = { barber_id: string; start_at: string; end_at: string; note_short: string | null }
  type ApptRow     = { barber_id: string; end_at: string }
  type NextRow     = { barber_id: string; start_at: string; client_name: string | null }
  type TodayBlkRow = { barber_id: string; start_at: string; end_at: string }
  type BarberRow   = { id: string; first_name: string; last_name: string; avatar_url: string | null; display_order: number }

  const currentBlockMap = new Map<string, BlockRow>()
  for (const row of (currentBlocksResult.data ?? []) as BlockRow[]) {
    if (!currentBlockMap.has(row.barber_id)) currentBlockMap.set(row.barber_id, row)
  }
  console.log(`Blocks active now: ${currentBlockMap.size}`)
  if (currentBlockMap.size > 0) {
    for (const [barberId, block] of currentBlockMap) {
      console.log(`  BLOCKED barber=${barberId} start=${block.start_at} end=${block.end_at} note="${block.note_short}"`)
    }
  }

  // ── Active appointments ───────────────────────────────────────────────────
  const currentApptMap = new Map<string, ApptRow>()
  for (const row of (currentApptsResult.data ?? []) as ApptRow[]) {
    if (!currentApptMap.has(row.barber_id)) currentApptMap.set(row.barber_id, row)
  }

  // ── Next appointment per barber ───────────────────────────────────────────
  const nextApptMap = new Map<string, NextRow>()
  for (const row of (nextApptsResult.data ?? []) as NextRow[]) {
    if (!nextApptMap.has(row.barber_id)) nextApptMap.set(row.barber_id, row)
  }

  // ── Today's blocks by barber (for OFF detection) ──────────────────────────
  const todayBlocksByBarber = new Map<string, TodayBlkRow[]>()
  for (const row of (todayBlocksResult.data ?? []) as TodayBlkRow[]) {
    if (!todayBlocksByBarber.has(row.barber_id)) todayBlocksByBarber.set(row.barber_id, [])
    todayBlocksByBarber.get(row.barber_id)!.push(row)
  }

  const barbers = ((barbersResult.data ?? []) as unknown as BarberRow[]).map((barber) => {
    const block     = currentBlockMap.get(barber.id)
    const appt      = currentApptMap.get(barber.id)
    const next      = nextApptMap.get(barber.id)
    const todayBlks = todayBlocksByBarber.get(barber.id) ?? []

    // ── OFF detection ─────────────────────────────────────────────────────
    let isOff    = isSunday
    let offLabel: string | null = null

    if (isSunday) {
      offLabel = 'Off Sunday'
    } else {
      const covered = computeCoverageMinutes(todayBlks, workStart, workEnd)
      if (covered >= 540) {
        isOff = true
        // "Off until X" — use the end of the last block overlapping the work window
        const lastEndMs = todayBlks.reduce(
          (mx, blk) => Math.max(mx, new Date(blk.end_at).getTime()),
          0,
        )
        if (lastEndMs > 0) {
          const endDate   = new Date(lastEndMs)
          const endDateNy = nyDateFmt.format(endDate)
          if (endDateNy === todayNy) {
            offLabel = `Off until ${nyTimeFmt.format(endDate)}`
          } else if (endDateNy === tomorrowNy) {
            offLabel = `Off until Tomorrow`
          } else {
            offLabel = `Off until ${nyMonthDayFmt.format(endDate)}`
          }
        } else {
          offLabel = 'Off Today'
        }
      }
    }

    // ── STATUS PRIORITY: OFF > BLOCKED > BUSY > FREE ──────────────────────
    const busy_reason: 'appointment' | 'blocked' | null =
      block ? 'blocked'     :
      appt  ? 'appointment' :
      null

    const status: 'BUSY' | 'FREE' | 'UNAVAILABLE' | 'OFF' =
      isOff ? 'OFF'         :
      block ? 'UNAVAILABLE' :
      appt  ? 'BUSY'        :
              'FREE'

    // free_at drives countdown + sort; OFF barbers sort via MAX in FloorDisplay
    const free_at       = isOff ? null : (block?.end_at ?? appt?.end_at ?? null)
    const blocked_until = block?.end_at ?? null
    const blocked_note  = busy_reason === 'blocked' ? (block?.note_short ?? 'Blocked') : null

    const next_appt_at     = next?.start_at ?? null
    const next_client_name = next?.client_name
      ? (next.client_name.split(' ')[0] || null)
      : null

    return {
      ...barber,
      status,
      busy_reason,
      free_at,
      blocked_until,
      blocked_note,
      next_appt_at,
      next_client_name,
      off_label: offLabel,
    }
  })

  return NextResponse.json({
    barber_statuses: statusResult.data ?? [],
    walkins:         walkinsResult.data ?? [],
    barbers,
  })
}
