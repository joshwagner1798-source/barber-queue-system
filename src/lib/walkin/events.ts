import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

export const WALKIN_ADDED = 'WALKIN_ADDED'
export const WALKIN_STATUS_CHANGED = 'WALKIN_STATUS_CHANGED'
export const BARBER_STATE_CHANGED = 'BARBER_STATE_CHANGED'
export const ASSIGNMENT_STARTED = 'ASSIGNMENT_STARTED'
export const ASSIGNMENT_ENDED = 'ASSIGNMENT_ENDED'
export const WALKIN_AUTO_ASSIGNED = 'WALKIN_AUTO_ASSIGNED'

export async function appendEvent(
  supabase: SupabaseClient<Database>,
  params: {
    shop_id: string
    type: string
    actor_user_id: string | null
    payload: Json
  }
) {
  const { error } = await supabase.from('events').insert({
    shop_id: params.shop_id,
    type: params.type,
    actor_user_id: params.actor_user_id,
    payload: params.payload,
  })
  if (error) throw error
}
