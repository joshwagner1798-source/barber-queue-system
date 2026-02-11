import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'
import { runDispatcher } from '@/lib/dispatcher/engine'

const SHOP_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(request: NextRequest) {
  // Auth: require Bearer token matching DISPATCHER_SECRET
  const auth = request.headers.get('authorization')
  const secret = process.env.DISPATCHER_SECRET
  if (!secret || !auth || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const provider = new AcuityProvider()

  try {
    const result = await runDispatcher(admin, SHOP_ID, provider)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
