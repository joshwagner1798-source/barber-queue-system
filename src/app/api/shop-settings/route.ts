// GET /api/shop-settings
// Returns current tv_background_url + kiosk_background_url for the shop.
// No auth required — used by TV display and kiosk server components.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('shop_settings')
    .select('tv_background_url, kiosk_background_url')
    .eq('shop_id', SHOP_ID)
    .maybeSingle()

  return NextResponse.json({
    tv_background_url:    (data as { tv_background_url: string | null } | null)?.tv_background_url    ?? null,
    kiosk_background_url: (data as { kiosk_background_url: string | null } | null)?.kiosk_background_url ?? null,
  })
}
