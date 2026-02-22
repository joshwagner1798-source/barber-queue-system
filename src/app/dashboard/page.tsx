import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardTabs } from './DashboardTabs'

export const metadata = {
  title: 'Dashboard | Sharper Image',
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const admin = createAdminClient()

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
      currentUserName=""
      shopId=""
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
