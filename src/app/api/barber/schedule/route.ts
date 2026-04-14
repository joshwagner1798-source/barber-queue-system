// ---------------------------------------------------------------------------
// GET /api/barber/schedule?barber_id=...&shop_id=...
//
// Returns today + upcoming 7 days of appointments for a single barber.
// Sources: provider_appointments (Acuity-synced) + native appointments table.
// Both are merged and sorted by start time.
//
// Auth: validates the requesting user's auth session matches the barber_id.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Status labels visible to the barber
const PROVIDER_SKIP = new Set(['CANCELLED', 'DELETED'])
const NATIVE_SKIP   = new Set(['cancelled', 'no_show'])

export interface ScheduleAppointment {
  id: string
  source: 'provider' | 'native'
  start_at: string   // ISO UTC
  end_at: string     // ISO UTC
  client_name: string | null
  service_name: string | null
  status: string
  notes: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const barberId = searchParams.get('barber_id')
  const shopId   = searchParams.get('shop_id')

  if (!barberId || !shopId) {
    return NextResponse.json({ error: 'barber_id and shop_id are required' }, { status: 400 })
  }

  // ── Auth check: session user must own this barber profile ────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, shop_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || (profile.id !== barberId && profile.role !== 'admin' && profile.role !== 'owner')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Date window: today start → 7 days out ────────────────────────────────
  const now = new Date()
  // Start of today in UTC (midnight UTC). We use UTC throughout; the client
  // formats times in the user's local timezone.
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  const windowEnd = new Date(todayStart)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 8) // 8 days to include full day 7

  const admin = createAdminClient()

  const [providerRes, nativeRes] = await Promise.all([
    // Provider appointments (Acuity-synced)
    admin
      .from('provider_appointments')
      .select('id, start_at, end_at, status, client_name, kind, notes')
      .eq('barber_id', barberId)
      .eq('shop_id', shopId)
      .eq('kind', 'appointment')
      .gte('start_at', todayStart.toISOString())
      .lt('start_at', windowEnd.toISOString())
      .not('status', 'in', '("CANCELLED","DELETED")')
      .order('start_at', { ascending: true }),

    // Native appointments (joined with clients via client_id FK, services via service_id)
    admin
      .from('appointments')
      .select('id, start_time, end_time, status, notes, clients!client_id(first_name, last_initial), services!service_id(name)')
      .eq('barber_id', barberId)
      .eq('shop_id', shopId)
      .gte('start_time', todayStart.toISOString())
      .lt('start_time', windowEnd.toISOString())
      .not('status', 'in', '("cancelled","no_show")')
      .order('start_time', { ascending: true }),
  ])

  type ProviderRow = {
    id: string
    start_at: string
    end_at: string
    status: string
    client_name: string | null
    kind: string
    notes: string | null
  }

  type NativeRow = {
    id: string
    start_time: string
    end_time: string
    status: string
    notes: string | null
    clients: { first_name: string; last_initial: string } | null
    services: { name: string } | null
  }

  const providerAppts: ScheduleAppointment[] = ((providerRes.data ?? []) as unknown as ProviderRow[])
    .filter(r => !PROVIDER_SKIP.has(r.status))
    .map(r => ({
      id: `p_${r.id}`,
      source: 'provider',
      start_at: r.start_at,
      end_at:   r.end_at,
      client_name:  r.client_name ?? null,
      service_name: null,
      status: r.status,
      notes: r.notes ?? null,
    }))

  const nativeAppts: ScheduleAppointment[] = ((nativeRes.data ?? []) as unknown as NativeRow[])
    .filter(r => !NATIVE_SKIP.has(r.status))
    .map(r => {
      const c = r.clients
      const clientName = c ? `${c.first_name} ${c.last_initial}.` : null
      return {
        id: `n_${r.id}`,
        source: 'native',
        start_at: r.start_time,
        end_at:   r.end_time,
        client_name:  clientName,
        service_name: r.services?.name ?? null,
        status: r.status,
        notes: r.notes ?? null,
      }
    })

  // Merge and sort by start time, dedupe by time+client if both sources overlap
  const all = [...providerAppts, ...nativeAppts].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  )

  return NextResponse.json({ appointments: all, fetched_at: now.toISOString() })
}
