import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SHOP_ID = '00000000-0000-0000-0000-000000000001'

/** TV live data — returns only display-safe data (no phone, no client_id). */
export async function GET() {
  const admin = createAdminClient()

  const [statusResult, walkinsResult, barbersResult] = await Promise.all([
    admin.from('barber_status').select('*').eq('shop_id', SHOP_ID),

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
