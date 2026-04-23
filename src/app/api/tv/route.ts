import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId, checkRequiredEnv } from '@/lib/shop-resolver'
import { getShopLocalTime, getBarberHoursForDay } from '@/lib/walkin/availability'
import type { BusinessHours } from '@/types/database'

// ── NY timezone formatters (server-side) ─────────────────────────────────────
const nyDowShortFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })
const nyTimeFmt     = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true })
const nyMonthDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })

/**
 * Format an off_until_at ISO string into a human-readable label.
 * < 7 days away: "Off until Wed 10:20 AM"
 * >= 7 days away: "Off until Feb 27"
 */
function computeOffLabel(offUntilAt: string, now: Date): string {
  const d = new Date(offUntilAt)
  const diffDays = (d.getTime() - now.getTime()) / 86_400_000
  return diffDays < 7
    ? `Off until ${nyDowShortFmt.format(d)} ${nyTimeFmt.format(d)}`
    : `Off until ${nyMonthDayFmt.format(d)}`
}

/** Minimum free gap (ms) required to service a walk-in. */
const MIN_WALKIN_GAP_MS = 30 * 60 * 1000

/**
 * Find the earliest ms timestamp at which a barber has at least MIN_WALKIN_GAP_MS free.
 * @param currentFreeAtMs  End of current busy period in ms (null = free right now)
 * @param futureEvents     All upcoming appts + blocks for this barber
 * @param nowMs            Current time in ms
 */
function computeWalkinReadyAt(
  currentFreeAtMs: number | null,
  futureEvents: { start_at: string; end_at: string }[],
  nowMs: number,
): number {
  let potentialStart = currentFreeAtMs ?? nowMs
  const sorted = [...futureEvents].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  )
  for (const ev of sorted) {
    const evStart = new Date(ev.start_at).getTime()
    const evEnd   = new Date(ev.end_at).getTime()
    if (evEnd <= potentialStart) continue          // already behind us
    if (evStart <= potentialStart) {               // overlaps — advance past it
      potentialStart = Math.max(potentialStart, evEnd)
      continue
    }
    if (evStart - potentialStart >= MIN_WALKIN_GAP_MS) return potentialStart  // gap found
    potentialStart = evEnd                         // gap too small — skip event
  }
  return potentialStart
}

