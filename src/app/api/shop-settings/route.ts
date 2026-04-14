// GET /api/shop-settings?shop_id=...
// Returns display + scheduling settings for the shop.
// No auth required — used by TV display, kiosk, and BarberBookingSheet.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_SHOP_ID = process.env.DEFAULT_SHOP_ID ?? ''

export async function GET(request: NextRequest) {
  const shopId = request.nextUrl.searchParams.get('shop_id') ?? DEFAULT_SHOP_ID

  const admin = createAdminClient()
  const { data } = await admin
    .from('shop_settings')
    .select('tv_background_url, kiosk_background_url, scheduling_mode, external_booking_url')
    .eq('shop_id', shopId)
    .maybeSingle()

  type Row = {
    tv_background_url: string | null
    kiosk_background_url: string | null
    scheduling_mode: string | null
    external_booking_url: string | null
  }
  const row = data as unknown as Row | null

  return NextResponse.json({
    tv_background_url:    row?.tv_background_url    ?? null,
    kiosk_background_url: row?.kiosk_background_url ?? null,
    scheduling_mode:      row?.scheduling_mode      ?? 'off',
    external_booking_url: row?.external_booking_url ?? null,
  })
}
