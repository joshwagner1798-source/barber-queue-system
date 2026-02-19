import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BarberDashboard } from './BarberDashboard'

export default async function BarberPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get current barber's profile
  const { data: profile } = await supabase
    .from('users')
    .select('id, first_name, last_name, role, shop_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || profile.role !== 'barber') redirect('/login')

  const adminClient = createAdminClient()

  // Fetch initial data in parallel
  const [walkinsRes, barbersRes, statesRes] = await Promise.all([
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/walkins`, { cache: 'no-store' }),
    adminClient.from('users').select('id, first_name, last_name').eq('role', 'barber').eq('is_active', true),
    adminClient.from('barber_state').select('barber_id, state, state_since'),
  ])

  const walkins = walkinsRes.ok ? await walkinsRes.json() : []
  const barbers = barbersRes.data ?? []
  const states = statesRes.data ?? []

  const activeWalkin = walkins.find(
    (w: { status: string; assigned_barber_id: string | null }) =>
      (w.status === 'CALLED' || w.status === 'IN_SERVICE') &&
      w.assigned_barber_id === profile.id
  )

  let initialActiveAssignmentId: string | null = null
  if (activeWalkin) {
    const { data: activeAssignment } = await adminClient
      .from('assignments')
      .select('id')
      .eq('walkin_id', activeWalkin.id)
      .is('ended_at', null)
      .single()
    initialActiveAssignmentId = activeAssignment?.id ?? null
  }

  return (
    <BarberDashboard
      currentBarberId={profile.id}
      currentBarberName={`${profile.first_name} ${profile.last_name}`}
      shopId={profile.shop_id ?? ''}
      initialWalkins={walkins}
      initialBarbers={barbers}
      initialStates={states}
      initialActiveAssignmentId={initialActiveAssignmentId}
    />
  )
}
