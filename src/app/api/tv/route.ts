import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId, checkRequiredEnv } from '@/lib/shop-resolver'

export const dynamic = 'force-dynamic'

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

/** TV live data — returns only display-safe data (no phone, no client_id). */
export async function GET(request: NextRequest) {
  const { shopId, error: shopErr } = requireShopId(request)
  if (shopErr) return NextResponse.json(shopErr, { status: 400 })

  const admin  = createAdminClient()
  const now    = new Date()
  const nowIso = now.toISOString()

  const [
    statusResult,
    walkinsResult,
    barbersResult,
    currentBlocksResult,
    currentApptsResult,
    nextApptsResult,
    calendarConnsResult,
  ] = await Promise.all([
    admin.from('barber_status').select('*').eq('shop_id', shopId),

    admin
      .from('public_walkins')
      .select('*')
      .eq('shop_id', shopId)
      .order('position', { ascending: true }),

    // Query users table directly with admin client (bypasses RLS).
    // avatar_url intentionally kept — column exists in initial schema.
    admin
      .from('users')
      .select('id, shop_id, first_name, last_name, avatar_url, display_order')
      .eq('shop_id', shopId)
      .eq('role', 'barber')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),

    // Currently-active blocks (BLOCKED overrides everything)
    admin
      .from('provider_blocks')
      .select('barber_id, start_at, end_at, note_short')
      .eq('shop_id', shopId)
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    // Currently-ongoing appointments
    admin
      .from('provider_appointments')
      .select('barber_id, end_at')
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .eq('status', 'ACTIVE')
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    // Next upcoming appointment per barber
    admin
      .from('provider_appointments')
      .select('barber_id, start_at, client_name')
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .gt('start_at', nowIso)
      .not('status', 'in', '("CANCELLED","DELETED")')
      .order('start_at', { ascending: true }),

    // off_until_at per barber from calendar_connections (Acuity "off" days)
    admin
      .from('calendar_connections')
      .select('barber_id, off_until_at')
      .eq('shop_id', shopId)
      .eq('provider', 'acuity')
      .eq('active', true),
  ])

  const statuses    = statusResult.data ?? []
  const blocks      = currentBlocksResult.data ?? []
  const activeAppts = currentApptsResult.data ?? []
  const nextAppts   = nextApptsResult.data ?? []
  const calConns    = calendarConnsResult.data ?? []

  // If avatar_url caused the query to fail, fall back to minimal columns
  const rawBarbers = barbersResult.data
    ?? (await admin
        .from('users')
        .select('id, shop_id, first_name, last_name')
        .eq('shop_id', shopId)
        .eq('role', 'barber')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .then(r => r.data ?? []))

  type RawBarber = { id: string; shop_id: string; first_name: string; last_name: string; avatar_url?: string | null; display_order?: number }

  const barbers = (rawBarbers as unknown as RawBarber[]).map((u) => {
    const block    = blocks.find((b) => b.barber_id === u.id)
    const hasAppt  = activeAppts.some((a) => a.barber_id === u.id)
    const nextAppt = nextAppts.find((a) => a.barber_id === u.id)
    const calConn  = calConns.find((c) => c.barber_id === u.id)

    const isBlocked      = !!block
    const rawOffUntilAt  = calConn?.off_until_at ?? null
    const isOff          = rawOffUntilAt ? new Date(rawOffUntilAt) > now : false

    // Compute status from Acuity schedule data (off_until_at, blocks, appointments).
    // barber_status table is returned separately as barber_statuses for manual overrides.
    const status =
      isBlocked ? 'UNAVAILABLE' :
      hasAppt   ? 'BUSY'        :
      isOff     ? 'OFF'         :
      'FREE'

    const busy_reason =
      isBlocked ? 'blocked'     :
      hasAppt   ? 'appointment' :
      null

    const activeAppt  = activeAppts.find((a) => a.barber_id === u.id)
    const free_at     = isOff ? null : (block?.end_at ?? activeAppt?.end_at ?? null)
    const off_until_at = isOff ? rawOffUntilAt : null
    const off_label    = isOff ? computeOffLabel(rawOffUntilAt!, now) : null

    const nextClientName = nextAppt?.client_name
      ? (nextAppt.client_name.split(' ')[0] || null)
      : null

    return {
      id:               u.id,
      shop_id:          u.shop_id,
      first_name:       u.first_name,
      last_name:        u.last_name,
      avatar_url:       u.avatar_url ?? null,
      display_order:    u.display_order ?? 0,
      walkin_eligible:  true,
      status,
      free_at,
      busy_reason,
      blocked_until:    block?.end_at ?? null,
      blocked_note:     block?.note_short ?? null,
      next_appt_at:     nextAppt?.start_at ?? null,
      next_client_name: nextClientName,
      off_label,
      off_until_at,
    }
  })

  return NextResponse.json(
    {
      barber_statuses: statuses,
      walkins: walkinsResult.data ?? [],
      barbers,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
