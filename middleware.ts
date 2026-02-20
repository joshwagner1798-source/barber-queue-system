import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Not logged in → redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Look up user role from DB
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (profileError) {
    console.error('[middleware] role lookup failed', { userId: user.id, error: profileError.message })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!profile) {
    console.error('[middleware] no profile found for authenticated user', { userId: user.id })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = profile.role

  // Wrong role for route
  if (pathname.startsWith('/barber') && role !== 'barber') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (pathname.startsWith('/admin') && role !== 'admin' && role !== 'owner') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/barber', '/barber/:path*', '/admin', '/admin/:path*', '/dashboard', '/dashboard/:path*'],
}
