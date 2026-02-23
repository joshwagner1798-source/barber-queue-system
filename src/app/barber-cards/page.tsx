import { createAdminClient } from '@/lib/supabase/admin'
import { BarberCard } from '@/components/BarberCard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Barber Cards',
}

export default async function BarberCardsPage() {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const [barbersRes, statesRes, currentRes, nextRes] = await Promise.all([
    admin
      .from('users')
      .select('id, first_name, last_name, avatar_url')
      .eq('role', 'barber')
      .eq('is_active', true)
      .order('display_order'),

    admin.from('barber_state').select('barber_id, state'),

    // Currently ongoing appointment or block
    admin
      .from('provider_appointments')
      .select('barber_id, kind, end_at, notes')
      .eq('status', 'ACTIVE')
      .lte('start_at', now)
      .gt('end_at', now),

    // Next upcoming appointment per barber
    admin
      .from('provider_appointments')
      .select('barber_id, start_at, client_name')
      .eq('kind', 'appointment')
      .gt('start_at', now)
      .not('status', 'in', '("CANCELLED","DELETED")')
      .order('start_at', { ascending: true }),
  ])

  type BarberRow = { id: string; first_name: string; last_name: string; avatar_url: string | null }
  type StateRow = { barber_id: string; state: string }

  const barbers = (barbersRes.data ?? []) as unknown as BarberRow[]

  const stateMap = new Map<string, string>(
    ((statesRes.data ?? []) as unknown as StateRow[]).map((s) => [s.barber_id, s.state]),
  )

  type CurrentRow = { barber_id: string; kind: string; end_at: string; notes: string | null }
  const currentMap = new Map<string, CurrentRow>()
  for (const row of (currentRes.data ?? []) as CurrentRow[]) {
    if (!currentMap.has(row.barber_id)) currentMap.set(row.barber_id, row)
  }

  type NextRow = { barber_id: string; start_at: string; client_name: string | null }
  const nextApptMap = new Map<string, NextRow>()
  for (const row of (nextRes.data ?? []) as NextRow[]) {
    if (!nextApptMap.has(row.barber_id)) nextApptMap.set(row.barber_id, row)
  }

  function shortNote(notes: string | null): string | null {
    if (!notes) return null
    const first = notes.split('\n')[0].trim()
    return first.length <= 22 ? first : first.slice(0, 22).trimEnd() + '…'
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <h1 className="text-white text-2xl font-bold mb-8">Barber Cards</h1>
      <div className="flex flex-nowrap gap-4">
        {(barbers as BarberRow[]).map((barber) => {
          const current = currentMap.get(barber.id)
          const next = nextApptMap.get(barber.id)
          const busyReason =
            current?.kind === 'appointment' ? 'appointment' :
            current?.kind === 'blocked'     ? 'blocked'     : null

          return (
            <BarberCard
              key={barber.id}
              firstName={barber.first_name}
              lastName={barber.last_name}
              avatarUrl={barber.avatar_url}
              status={stateMap.get(barber.id) ?? 'AVAILABLE'}
              nextApptAt={next?.start_at ?? null}
              nextClientName={next?.client_name?.split(' ')[0] ?? null}
              busyReason={busyReason as 'appointment' | 'blocked' | null}
              blockedNoteShort={busyReason === 'blocked' ? shortNote(current?.notes ?? null) : null}
              freeAt={current?.end_at ?? null}
            />
          )
        })}
      </div>
    </div>
  )
}
