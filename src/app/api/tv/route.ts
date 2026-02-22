import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Walkins and barber_status use the legacy seed shop_id
const SHOP_ID = '00000000-0000-0000-0000-000000000001'
// Users (barbers) were seeded with a different shop_id
const BARBERS_SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

/** TV initial load — returns only display-safe data (no phone, no client_id). */
export async function GET() {
  const admin = createAdminClient()

  const [statusResult, walkinsResult, barbersResult] = await Promise.all([
    admin.from('barber_status').select('*').eq('shop_id', SHOP_ID),

    admin
      .from('walkins')
      .select(
        'id, status, display_name, position, assigned_barber_id, called_at, preference_type, preferred_barber_id, service_type, created_at',
      )
      .eq('shop_id', SHOP_ID)
      .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
      .order('position', { ascending: true }),

    admin
      .from('users')
      .select('id, first_name, last_name, avatar_url, display_order')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('role', 'barber')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ])

  return NextResponse.json({
    barber_statuses: statusResult.data ?? [],
    walkins: walkinsResult.data ?? [],
    barbers: barbersResult.data ?? [],
  })
}
