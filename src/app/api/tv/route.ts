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

  const [
    statusResult,
    walkinsResult,
    barbersResult,
    currentBlocksResult,   // provider_blocks — primary source for BLOCKED
    currentApptsResult,    // provider_appointments kind='appointment' — IN_CHAIR
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

    // Currently-active blocks from provider_blocks (primary)
    admin
      .from('provider_blocks')
      .select('barber_id, end_at, note_short')
      .eq('shop_id', BARBERS_SHOP_ID)
      .lte('start_at', now)
      .gt('end_at', now),

    // Currently-ongoing appointments from provider_appointments (kind='appointment' only)
    admin
      .from('provider_appointments')
      .select('barber_id, end_at')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('kind', 'appointment')
      .eq('status', 'ACTIVE')
      .lte('start_at', now)
      .gt('end_at', now),

    // Next upcoming appointment per barber
    admin
      .from('provider_appointments')
      .select('barber_id, start_at, client_name')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('kind', 'appointment')
      .gt('start_at', now)
      .not('status', 'in', '("CANCELLED","DELETED")')
      .order('start_at', { ascending: true }),
  ])

  // ── Active blocks ─────────────────────────────────────────────────────────
  type BlockRow = { barber_id: string; end_at: string; note_short: string | null }
  const currentBlockMap = new Map<string, BlockRow>()
  for (const row of (currentBlocksResult.data ?? []) as BlockRow[]) {
    if (!currentBlockMap.has(row.barber_id)) currentBlockMap.set(row.barber_id, row)
  }

  const activeBlockCount = currentBlockMap.size
  console.log(`Blocks active now: ${activeBlockCount}`)

  // ── Active appointments ───────────────────────────────────────────────────
  type ApptRow = { barber_id: string; end_at: string }
  const currentApptMap = new Map<string, ApptRow>()
  for (const row of (currentApptsResult.data ?? []) as ApptRow[]) {
    if (!currentApptMap.has(row.barber_id)) currentApptMap.set(row.barber_id, row)
  }

  // ── Next appointment per barber ───────────────────────────────────────────
  type NextRow = { barber_id: string; start_at: string; client_name: string | null }
  const nextApptMap = new Map<string, NextRow>()
  for (const row of (nextApptsResult.data ?? []) as NextRow[]) {
    if (!nextApptMap.has(row.barber_id)) nextApptMap.set(row.barber_id, row)
  }

  type BarberRow = { id: string; first_name: string; last_name: string; avatar_url: string | null; display_order: number }

  const barbers = ((barbersResult.data ?? []) as unknown as BarberRow[]).map((b) => {
    const block = currentBlockMap.get(b.id)
    const appt  = currentApptMap.get(b.id)
    const next  = nextApptMap.get(b.id)

    // Priority: BLOCKED > IN_CHAIR > AVAILABLE
    const busy_reason: 'appointment' | 'blocked' | null =
      block ? 'blocked' :
      appt  ? 'appointment' :
      null

    const free_at         = block?.end_at ?? appt?.end_at ?? null
    const blocked_until   = block?.end_at ?? null
    // Read note_short directly from DB (pre-computed by reconcile)
    const blocked_note_short =
      busy_reason === 'blocked'
        ? (block?.note_short ?? 'Blocked')
        : null

    const next_appt_at   = next?.start_at ?? null
    const next_client_name = next?.client_name
      ? (next.client_name.split(' ')[0] || null)
      : null

    return {
      ...b,
      busy_reason,
      free_at,
      blocked_until,
      blocked_note_short,
      next_appt_at,
      next_client_name,
    }
  })

  return NextResponse.json({
    barber_statuses: statusResult.data ?? [],
    walkins: walkinsResult.data ?? [],
    barbers,
  })
}
