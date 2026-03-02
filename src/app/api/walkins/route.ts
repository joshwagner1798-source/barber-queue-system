import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNextQueuePosition } from '@/lib/walkin/helpers'
import { appendEvent, WALKIN_ADDED } from '@/lib/walkin/events'
import { refreshShopProjection } from '@/lib/walkin/shop_projector'
import { initiateWalkinOffer } from '@/lib/walkin/walkin_offer'
import { getEligibleWalkinBarbers } from '@/lib/walkin/eligible_barbers'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('walkins')
    .select('*')
    .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { shop_id, service_type, preference_type, preferred_barber_id, notes } = body

  if (!shop_id) {
    return NextResponse.json({ error: 'shop_id is required' }, { status: 400 })
  }

  const validPreferenceTypes = ['ANY', 'PREFERRED', 'FASTEST']
  if (preference_type && !validPreferenceTypes.includes(preference_type)) {
    return NextResponse.json({ error: 'Invalid preference_type' }, { status: 400 })
  }

  try {
    const position = await getNextQueuePosition(supabase, shop_id)

    const { data, error } = await supabase
      .from('walkins')
      .insert({
        shop_id,
        service_type: service_type ?? 'cut',
        preference_type: preference_type ?? 'ANY',
        preferred_barber_id: preferred_barber_id ?? null,
        notes: notes ?? null,
        position,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await appendEvent(supabase, {
      shop_id,
      type: WALKIN_ADDED,
      actor_user_id: user.id,
      payload: { walkin_id: data.id, position, service_type: data.service_type },
    })

    refreshShopProjection(supabase, shop_id).catch(() => {})

    // Trigger SMS offer rotation using admin client (bypasses RLS on attempts table)
    const adminForOffer = createAdminClient()
    initiateWalkinOffer(adminForOffer, shop_id, data.id).catch(() => {})

    // Debug: log eligibility snapshot so we can diagnose "no ready barbers" reports
    getEligibleWalkinBarbers(adminForOffer, shop_id).then(({ eligible, rejected }) => {
      const tag = `[WALKIN_CREATED shop=${shop_id} walkin_id=${data.id}]`
      const eligibleLog = eligible.length
        ? eligible.map((b) => `${b.name}(ready=${b.readyMinutes}min)`).join(', ')
        : 'NONE'
      const rejectedLog = rejected
        .map((b) => `${b.name}[${b.reasons.join('; ')}]`)
        .join(' | ')
      console.log(`${tag} eligible_count=${eligible.length}: ${eligibleLog}`)
      if (rejected.length) {
        console.log(`${tag} rejected_count=${rejected.length}: ${rejectedLog}`)
      }
      if (eligible.length === 0) {
        console.warn(`${tag} WARNING: No eligible walk-in barbers found — customer will see no ready barbers`)
      }
    }).catch(() => {})

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
