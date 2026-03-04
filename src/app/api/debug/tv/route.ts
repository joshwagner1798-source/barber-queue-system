// ---------------------------------------------------------------------------
// GET /api/debug/tv
//
// Returns raw computed status per barber so you can verify block/off logic
// without looking at the UI. No auth required (internal debug tool).
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'

const nyDowShortFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })
const nyTimeFmt     = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true })
const nyMonthDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })

function computeOffLabel(offUntilAt: string, now: Date): string {
  const d = new Date(offUntilAt)
  const diffDays = (d.getTime() - now.getTime()) / 86_400_000
  return diffDays < 7
    ? `Off until ${nyDowShortFmt.format(d)} ${nyTimeFmt.format(d)}`
    : `Off until ${nyMonthDayFmt.format(d)}`
}

export async function GET(request: NextRequest) {
  const { shopId, error: shopErr } = requireShopId(request)
  if (shopErr) return NextResponse.json(shopErr, { status: 400 })

  const admin = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()

  const [barbersResult, allBlocksResult, activeBlocksResult, activeApptsResult, nextApptsResult, calendarConnsResult] =
    await Promise.all([
      admin
        .from('users')
        .select('id, first_name, last_name')
        .eq('shop_id', shopId)
        .eq('role', 'barber')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),

      // All blocks in the next 48 hours (for visibility)
      admin
        .from('provider_blocks')
        .select('barber_id, start_at, end_at, note_short')
        .eq('shop_id', shopId)
        .gte('end_at', nowIso)
        .lte('start_at', new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString())
        .order('start_at', { ascending: true }),

      // Currently-active blocks: start_at <= now AND end_at > now
      admin
        .from('provider_blocks')
        .select('barber_id, start_at, end_at, note_short')
        .eq('shop_id', shopId)
        .lte('start_at', nowIso)
        .gt('end_at', nowIso),

      // Currently-active appointments
      admin
        .from('provider_appointments')
        .select('barber_id, start_at, end_at')
        .eq('shop_id', shopId)
        .eq('kind', 'appointment')
        .eq('status', 'ACTIVE')
        .lte('start_at', nowIso)
        .gt('end_at', nowIso),

      // Next appointment per barber
      admin
        .from('provider_appointments')
        .select('barber_id, start_at, client_name')
        .eq('shop_id', shopId)
        .eq('kind', 'appointment')
        .gt('start_at', nowIso)
        .not('status', 'in', '("CANCELLED","DELETED")')
        .order('start_at', { ascending: true }),

      // off_until_at per barber
      admin
        .from('calendar_connections')
        .select('barber_id, off_until_at')
        .eq('shop_id', shopId)
        .eq('provider', 'acuity')
        .eq('active', true),
    ])

  type BlockRow = { barber_id: string; start_at: string; end_at: string; note_short: string | null }
  type ApptRow  = { barber_id: string; start_at: string; end_at: string }
  type NextRow  = { barber_id: string; start_at: string; client_name: string | null }
  type BarberRow = { id: string; first_name: string; last_name: string }
  type ConnRow  = { barber_id: string; off_until_at: string | null }

  const activeBlockMap = new Map<string, BlockRow>()
  for (const r of (activeBlocksResult.data ?? []) as BlockRow[]) {
    if (!activeBlockMap.has(r.barber_id)) activeBlockMap.set(r.barber_id, r)
  }

  const activeApptMap = new Map<string, ApptRow>()
  for (const r of (activeApptsResult.data ?? []) as ApptRow[]) {
    if (!activeApptMap.has(r.barber_id)) activeApptMap.set(r.barber_id, r)
  }

  const nextApptMap = new Map<string, NextRow>()
  for (const r of (nextApptsResult.data ?? []) as NextRow[]) {
    if (!nextApptMap.has(r.barber_id)) nextApptMap.set(r.barber_id, r)
  }

  const offUntilMap = new Map<string, string | null>()
  for (const r of (calendarConnsResult.data ?? []) as ConnRow[]) {
    offUntilMap.set(r.barber_id, r.off_until_at)
  }

  // Group upcoming blocks by barber for the "upcoming_blocks" field
  const upcomingBlocksByBarber = new Map<string, BlockRow[]>()
  for (const r of (allBlocksResult.data ?? []) as BlockRow[]) {
    if (!upcomingBlocksByBarber.has(r.barber_id)) upcomingBlocksByBarber.set(r.barber_id, [])
    upcomingBlocksByBarber.get(r.barber_id)!.push(r)
  }

  const barbers = ((barbersResult.data ?? []) as unknown as BarberRow[]).map((b) => {
    const activeBlock = activeBlockMap.get(b.id) ?? null
    const activeAppt  = activeApptMap.get(b.id) ?? null
    const nextAppt    = nextApptMap.get(b.id) ?? null

    const rawOffUntilAt = offUntilMap.get(b.id) ?? null
    const isOff = rawOffUntilAt ? new Date(rawOffUntilAt) > now : false

    const is_block_active = activeBlock !== null
    const is_appt_active  = activeAppt !== null

    const status =
      is_block_active ? 'UNAVAILABLE' :
      is_appt_active  ? 'BUSY'        :
      isOff           ? 'OFF'         :
      'FREE'

    const busy_reason =
      is_block_active ? 'blocked'     :
      is_appt_active  ? 'appointment' :
      null

    const free_at      = isOff ? null : (activeBlock?.end_at ?? activeAppt?.end_at ?? null)
    const off_until_at = isOff ? rawOffUntilAt : null
    const off_label    = isOff ? computeOffLabel(rawOffUntilAt!, now) : null

    const next_appt_at        = nextAppt?.start_at ?? null
    const next_client_first_name = nextAppt?.client_name
      ? (nextAppt.client_name.split(' ')[0] || null)
      : null

    return {
      barber_id: b.id,
      name: `${b.first_name} ${b.last_name}`,
      status,
      busy_reason,
      free_at,
      off_until_at,
      off_label,
      next_appt_at,
      next_client_first_name,
      is_block_active,
      active_block_note: activeBlock?.note_short ?? null,
      active_block: activeBlock
        ? { start_at: activeBlock.start_at, end_at: activeBlock.end_at, note_short: activeBlock.note_short }
        : null,
      is_appt_active,
      active_appt: activeAppt
        ? { start_at: activeAppt.start_at, end_at: activeAppt.end_at }
        : null,
      upcoming_blocks_48h: upcomingBlocksByBarber.get(b.id) ?? [],
    }
  })

  return NextResponse.json({
    now: nowIso,
    barbers,
  })
}
