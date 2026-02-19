import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminDashboard } from './AdminDashboard'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, first_name, last_name, role, shop_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) redirect('/login')

  const adminClient = createAdminClient()

  const [walkinsRes, barbersRes, statesRes, eventsRes] = await Promise.all([
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/walkins`, { cache: 'no-store' }),
    adminClient.from('users').select('id, first_name, last_name').eq('role', 'barber').eq('is_active', true),
    adminClient.from('barber_state').select('barber_id, state, state_since'),
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/events`, { cache: 'no-store' }),
  ])

  return (
    <AdminDashboard
      currentUserName={`${profile.first_name} ${profile.last_name}`}
      shopId={profile.shop_id ?? ''}
      initialWalkins={walkinsRes.ok ? await walkinsRes.json() : []}
      initialBarbers={barbersRes.data ?? []}
      initialStates={statesRes.data ?? []}
      initialEvents={eventsRes.ok ? await eventsRes.json() : []}
    />
  )
}
