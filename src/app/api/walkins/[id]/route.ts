import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateWalkinTransition } from '@/lib/walkin/validation'
import { appendEvent, WALKIN_STATUS_CHANGED } from '@/lib/walkin/events'
import { refreshShopProjection } from '@/lib/walkin/shop_projector'
import type { Walkin } from '@/types/database'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { status } = body as { status: Walkin['status'] }

  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 })
  }

  const { data: existing, error: fetchError } = await supabase
    .from('walkins')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Walk-in not found' }, { status: 404 })
  }

  const transition = validateWalkinTransition(existing.status, status)
  if (!transition.valid) {
    return NextResponse.json({ error: transition.error }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('walkins')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await appendEvent(supabase, {
      shop_id: existing.shop_id,
      type: WALKIN_STATUS_CHANGED,
      actor_user_id: user.id,
      payload: { walkin_id: id, from: existing.status, to: status },
    })
  } catch {
    // Event append is best-effort; don't fail the status update
  }

  refreshShopProjection(supabase, existing.shop_id).catch(() => {})

  return NextResponse.json(data)
}
