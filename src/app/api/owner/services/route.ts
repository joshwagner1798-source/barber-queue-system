import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'

export async function GET(req: NextRequest) {
  const { shopId, error } = requireShopId(req)
  if (error) return NextResponse.json(error, { status: 400 })

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('services')
    .select('id, name, duration_minutes, price, is_active, display_order')
    .eq('shop_id', shopId)
    .order('display_order', { ascending: true })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { shopId, error: shopError } = requireShopId(req)
  if (shopError) return NextResponse.json(shopError, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, duration_minutes, price } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || !(name as string).trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof duration_minutes !== 'number' || !Number.isInteger(duration_minutes) || duration_minutes <= 0) {
    return NextResponse.json({ error: 'duration_minutes must be an integer greater than 0' }, { status: 400 })
  }
  if (typeof price !== 'number' || price < 0) {
    return NextResponse.json({ error: 'price must be 0 or greater' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { count, error: countError } = await admin
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  const { data, error: dbError } = await admin
    .from('services')
    .insert({
      shop_id: shopId,
      name: (name as string).trim(),
      duration_minutes,
      price,
      is_active: true,
      display_order: (count ?? 0) + 1,
    } as never)
    .select('id, name, duration_minutes, price, is_active, display_order')
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
