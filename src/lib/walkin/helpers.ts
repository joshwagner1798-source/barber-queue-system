import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function getNextQueuePosition(
  supabase: SupabaseClient<Database>,
  shopId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('walkins')
    .select('position')
    .eq('shop_id', shopId)
    .eq('status', 'WAITING')
    .order('position', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return (data?.position ?? 0) + 1
}

export async function getUserShopId(
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_user_shop_id')
  if (error) return null
  return data
}
