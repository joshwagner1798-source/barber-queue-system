// GET /api/jobs/walkin-timeouts
//
// Called every minute by cron-job.org.
// Auth: Authorization: Bearer <WALKIN_TIMEOUT_SECRET>
//
// Does two things:
//   1. Advance expired SMS offer attempts (walkin_assignment_attempts pending → timeout)
//   2. Mark CALLED walk-ins older than 5 min as NO_SHOW

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processExpiredAttempts } from '@/lib/walkin/walkin_offer'
import { CALLED_TIMEOUT_MINUTES } from '@/lib/dispatcher/engine'

export async function GET(request: NextRequest) {
  const secret = process.env.WALKIN_TIMEOUT_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'WALKIN_TIMEOUT_SECRET not configured' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shopId = request.nextUrl.searchParams.get('shop_id') ?? process.env.DEFAULT_SHOP_ID
  if (!shopId) {
    return NextResponse.json({ error: 'shop_id required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date()

  // 1. SMS offer attempt timeouts — advances rotation for any expired pending attempts
  const smsTimeouts = await processExpiredAttempts(admin, shopId)

  // 2. CALLED → NO_SHOW: walkins stuck in CALLED for > CALLED_TIMEOUT_MINUTES
  const calledCutoff = new Date(now.getTime() - CALLED_TIMEOUT_MINUTES * 60_000).toISOString()

  const { data: expiredCalled } = await admin
    .from('walkins')
    .select('id')
    .eq('shop_id', shopId)
    .eq('status', 'called')
    .lt('called_at', calledCutoff)

  type WRow = { id: string }
  const noShowIds: string[] = []

  for (const w of (expiredCalled ?? []) as unknown as WRow[]) {
    // Optimistic lock: only update if still called (guard against races)
    const { error } = await admin
      .from('walkins')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({ status: 'no_show' })
      .eq('id', w.id)
      .eq('status', 'called')

    if (error) continue

    await admin
      .from('assignments')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({ ended_at: now.toISOString() })
      .eq('walkin_id', w.id)
      .is('ended_at', null)

    noShowIds.push(w.id)
  }

  console.log(
    `[WALKIN_TIMEOUTS] shop=${shopId} sms_timeouts=${smsTimeouts} no_shows=${noShowIds.length}`,
  )

  return NextResponse.json({
    ok: true,
    processed: noShowIds.length + smsTimeouts,
    no_shows: noShowIds.length,
    sms_timeouts: smsTimeouts,
    ids: noShowIds,
  })
}
