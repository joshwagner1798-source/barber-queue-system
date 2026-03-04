import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId, checkRequiredEnv } from '@/lib/shop-resolver'

export const dynamic = 'force-dynamic'

const SHOP_ID = '00000000-0000-0000-0000-000000000001'

/** TV live data — returns only display-safe data (no phone, no client_id). */
export async function GET() {
  const admin = createAdminClient()

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
      .eq('shop_id', SHOP_ID)
      .order('position', { ascending: true }),

    admin
      .from('public_barbers')
      .select('*')
      .eq('shop_id', SHOP_ID)
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

  return NextResponse.json(
    {
      barber_statuses: statusResult.data ?? [],
      walkins: walkinsResult.data ?? [],
      barbers: barbersResult.data ?? [],
    },
    {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}