/** TV initial load — returns only display-safe data (no phone, no client_id). */
export async function GET(request: NextRequest) {
  const envErr = checkRequiredEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (envErr) return NextResponse.json({ error: 'Server misconfiguration', missing: envErr.missing }, { status: 500 })

  const { shopId, error: shopErr } = requireShopId(request)
  if (shopErr) return NextResponse.json(shopErr, { status: 400 })

  const admin  = createAdminClient()
  const now    = new Date()

const nowIso = now.toISOString()
  // Walk-ins older than 1 hour are considered expired and excluded from TV display
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

  const [
    statusResult,
    walkinsResult,
    barbersResult,
    currentBlocksResult,
    currentApptsResult,
    nextApptsResult,
    calendarConnsResult,
    shopSettingsResult,
    futureBlocksResult,
    shopTzResult,
    bizHoursResult,
  ] = await Promise.all([
    admin.from('barber_status').select('*').eq('shop_id', shopId),

    admin
      .from('walkins')
      .select(
        'id, status, display_name, position, assigned_barber_id, called_at, preference_type, preferred_barber_id, service_type, created_at',
      )
      .eq('shop_id', shopId)
      .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
      .gt('created_at', oneHourAgo)
      .order('position', { ascending: true }),

    admin
      .from('users')
      .select('id, first_name, last_name, avatar_url, display_order, walkin_enabled')
      .eq('shop_id', shopId)
      .eq('role', 'barber')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),

    // Currently-active blocks — BLOCKED overrides everything
    // Condition: start_at <= now AND end_at > now
    admin
      .from('provider_blocks')
      .select('barber_id, start_at, end_at, note_short')
      .eq('shop_id', shopId)
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    // Currently-ongoing appointments (kind='appointment' only)
    admin
      .from('provider_appointments')
      .select('barber_id, end_at, client_name')
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .eq('status', 'ACTIVE')
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    // Next upcoming appointment per barber (all — used for walk-in gap calculation)
    admin
      .from('provider_appointments')
      .select('barber_id, start_at, end_at, client_name')
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .gt('start_at', nowIso)
      .not('status', 'in', '("CANCELLED","DELETED")')
      .order('start_at', { ascending: true }),

    // off_until_at per barber from calendar_connections
    admin
      .from('calendar_connections')
      .select('barber_id, off_until_at')
      .eq('shop_id', shopId)
      .eq('provider', 'acuity')
      .eq('active', true),

    admin
      .from('shop_settings')
      .select('*')
      .eq('shop_id', shopId)
      .maybeSingle(),

    // Future blocks (start_at > now) — used for walk-in gap calculation
    admin
      .from('provider_blocks')
      .select('barber_id, start_at, end_at')
      .eq('shop_id', shopId)
      .gt('start_at', nowIso),

    // Shop timezone for business hours check
    admin.from('shops').select('timezone').eq('id', shopId).maybeSingle(),

    // Business hours — used to mark barbers UNAVAILABLE when shop is closed
    admin.from('business_hours').select('*').eq('shop_id', shopId),
  ])

  // ── Active blocks ─────────────────────────────────────────────────────────
  type BlockRow = { barber_id: string; start_at: string; end_at: string; note_short: string | null }
  type ApptRow  = { barber_id: string; end_at: string; client_name: string | null }
  type NextRow  = { barber_id: string; start_at: string; end_at: string; client_name: string | null }
  type FutureBlockRow = { barber_id: string; start_at: string; end_at: string }
  type BarberRow = {
    id: string
    first_name: string
    last_name: string
    avatar_url: string | null
    display_order: number
    walkin_enabled: boolean | null
  }
  type ConnRow  = { barber_id: string; off_until_at: string | null }

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

  // ── Next appointment per barber (first only — for display) ───────────────
  const nextApptMap = new Map<string, NextRow>()
  // ── All upcoming appointments per barber (for walk-in gap calc) ──────────
  const allApptsByBarber = new Map<string, { start_at: string; end_at: string }[]>()
  for (const row of (nextApptsResult.data ?? []) as NextRow[]) {
    if (!nextApptMap.has(row.barber_id)) nextApptMap.set(row.barber_id, row)
    const arr = allApptsByBarber.get(row.barber_id) ?? []
    arr.push({ start_at: row.start_at, end_at: row.end_at })
    allApptsByBarber.set(row.barber_id, arr)
  }

  // ── Future blocks per barber (for walk-in gap calc) ───────────────────────
  const futureBlocksByBarber = new Map<string, { start_at: string; end_at: string }[]>()
  for (const row of (futureBlocksResult.data ?? []) as FutureBlockRow[]) {
    const arr = futureBlocksByBarber.get(row.barber_id) ?? []
    arr.push({ start_at: row.start_at, end_at: row.end_at })
    futureBlocksByBarber.set(row.barber_id, arr)
  }

  // ── off_until_at per barber ───────────────────────────────────────────────
  const offUntilMap = new Map<string, string | null>()
  for (const row of (calendarConnsResult.data ?? []) as ConnRow[]) {
    offUntilMap.set(row.barber_id, row.off_until_at)
  }

  // ── Business hours (for after-hours UNAVAILABLE gate) ────────────────────
  type ShopTzRow = { timezone: string | null }
  const shopTz = ((shopTzResult.data as unknown as ShopTzRow | null)?.timezone) ?? 'America/New_York'
  const { dayOfWeek, timeString } = getShopLocalTime(shopTz)
  const bizHours = (bizHoursResult.data ?? []) as unknown as BusinessHours[]

  if (barbersResult.error) {
    console.error('[/api/tv] barbers query failed:', barbersResult.error.message)
    return NextResponse.json({ error: barbersResult.error.message, _debug: { shopId, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL } }, { status: 500 })
  }
  console.log(`[/api/tv] barbers found: ${barbersResult.data?.length ?? 0} for shop_id=${shopId}`)

  const barbers = ((barbersResult.data ?? []) as unknown as BarberRow[]).map((barber) => {
    const block = currentBlockMap.get(barber.id)
    const appt  = currentApptMap.get(barber.id)
    const next  = nextApptMap.get(barber.id)

    // ── OFF detection via off_until_at ────────────────────────────────────
    const rawOffUntilAt = offUntilMap.get(barber.id) ?? null
    const isOff = rawOffUntilAt ? new Date(rawOffUntilAt) > now : false

    // ── STATUS PRIORITY: BLOCKED > BUSY > OFF > FREE > hours check ───────
    const busy_reason: 'appointment' | 'blocked' | null =
      block ? 'blocked'     :
      appt  ? 'appointment' :
      null

    let status: 'BUSY' | 'FREE' | 'UNAVAILABLE' | 'OFF' =
      block   ? 'UNAVAILABLE' :
      appt    ? 'BUSY'        :
      isOff   ? 'OFF'         :
                'FREE'

    // When no Acuity data overrides to FREE, apply business hours gate.
    // If barber would be FREE but shop/shift is closed → UNAVAILABLE.
    if (status === 'FREE') {
      const closedRecord = bizHours.find(
        (h) =>
          h.day_of_week === dayOfWeek &&
          h.is_closed &&
          (h.barber_id === barber.id || h.barber_id === null),
      )
      if (closedRecord) {
        status = 'UNAVAILABLE'
      } else {
        const todayHours = getBarberHoursForDay(barber.id, dayOfWeek, bizHours)
        if (todayHours && (timeString < todayHours.open_time || timeString >= todayHours.close_time)) {
          status = 'UNAVAILABLE'
        }
      }
    }

    // free_at drives countdown + sort; null for OFF barbers
    const free_at      = isOff ? null : (block?.end_at ?? appt?.end_at ?? null)
    const blocked_until = block?.end_at ?? null
    const blocked_note  = busy_reason === 'blocked' ? (block?.note_short ?? 'Blocked') : null

    const next_appt_at     = next?.start_at ?? null
    const next_client_name = next?.client_name
      ? (next.client_name.split(' ')[0] || null)
      : null
    const current_client_name = appt?.client_name
      ? (appt.client_name.split(' ')[0] || null)
      : null

    const off_label    = isOff ? computeOffLabel(rawOffUntilAt!, now) : null
    const off_until_at = isOff ? rawOffUntilAt : null

    // ── Walk-in ready time: first 30-min gap in schedule ──────────────────
    const nowMs = now.getTime()
    const futureEventsForBarber = [
      ...(allApptsByBarber.get(barber.id) ?? []),
      ...(futureBlocksByBarber.get(barber.id) ?? []),
    ]
    const currentFreeAtMs = isOff ? null : (free_at ? new Date(free_at).getTime() : null)
    const walkinReadyMs = isOff ? null : computeWalkinReadyAt(currentFreeAtMs, futureEventsForBarber, nowMs)
    // null = walk-in ready right now; ISO string = first time barber has a 30-min gap
    const walkin_ready_at = walkinReadyMs !== null && walkinReadyMs > nowMs + 2 * 60 * 1000
      ? new Date(walkinReadyMs).toISOString()
      : null

    const { walkin_enabled, ...rest } = barber
    return {
      ...rest,
      status,
      busy_reason,
      free_at,
      blocked_until,
      blocked_note,
      next_appt_at,
      next_client_name,
      current_client_name,
      off_label,
      off_until_at,
      walkin_ready_at,
      walkin_eligible: (walkin_enabled ?? true) && status !== 'UNAVAILABLE' && status !== 'OFF',
    }
  })

  type ShopSettingsRow = {
    fallback_booking_url: string | null
    first_available_photo_url?: string | null
  }
  const shopSettings = shopSettingsResult.data as ShopSettingsRow | null
  const shopBookingUrl           = shopSettings?.fallback_booking_url ?? null
  const firstAvailablePhotoUrl   = shopSettings?.first_available_photo_url ?? null

  return NextResponse.json({
    barber_statuses: statusResult.data ?? [],
    walkins:         walkinsResult.data ?? [],
    barbers,
    shop_booking_url:             shopBookingUrl,
    first_available_photo_url:    firstAvailablePhotoUrl,
    _debug: {
      shopId,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'NOT_SET',
      defaultShopIdEnv: process.env.DEFAULT_SHOP_ID ?? 'NOT_SET',
      barberCount: barbers.length,
    },
  })
}
