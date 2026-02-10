import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appendEvent, ASSIGNMENT_ENDED } from '@/lib/walkin/events'
import { processBarberAvailable } from '@/lib/walkin/queue_assignment'
import { refreshShopProjection } from '@/lib/walkin/shop_projector'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch existing assignment
  const { data: existing, error: fetchError } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  if (existing.ended_at) {
    return NextResponse.json({ error: 'Assignment already ended' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // End the assignment
  const { data: assignment, error: endError } = await supabase
    .from('assignments')
    .update({ ended_at: now })
    .eq('id', id)
    .select()
    .single()

  if (endError) return NextResponse.json({ error: endError.message }, { status: 500 })

  // Update walkin status to DONE
  const { error: walkinError } = await supabase
    .from('walkins')
    .update({ status: 'DONE' as const })
    .eq('id', existing.walkin_id)

  if (walkinError) return NextResponse.json({ error: walkinError.message }, { status: 500 })

  // Update barber state to AVAILABLE
  const { error: barberError } = await supabase
    .from('barber_state')
    .upsert(
      {
        shop_id: existing.shop_id,
        barber_id: existing.barber_id,
        state: 'AVAILABLE' as const,
        state_since: now,
      },
      { onConflict: 'shop_id,barber_id' }
    )

  if (barberError) return NextResponse.json({ error: barberError.message }, { status: 500 })

  try {
    await appendEvent(supabase, {
      shop_id: existing.shop_id,
      type: ASSIGNMENT_ENDED,
      actor_user_id: user.id,
      payload: {
        assignment_id: id,
        walkin_id: existing.walkin_id,
        barber_id: existing.barber_id,
      },
    })
  } catch {
    // best-effort
  }

  // Auto-assign next walk-in now that barber is free
  let autoAssignment = null
  try {
    autoAssignment = await processBarberAvailable(
      supabase,
      existing.shop_id,
      existing.barber_id,
      user.id,
    )
  } catch {
    // best-effort — assignment end already succeeded
  }

  refreshShopProjection(supabase, existing.shop_id).catch(() => {})

  return NextResponse.json({ assignment, auto_assignment: autoAssignment })
}
