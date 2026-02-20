import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KioskBarber } from '@/lib/kiosk/barbers'

const SHOP_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  // Debug: confirm this runs server-side as a normal API route
  console.log('[api/kiosk/barbers] env: server (Node.js API route)')
  console.log('[api/kiosk/barbers] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('users')
    .select('id, first_name, last_name')
    .eq('shop_id', SHOP_ID)
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('[api/kiosk/barbers] Supabase error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = { id: string; first_name: string; last_name: string }
  const barbers: KioskBarber[] = ((data ?? []) as unknown as Row[]).map((b) => ({
    id: b.id,
    firstName: b.first_name,
    lastName: b.last_name,
    displayName: `${b.first_name} ${b.last_name}`,
  }))

  return NextResponse.json(barbers)
}
