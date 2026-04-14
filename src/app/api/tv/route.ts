import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'

export const dynamic = 'force-dynamic'

const nyDowShortFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })
const nyTimeFmt     = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true })
const nyMonthDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })

const DEFAULT_WALKIN_MINUTES = 30

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

  // ── Diagnostic: step through each filter to find exactly where rows disappear ──
  const [d1, d2, d3] = await Promise.all([
    admin.from('users').select('id', { count: 'exact', head: true }).eq('shop_id', shopId),
    admin.from('users').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('role', 'barber'),
    admin.from('users').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('role', 'barber').eq('is_active', true),
  ])
  console.log(`[/api/tv] DIAG shopId="${shopId}" (len=${shopId.length})`)
  console.log(`[/api/tv] DIAG users matching shop_id only: ${d1.count ?? 'ERR'} ${d1.error ? '| err: ' + d1.error.message : ''}`)
  console.log(`[/api/tv] DIAG + role=barber: ${d2.count ?? 'ERR'} ${d2.error ? '| err: ' + d2.error.message : ''}`)
  console.log(`[/api/tv] DIAG + is_active=true: ${d3.count ?? 'ERR'} ${d3.error ? '| err: ' + d3.error.message : ''}`)

  // ── Critical: fetch barbers using the same query that works in /api/booking/barbers ──
  const barbersResult = await admin
    .from('users')
    .select('id, first_name, last_name, bio, avatar_url, acuity_calendar_id')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (barbersResult.error) {
    console.error('[/api/tv] BARBERS QUERY FAILED — error:', barbersResult.error)
    return NextResponse.json({ error: barbersResult.error.message }, { status: 500 })
  }

  const rawBarbers = barbersResult.data ?? []
  console.log(`[/api/tv] barbers found: ${rawBarbers.length} for shop_id=${shopId}`)

  // ── Non-critical: fetch supporting data; log errors but never crash the response ──
  const [
    statusResult,
    walkinsResult,
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

    admin
      .from('provider_blocks')
      .select('barber_id, start_at, end_at, note_short')
      .eq('shop_id', shopId)
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    admin
      .from('provider_appointments')
      .select('barber_id, end_at')
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .eq('status', 'ACTIVE')
      .lte('start_at', nowIso)
      .gt('end_at', nowIso),

    admin
      .from('provider_appointments')
      .select('barber_id, start_at, client_name')
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .gt('start_at', nowIso)
      .not('status', 'in', '("CANCELLED","DELETED")')
      .order('start_at', { ascending: true }),

    admin
      .from('calendar_connections')
      .select('barber_id, off_until_at')
      .eq('shop_id', shopId)
      .eq('provider', 'acuity')
      .eq('active', true),
  ])

  if (statusResult.error)        console.error('[/api/tv] barber_status error:', statusResult.error.message)
  if (walkinsResult.error)       console.error('[/api/tv] public_walkins error:', walkinsResult.error.message)
  if (currentBlocksResult.error) console.error('[/api/tv] provider_blocks error:', currentBlocksResult.error.message)
  if (currentApptsResult.error)  console.error('[/api/tv] provider_appointments(current) error:', currentApptsResult.error.message)
  if (nextApptsResult.error)     console.error('[/api/tv] provider_appointments(next) error:', nextApptsResult.error.message)
  if (calendarConnsResult.error) console.error('[/api/tv] calendar_connections error:', calendarConnsResult.error.message)

  const statuses    = statusResult.data ?? []
  const blocks      = currentBlocksResult.data ?? []
  const activeAppts = currentApptsResult.data ?? []
  const nextAppts   = nextApptsResult.data ?? []
  const calConns    = calendarConnsResult.data ?? []

  type RawBarber = { id: string; first_name: string; last_name: string; avatar_url?: string | null; acuity_calendar_id?: string | null }

  const barbers = (rawBarbers as unknown as RawBarber[]).map((u) => {
    const block      = blocks.find((b) => b.barber_id === u.id)
    const activeAppt = activeAppts.find((a) => a.barber_id === u.id)
    const hasAppt    = !!activeAppt
    const nextAppt   = nextAppts.find((a) => a.barber_id === u.id)
    const calConn    = calConns.find((c) => c.barber_id === u.id)

    const isBlocked     = !!block
    const rawOffUntilAt = calConn?.off_until_at ?? null
    const isOff         = rawOffUntilAt ? new Date(rawOffUntilAt) > now : false

    const status =
      isBlocked ? 'UNAVAILABLE' :
      hasAppt   ? 'BUSY'        :
      isOff     ? 'OFF'         :
      'FREE'

    const busy_reason =
      isBlocked ? 'blocked'     :
      hasAppt   ? 'appointment' :
      null

    const free_at      = isOff ? null : (block?.end_at ?? activeAppt?.end_at ?? null)
    const off_until_at = isOff ? rawOffUntilAt : null
    const off_label    = isOff ? computeOffLabel(rawOffUntilAt!, now) : null

    const nextClientName = nextAppt?.client_name
      ? (nextAppt.client_name.split(' ')[0] || null)
      : null

    const barberReadyAt   = free_at ? new Date(free_at) : now
    const waitTimeMinutes = Math.max(0, Math.round((barberReadyAt.getTime() - now.getTime()) / 60_000))

    const nextApptStartMs = nextAppt?.start_at ? new Date(nextAppt.start_at).getTime() : Infinity
    const canFitWalkIn    = (nextApptStartMs - barberReadyAt.getTime()) / 60_000 >= DEFAULT_WALKIN_MINUTES

    return {
      id:               u.id,
      shop_id:          shopId,
      first_name:       u.first_name,
      last_name:        u.last_name,
      avatar_url:       u.avatar_url ?? null,
      display_order:    0,
      photo_x:          null,
      photo_y:          null,
      walkin_eligible:  false,
      status,
      free_at,
      barber_ready_time: free_at,
      wait_time_minutes: waitTimeMinutes,
      can_fit_walkin:    canFitWalkIn,
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
