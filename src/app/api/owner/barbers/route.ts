import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'

export async function GET(req: NextRequest) {
  const { shopId, error } = requireShopId(req)
  if (error) return NextResponse.json(error, { status: 400 })

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('users')
    .select('id, first_name, last_name, avatar_url, is_active, walkin_enabled, display_order')
    .eq('role', 'barber')
    .eq('shop_id', shopId)
    .order('display_order')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json((data ?? []) as unknown as object[])
}
