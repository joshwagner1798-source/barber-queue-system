import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getShopAvailability } from '@/lib/walkin/availability'
import { getUserShopId } from '@/lib/walkin/helpers'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use explicit shop_id from query params, or fall back to user's shop
  const shopId =
    request.nextUrl.searchParams.get('shop_id') ??
    (await getUserShopId(supabase))

  if (!shopId) {
    return NextResponse.json(
      { error: 'shop_id is required' },
      { status: 400 },
    )
  }

  try {
    const availability = await getShopAvailability(supabase, shopId)
    return NextResponse.json(availability)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
