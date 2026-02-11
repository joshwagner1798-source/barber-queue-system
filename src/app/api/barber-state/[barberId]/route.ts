import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VALID_BARBER_STATES } from '@/lib/walkin/validation'
import { appendEvent, BARBER_STATE_CHANGED } from '@/lib/walkin/events'
import { processBarberAvailable } from '@/lib/walkin/queue_assignment'
import { refreshShopProjection } from '@/lib/walkin/shop_projector'
import type { BarberState } from '@/types/database'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ barberId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { barberId } = await params
  const body = await request.json()
  const { shop_id, state, manual_free_at } = body as {
    shop_id: string
    state: BarberState['state']
    manual_free_at?: string | null
  }

  if (!shop_id) {
    return NextResponse.json({ error: 'shop_id is required' }, { status: 400 })
  }
  if (!state || !VALID_BARBER_STATES.has(state)) {
    return NextResponse.json({ error: 'Invalid barber state' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('barber_state')
    .upsert(
      {
        shop_id,
        barber_id: barberId,
        state,
        state_since: new Date().toISOString(),
        manual_free_at: manual_free_at ?? null,
      },
      { onConflict: 'shop_id,barber_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await appendEvent(supabase, {
      shop_id,
      type: BARBER_STATE_CHANGED,
      actor_user_id: user.id,
      payload: { barber_id: barberId, state, manual_free_at: manual_free_at ?? null },
    })
  } catch {
    // best-effort
  }

  // Auto-assign next walk-in when barber becomes AVAILABLE
  let autoAssignment = null
  if (state === 'AVAILABLE') {
    try {
      autoAssignment = await processBarberAvailable(
        supabase,
        shop_id,
        barberId,
        user.id,
      )
    } catch {
      // best-effort — state change already succeeded
    }
  }

  refreshShopProjection(supabase, shop_id).catch(() => {})

  return NextResponse.json({ barber_state: data, auto_assignment: autoAssignment })
}
