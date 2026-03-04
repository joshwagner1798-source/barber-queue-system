import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('id, first_name, last_name, avatar_url')
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('display_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
