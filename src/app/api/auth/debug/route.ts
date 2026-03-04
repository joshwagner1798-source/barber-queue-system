import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return NextResponse.json({
    session: !!user,
    userId: user?.id ?? null,
    email: user?.email ?? null,
  })
}
