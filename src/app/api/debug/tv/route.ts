// ---------------------------------------------------------------------------
// GET /api/debug/tv
//
// Returns raw computed status per barber so you can verify block logic
// without looking at the UI. No auth required (internal debug tool).
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BARBERS_SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

export async function GET() {
  const admin = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()

  const [barbersResult, allBlocksResult, activeBlocksResult, activeApptsResult, nextApptsResult] =
    await Promise.all([
      admin
        .from('users')
        .select('id, first_name, last_name')
        .eq('shop_id', BARBERS_SHOP_ID)
        .eq('role', 'barber')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),

      // All blocks in the next 48 hours (for visibility)
      admin
        .from('provider_blocks')
        .select('barber_id, start_at, end_at, note_short')
        .eq('shop_id', BARBERS_SHOP_ID)
        .gte('end_at', nowIso)
        .lte('start_at', new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString())
        .order('start_at', { ascending: true }),

      // Currently-active blocks: start_at <= now AND end_at > now
      admin
        .from('provider_blocks')
        .select('barber_id, start_at, end_at, note_short')
        .eq('shop_id', BARBERS_SHOP_ID)
        .lte('start_at', nowIso)
        .gt('end_at', nowIso),

      // Currently-active appointments
      admin
        .from('provider_appointments')
        .select('barber_id, start_at, end_at')
        .eq('shop_id', BARBERS_SHOP_ID)
        .eq('kind', 'appointment')
        .eq('status', 'ACTIVE')
        .lte('start_at', nowIso)
        .gt('end_at', nowIso),

      // Next appointment per barber
      admin
        .from('provider_appointments')
        .select('barber_id, start_at, client_name')
        .eq('shop_id', BARBERS_SHOP_ID)
        .eq('kind', 'appointment')
        .gt('start_at', nowIso)
        .not('status', 'in', '("CANCELLED","DELETED")')
        .order('start_at', { ascending: true }),
    ])

  type BlockRow = { barber_id: string; start_at: string; end_at: string; note_short: string | null }
  type ApptRow  = { barber_id: string; start_at: string; end_at: string }
  type NextRow  = { barber_id: string; start_at: string; client_name: string | null }
  type BarberRow = { id: string; first_name: string; last_name: string }

  const activeBlockMap = new Map<string, BlockRow>()
  for (const r of (activeBlocksResult.data ?? []) as BlockRow[]) {
    if (!activeBlockMap.has(r.barber_id)) activeBlockMap.set(r.barber_id, r)
  }

  const activeApptMap = new Map<string, ApptRow>()
  for (const r of (activeApptsResult.data ?? []) as ApptRow[]) {
    if (!activeApptMap.has(r.barber_id)) activeApptMap.set(r.barber_id, r)
  }

  const nextApptMap = new Map<string, NextRow>()
  for (const r of (nextApptsResult.data ?? []) as NextRow[]) {
    if (!nextApptMap.has(r.barber_id)) nextApptMap.set(r.barber_id, r)
  }

  // Group upcoming blocks by barber for the "upcoming_blocks" field
  const upcomingBlocksByBarber = new Map<string, BlockRow[]>()
  for (const r of (allBlocksResult.data ?? []) as BlockRow[]) {
    if (!upcomingBlocksByBarber.has(r.barber_id)) upcomingBlocksByBarber.set(r.barber_id, [])
    upcomingBlocksByBarber.get(r.barber_id)!.push(r)
  }

  const barbers = ((barbersResult.data ?? []) as unknown as BarberRow[]).map((b) => {
    const activeBlock = activeBlockMap.get(b.id) ?? null
    const activeAppt  = activeApptMap.get(b.id) ?? null
    const nextAppt    = nextApptMap.get(b.id) ?? null

    const is_block_active = activeBlock !== null
    const is_appt_active  = activeAppt !== null

    const status =
      is_block_active ? 'UNAVAILABLE' :
      is_appt_active  ? 'BUSY'        :
      'FREE'

    const busy_reason =
      is_block_active ? 'blocked' :
      is_appt_active  ? 'appointment' :
      null

    return {
      barber_id: b.id,
      name: `${b.first_name} ${b.last_name}`,
      is_block_active,
      active_block: activeBlock
        ? {
            start_at:   activeBlock.start_at,
            end_at:     activeBlock.end_at,
            note_short: activeBlock.note_short,
          }
        : null,
      is_appt_active,
      active_appt: activeAppt
        ? { start_at: activeAppt.start_at, end_at: activeAppt.end_at }
        : null,
      status,
      busy_reason,
      next_appt: nextAppt
        ? { start_at: nextAppt.start_at, client_name: nextAppt.client_name }
        : null,
      upcoming_blocks_48h: upcomingBlocksByBarber.get(b.id) ?? [],
    }
  })

  return NextResponse.json({
    now: nowIso,
    barbers,
  })
}
