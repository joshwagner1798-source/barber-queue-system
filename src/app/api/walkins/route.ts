import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNextQueuePosition } from '@/lib/walkin/helpers'
import { appendEvent, WALKIN_ADDED } from '@/lib/walkin/events'
import { refreshShopProjection } from '@/lib/walkin/shop_projector'

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

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
