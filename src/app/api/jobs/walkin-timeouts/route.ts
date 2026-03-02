// ---------------------------------------------------------------------------
// GET /api/jobs/walkin-timeouts
//
// Finds pending SMS walk-in offers that have passed their 90-second expiry,
// marks them as 'timeout', and advances the offer rotation to the next
// eligible barber for each affected walk-in.
//
// Triggered by Vercel cron (see vercel.json) every 2 minutes.
// Can also be called by the same external scheduler that calls /api/dispatcher.
//
// Auth: Bearer token — accepts either CRON_SECRET (injected by Vercel cron)
//       or WALKIN_TIMEOUT_SECRET (for external scheduler).
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processExpiredAttempts } from '@/lib/walkin/walkin_offer'

export async function GET(request: NextRequest) {
  // Auth check
  const auth = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const timeoutSecret = process.env.WALKIN_TIMEOUT_SECRET

  const authorized =
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    (timeoutSecret && auth === `Bearer ${timeoutSecret}`)

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Find distinct shops that have expired pending offers
  const { data: expiredRows, error: lookupErr } = await admin
    .from('walkin_assignment_attempts')
    .select('shop_id')
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  }

  if (!expiredRows?.length) {
    return NextResponse.json({ processed: 0 })
  }

  type ShopRow = { shop_id: string }
  const shopIds = [
    ...new Set((expiredRows as unknown as ShopRow[]).map((r) => r.shop_id)),
  ]

  let total = 0
  const errors: string[] = []

  for (const shopId of shopIds) {
    try {
      const count = await processExpiredAttempts(admin, shopId)
      total += count
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`shop ${shopId}: ${msg}`)
    }
  }

  return NextResponse.json({ processed: total, shops: shopIds.length, errors })
}
