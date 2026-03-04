import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // If a specific `next` was requested, honor it
      // Validate next is a safe internal path (starts with / but not //)
      const safePath = next && next.startsWith('/') && !next.startsWith('//') ? next : null
      if (safePath) {
        return NextResponse.redirect(`${origin}${safePath}`)
      }

      // Otherwise redirect by role
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('auth_id', user.id)
          .single()

        if (profile?.role === 'barber') {
          return NextResponse.redirect(`${origin}/barber`)
        }
        if (profile?.role === 'admin' || profile?.role === 'owner') {
          return NextResponse.redirect(`${origin}/dashboard`)
        }
      }

      return NextResponse.redirect(`${origin}/`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
