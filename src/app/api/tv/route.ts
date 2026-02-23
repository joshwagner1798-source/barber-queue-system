import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Walkins and barber_status use the legacy seed shop_id
const SHOP_ID = '00000000-0000-0000-0000-000000000001'
// Users (barbers) and their appointments were seeded with a different shop_id
const BARBERS_SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

/** First line of notes, capped at 22 chars with ellipsis. */
function shortNote(notes: string | null): string | null {
  if (!notes) return null
  const first = notes.split('\n')[0].trim()
  return first.length <= 22 ? first : first.slice(0, 22).trimEnd() + '…'
}

/** TV initial load — returns only display-safe data (no phone, no client_id). */
export async function GET() {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const [
    statusResult,
    walkinsResult,
    barbersResult,
    currentApptsResult,
    nextApptsResult,
  ] = await Promise.all([
    admin.from('barber_status').select('*').eq('shop_id', SHOP_ID),

    admin
      .from('walkins')
      .select(
        'id, status, display_name, position, assigned_barber_id, called_at, preference_type, preferred_barber_id, service_type, created_at',
      )
      .eq('shop_id', SHOP_ID)
      .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
      .order('position', { ascending: true }),

    admin
      .from('users')
      .select('id, first_name, last_name, avatar_url, display_order')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('role', 'barber')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),

    // Currently-ongoing appointment or block (window overlaps now)
    admin
      .from('provider_appointments')
      .select('barber_id, kind, end_at, notes')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('status', 'ACTIVE')
      .lte('start_at', now)
      .gt('end_at', now),

    // Next upcoming appointment (kind='appointment' only, not blocks)
    admin
      .from('provider_appointments')
      .select('barber_id, start_at, client_name')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('kind', 'appointment')
      .gt('start_at', now)
      .not('status', 'in', '("CANCELLED","DELETED")')
      .order('start_at', { ascending: true }),
  ])

  // Current appointment/block per barber (first match wins; lte+gt guarantees overlap)
  type CurrentRow = { barber_id: string; kind: string; end_at: string; notes: string | null }
  const currentMap = new Map<string, CurrentRow>()
  for (const row of (currentApptsResult.data ?? []) as CurrentRow[]) {
    if (!currentMap.has(row.barber_id)) currentMap.set(row.barber_id, row)
  }

  // Next appointment per barber (first row wins — already ordered by start_at asc)
  type NextRow = { barber_id: string; start_at: string; client_name: string | null }
  const nextApptMap = new Map<string, NextRow>()
  for (const row of (nextApptsResult.data ?? []) as NextRow[]) {
    if (!nextApptMap.has(row.barber_id)) nextApptMap.set(row.barber_id, row)
  }

  type BarberRow = { id: string; first_name: string; last_name: string; avatar_url: string | null; display_order: number }

  // Enrich each barber with appointment-derived fields
  const barbers = ((barbersResult.data ?? []) as unknown as BarberRow[]).map((b) => {
    const current = currentMap.get(b.id)
    const next = nextApptMap.get(b.id)

    const busy_reason: 'appointment' | 'blocked' | null =
      current?.kind === 'appointment' ? 'appointment' :
      current?.kind === 'blocked'     ? 'blocked'     : null

    const free_at = current?.end_at ?? null
    const blocked_note_short = busy_reason === 'blocked' ? shortNote(current?.notes ?? null) : null

    const next_appt_at = next?.start_at ?? null
    const next_appt_client_first = next?.client_name
      ? (next.client_name.split(' ')[0] || null)
      : null

    return {
      ...b,
      busy_reason,
      free_at,
      blocked_note_short,
      next_appt_at,
      next_appt_client_first,
    }
  })

  return NextResponse.json({
    barber_statuses: statusResult.data ?? [],
    walkins: walkinsResult.data ?? [],
    barbers,
  })
}
