import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId, checkRequiredEnv } from '@/lib/shop-resolver'

export const dynamic = 'force-dynamic'

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

    // Query users table directly (admin bypasses RLS) — avoids dependency on
    // public_barbers view which may not exist or may lack required fields.
    admin
      .from('users')
      .select('id, shop_id, first_name, last_name, avatar_url, display_order, is_active')
      .eq('role', 'barber')
      .order('display_order', { ascending: true }),

    // Currently-active blocks — BLOCKED overrides everything
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

    // off_until_at per barber from calendar_connections
    admin
      .from('calendar_connections')
      .select('barber_id, off_until_at')
      .eq('shop_id', shopId)
      .eq('provider', 'acuity')
      .eq('active', true),
  ])

  const statuses      = statusResult.data ?? []
  const blocks        = currentBlocksResult.data ?? []
  const activeAppts   = currentApptsResult.data ?? []
  const nextAppts     = nextApptsResult.data ?? []
  const calConns      = calendarConnsResult.data ?? []
  const rawBarbers    = barbersResult.data ?? []

  // Enrich each barber with status, appointment, and availability data
  const barbers = rawBarbers.map((u) => {
    const bs        = statuses.find((s) => s.barber_id === u.id)
    const block     = blocks.find((b) => b.barber_id === u.id)
    const hasAppt   = activeAppts.some((a) => a.barber_id === u.id)
    const nextAppt  = nextAppts.find((a) => a.barber_id === u.id)
    const calConn   = calConns.find((c) => c.barber_id === u.id)

    const isBlocked = !!block

    return {
      id:               u.id,
      shop_id:          u.shop_id,
      first_name:       u.first_name,
      last_name:        u.last_name,
      avatar_url:       u.avatar_url ?? null,
      display_order:    u.display_order ?? 0,
      walkin_eligible:  (u as Record<string, unknown>).walkin_enabled !== false,
      status:           (bs?.status as string) ?? 'FREE',
      free_at:          bs?.free_at ?? null,
      busy_reason:      isBlocked ? 'blocked' : hasAppt ? 'appointment' : null,
      blocked_until:    block?.end_at ?? null,
      blocked_note:     block?.note_short ?? null,
      next_appt_at:     nextAppt?.start_at ?? null,
      next_client_name: nextAppt?.client_name ?? null,
      off_label:        null,
      off_until_at:     calConn?.off_until_at ?? null,
    }
  })

  return NextResponse.json(
    {
      barber_statuses: statuses,
      walkins: walkinsResult.data ?? [],
      barbers,
    },
    {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}
