import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getQueueEstimate } from '@/lib/walkin/wait_time_estimator'
import { getUserShopId } from '@/lib/walkin/helpers'

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
    return NextResponse.json(
      { error: 'shop_id is required' },
      { status: 400 },
    )
  }

  try {
    const estimate = await getQueueEstimate(supabase, shopId)
    return NextResponse.json(estimate)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
