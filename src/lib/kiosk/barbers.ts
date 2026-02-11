'use server'

import { createAdminClient } from '@/lib/supabase/admin'

const SHOP_ID = '00000000-0000-0000-0000-000000000001'

export interface KioskBarber {
  id: string
  firstName: string
  lastName: string
  displayName: string
}

export async function getActiveBarbers(): Promise<KioskBarber[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('users')
    .select('id, first_name, last_name')
    .eq('shop_id', SHOP_ID)
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw new Error(`Failed to load barbers: ${error.message}`)

  type Row = { id: string; first_name: string; last_name: string }
  return ((data ?? []) as unknown as Row[]).map((b) => ({
    id: b.id,
    firstName: b.first_name,
    lastName: b.last_name,
    displayName: `${b.first_name} ${b.last_name}`,
  }))
}
