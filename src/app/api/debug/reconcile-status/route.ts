// ---------------------------------------------------------------------------
// GET /api/debug/reconcile-status?shop_id=<uuid>
//
// Returns a safe diagnostic snapshot for a shop:
//   - shop_id used
//   - count of active calendar_connections
//   - count of active barber users
//   - last 5 provider_appointments (id, start_at, end_at, barber_id only)
//
// No auth required. Does NOT return secrets or payload_json.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'

type ConnRow = {
  id: string
  barber_id: string
  provider: string
  provider_calendar_id: string
  active: boolean
  sync_health: string | null
  last_sync_at: string | null
  off_until_at: string | null
}

type BarberRow = {
  id: string
  first_name: string
  last_name: string
}

type ApptRow = {
  id: string
  barber_id: string
  kind: string
  start_at: string
  end_at: string
  status: string
}

export async function GET(request: NextRequest) {
  const { shopId, error: shopErr } = requireShopId(request)
  if (shopErr) return NextResponse.json(shopErr, { status: 400 })

  const admin = createAdminClient()

  const [connResult, barbersResult, apptsResult] = await Promise.all([
    admin
      .from('calendar_connections')
      .select('id, barber_id, provider, provider_calendar_id, active, sync_health, last_sync_at, off_until_at')
      .eq('shop_id', shopId)
      .eq('active', true),

    admin
      .from('users')
      .select('id, first_name, last_name')
      .eq('shop_id', shopId)
      .eq('role', 'barber')
      .eq('is_active', true),

    admin
      .from('provider_appointments')
      .select('id, barber_id, kind, start_at, end_at, status')
      .eq('shop_id', shopId)
      .order('start_at', { ascending: false })
      .limit(5),
  ])

  const connections = (connResult.data ?? []) as unknown as ConnRow[]
  const barbers     = (barbersResult.data ?? []) as unknown as BarberRow[]
  const appts       = (apptsResult.data ?? []) as unknown as ApptRow[]

  return NextResponse.json({
    shop_id: shopId,
    calendar_connections_active: connections.length,
    calendar_connections: connections.map((c) => ({
      id: c.id,
      barber_id: c.barber_id,
      provider: c.provider,
      provider_calendar_id: c.provider_calendar_id,
      sync_health: c.sync_health,
      last_sync_at: c.last_sync_at,
      off_until_at: c.off_until_at,
    })),
    barbers_active: barbers.length,
    barbers: barbers.map((b) => ({
      id: b.id,
      name: `${b.first_name} ${b.last_name}`,
    })),
    recent_appointments_count: appts.length,
    recent_appointments: appts.map((a) => ({
      id: a.id,
      barber_id: a.barber_id,
      kind: a.kind,
      start_at: a.start_at,
      end_at: a.end_at,
      status: a.status,
    })),
    errors: {
      connections:  connResult.error?.message ?? null,
      barbers:      barbersResult.error?.message ?? null,
      appointments: apptsResult.error?.message ?? null,
    },
  })
}
