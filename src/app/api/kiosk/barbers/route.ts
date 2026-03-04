import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KioskBarber } from '@/lib/kiosk/barbers'
import { requireShopId, checkRequiredEnv } from '@/lib/shop-resolver'

export async function GET(request: NextRequest) {
  const envErr = checkRequiredEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (envErr) return NextResponse.json({ error: 'Server misconfiguration', missing: envErr.missing }, { status: 500 })

  const { shopId, error: shopErr } = requireShopId(request)
  if (shopErr) return NextResponse.json(shopErr, { status: 400 })

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('users')
    .select('id, first_name, last_name')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('[api/kiosk/barbers] Supabase error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = { id: string; first_name: string; last_name: string }
  const barbers: KioskBarber[] = ((data ?? []) as unknown as Row[]).map((b) => ({
    id: b.id,
    firstName: b.first_name,
    lastName: b.last_name,
    displayName: `${b.first_name} ${b.last_name}`,
  }))

  return NextResponse.json(barbers)
}
