import { createAdminClient } from '@/lib/supabase/admin'
import { BarberCard } from '@/components/BarberCard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Barber Cards',
}

export default async function BarberCardsPage() {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const [barbersRes, statesRes, apptsRes] = await Promise.all([
    // All active barbers ordered by display_order
    admin
      .from('users')
      .select('id, first_name, last_name, avatar_url')
      .eq('role', 'barber')
      .eq('is_active', true)
      .order('display_order'),

    // Current state for every barber
    admin.from('barber_state').select('barber_id, state'),

    // Next upcoming provider appointment per barber (status ACTIVE, future only)
    admin
      .from('provider_appointments')
      .select('barber_id, start_at')
      .eq('status', 'ACTIVE')
      .gt('start_at', now)
      .order('start_at', { ascending: true }),
  ])

  const barbers = barbersRes.data ?? []

  // barber_id → state string
  const stateMap = new Map<string, string>(
    (statesRes.data ?? []).map((s) => [s.barber_id, s.state]),
  )

  // barber_id → earliest upcoming start_at
  const nextApptMap = new Map<string, string>()
  for (const appt of apptsRes.data ?? []) {
    if (!nextApptMap.has(appt.barber_id)) {
      nextApptMap.set(appt.barber_id, appt.start_at)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <h1 className="text-white text-2xl font-bold mb-8">Barber Cards</h1>
      <div className="flex flex-nowrap gap-4">
        {barbers.map((barber) => (
          <BarberCard
            key={barber.id}
            firstName={barber.first_name}
            lastName={barber.last_name}
            avatarUrl={barber.avatar_url}
            status={stateMap.get(barber.id) ?? 'AVAILABLE'}
            nextAppointmentAt={nextApptMap.get(barber.id) ?? null}
          />
        ))}
      </div>
    </div>
  )
}
