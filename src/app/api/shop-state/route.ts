import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshShopProjection } from '@/lib/walkin/shop_projector'
import { getUserShopId } from '@/lib/walkin/helpers'

/**
 * GET  — read the cached projection (fast, no recompute)
 * POST — force a full refresh and return the new snapshot
 */

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shopId =
    request.nextUrl.searchParams.get('shop_id') ??
    (await getUserShopId(supabase))

  if (!shopId) {
    return NextResponse.json({ error: 'shop_id is required' }, { status: 400 })
  }

  // Read the cached projection
  const { data, error } = await supabase
    .from('shop_state_projection')
    .select('*')
    .eq('shop_id', shopId)
    .single()

  if (error || !data) {
    // No projection yet — compute one
    try {
      const result = await refreshShopProjection(supabase, shopId)
      return NextResponse.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal server error'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const shopId =
    (body as { shop_id?: string }).shop_id ?? (await getUserShopId(supabase))

  if (!shopId) {
    return NextResponse.json({ error: 'shop_id is required' }, { status: 400 })
  }

  try {
    const result = await refreshShopProjection(supabase, shopId)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
