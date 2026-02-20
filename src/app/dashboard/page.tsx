import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardTabs } from './DashboardTabs'

export const metadata = {
  title: 'Dashboard | Sharper Image',
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  type ProfileRow = {
    id: string
    first_name: string
    last_name: string
    role: string
    shop_id: string | null
  }

  const { data: profileRaw } = await supabase
    .from('users')
    .select('id, first_name, last_name, role, shop_id')
    .eq('auth_id', user.id)
    .single()

  const profile = profileRaw as unknown as ProfileRow | null

  if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
    redirect('/login')
  }

  const admin = createAdminClient()
  const shopId = profile.shop_id ?? ''

  // Fetch initial data for the Owner Settings tab (AdminDashboard)
  // Uses adminClient directly — avoids self-fetch anti-pattern
  const [barbersRes, statesRes, walkinsRes, eventsRes] = await Promise.all([
    admin
      .from('users')
      .select('id, first_name, last_name')
      .eq('role', 'barber')
      .eq('is_active', true),

    admin.from('barber_state').select('barber_id, state, state_since'),

    admin
      .from('walkins')
      .select(
        'id, display_name, status, position, assigned_barber_id, called_at, created_at',
      )
      .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
      .order('position', { ascending: true }),

    admin
      .from('events')
      .select('id, type, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return (
    <DashboardTabs
      currentUserName={`${profile.first_name} ${profile.last_name}`}
      shopId={shopId}
      initialBarbers={(barbersRes.data ?? []) as Array<{ id: string; first_name: string; last_name: string }>}
      initialStates={(statesRes.data ?? []) as Array<{ barber_id: string; state: string; state_since: string }>}
      initialWalkins={(walkinsRes.data ?? []) as Array<{
        id: string
        display_name: string | null
        status: string
        position: number
        assigned_barber_id: string | null
        called_at: string | null
        created_at: string
      }>}
      initialEvents={(eventsRes.data ?? []) as Array<{
        id: string
        type: string
        payload: Record<string, unknown>
        created_at: string
      }>}
    />
  )
}
