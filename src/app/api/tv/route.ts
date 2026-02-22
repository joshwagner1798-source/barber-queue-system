import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Walkins and barber_status use the legacy seed shop_id
const SHOP_ID = '00000000-0000-0000-0000-000000000001'
// Users (barbers) and their appointments were seeded with a different shop_id
const BARBERS_SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

/** TV initial load — returns only display-safe data (no phone, no client_id). */
export async function GET() {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const [statusResult, walkinsResult, barbersResult, nextApptsResult, nextBlocksResult] =
    await Promise.all([
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

      // Next upcoming appointment per barber (not cancelled/deleted)
      admin
        .from('provider_appointments')
        .select('barber_id, start_at')
        .eq('shop_id', BARBERS_SHOP_ID)
        .gt('start_at', now)
        .not('status', 'in', '("CANCELLED","DELETED")')
        .order('start_at', { ascending: true }),

      // Next upcoming blocked time per barber
      admin
        .from('time_blocks')
        .select('barber_id, start_datetime, title')
        .eq('shop_id', BARBERS_SHOP_ID)
        .gt('start_datetime', now)
        .order('start_datetime', { ascending: true }),
    ])

  // Build per-barber maps: first occurrence wins (already ordered by start asc)
  const nextApptMap = new Map<string, string>()
  for (const a of nextApptsResult.data ?? []) {
    if (!nextApptMap.has(a.barber_id)) nextApptMap.set(a.barber_id, a.start_at)
  }

  const nextBlockMap = new Map<string, { start: string; notes: string | null }>()
  for (const b of nextBlocksResult.data ?? []) {
    if (!nextBlockMap.has(b.barber_id))
      nextBlockMap.set(b.barber_id, { start: b.start_datetime, notes: b.title ?? null })
  }

  // Enrich each barber with next_start_at / next_kind / next_notes
  const barbers = (barbersResult.data ?? []).map((b) => {
    const appt = nextApptMap.get(b.id)
    const block = nextBlockMap.get(b.id)

    let next_start_at: string | null = null
    let next_kind: 'APPT' | 'BLOCK' | null = null
    let next_notes: string | null = null

    if (appt && block) {
      if (new Date(appt) <= new Date(block.start)) {
        next_start_at = appt; next_kind = 'APPT'
      } else {
        next_start_at = block.start; next_kind = 'BLOCK'; next_notes = block.notes
      }
    } else if (appt) {
      next_start_at = appt; next_kind = 'APPT'
    } else if (block) {
      next_start_at = block.start; next_kind = 'BLOCK'; next_notes = block.notes
    }

    return { ...b, next_start_at, next_kind, next_notes }
  })

  return NextResponse.json({
    barber_statuses: statusResult.data ?? [],
    walkins: walkinsResult.data ?? [],
    barbers,
  })
}
