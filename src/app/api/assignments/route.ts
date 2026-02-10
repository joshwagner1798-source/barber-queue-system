import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appendEvent, ASSIGNMENT_STARTED } from '@/lib/walkin/events'
import { refreshShopProjection } from '@/lib/walkin/shop_projector'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { shop_id, walkin_id, barber_id } = body

  if (!shop_id || !walkin_id || !barber_id) {
    return NextResponse.json(
      { error: 'shop_id, walkin_id, and barber_id are required' },
      { status: 400 }
    )
  }

  // Create assignment
  const { data: assignment, error: assignError } = await supabase
    .from('assignments')
    .insert({ shop_id, walkin_id, barber_id })
    .select()
    .single()

  if (assignError) return NextResponse.json({ error: assignError.message }, { status: 500 })

  // Update walkin status to IN_SERVICE
  const { error: walkinError } = await supabase
    .from('walkins')
    .update({ status: 'IN_SERVICE' as const })
    .eq('id', walkin_id)

  if (walkinError) return NextResponse.json({ error: walkinError.message }, { status: 500 })

  // Update barber state to IN_CHAIR
  const { error: barberError } = await supabase
    .from('barber_state')
    .upsert(
      {
        shop_id,
        barber_id,
        state: 'IN_CHAIR' as const,
        state_since: new Date().toISOString(),
      },
      { onConflict: 'shop_id,barber_id' }
    )

  if (barberError) return NextResponse.json({ error: barberError.message }, { status: 500 })

  try {
    await appendEvent(supabase, {
      shop_id,
      type: ASSIGNMENT_STARTED,
      actor_user_id: user.id,
      payload: { assignment_id: assignment.id, walkin_id, barber_id },
    })
  } catch {
    // best-effort
  }

  refreshShopProjection(supabase, shop_id).catch(() => {})

  return NextResponse.json(assignment, { status: 201 })
}
