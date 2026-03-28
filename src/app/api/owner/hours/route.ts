import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'
import { validateHoursRow, type HoursRow } from '@/lib/owner/hours-validation'

export async function GET(req: NextRequest) {
  const { shopId, error } = requireShopId(req)
  if (error) return NextResponse.json(error, { status: 400 })

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('business_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('shop_id', shopId)
    .is('barber_id', null)
    .order('day_of_week', { ascending: true })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function PUT(req: NextRequest) {
  const { shopId, error: shopError } = requireShopId(req)
  if (shopError) return NextResponse.json(shopError, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { hours } = body as { hours?: unknown[] }

  if (!Array.isArray(hours) || hours.length === 0) {
    return NextResponse.json({ error: 'hours must be a non-empty array' }, { status: 400 })
  }

  // Validate all rows before any DB write
  for (const row of hours) {
    const err = validateHoursRow(row as HoursRow)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const admin = createAdminClient()

  // DELETE existing shop-level rows, then INSERT fresh
  // Note: upsert is not used because PostgreSQL UNIQUE treats NULL as distinct —
  // rows with barber_id = NULL would not conflict with each other on upsert.
  const { error: deleteError } = await admin
    .from('business_hours')
    .delete()
    .eq('shop_id', shopId)
    .is('barber_id', null)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const rows = (hours as HoursRow[]).map(h => ({
    shop_id: shopId,
    barber_id: null,
    day_of_week: h.day_of_week,
    open_time: h.open_time,
    close_time: h.close_time,
    is_closed: h.is_closed,
  }))

  const { error: insertError } = await admin
    .from('business_hours')
    .insert(rows as never[])

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
