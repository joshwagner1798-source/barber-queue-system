// ---------------------------------------------------------------------------
// GET /api/debug/acuity-blocks?minDate=YYYY-MM-DD&maxDate=YYYY-MM-DD
//
// Returns blocks per calendar from Acuity directly (no DB).
// No auth — internal debug tool only.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'

const BARBERS_SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const now = new Date()
  const minDate = searchParams.get('minDate') ?? now.toISOString().slice(0, 10)
  const maxDate = searchParams.get('maxDate') ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const admin = createAdminClient()
  const provider = new AcuityProvider()

  type ConnRow = { barber_id: string; provider_calendar_id: string }
  type BarberRow = { id: string; first_name: string; last_name: string }

  const [connsResult, barbersResult] = await Promise.all([
    admin
      .from('calendar_connections')
      .select('barber_id, provider_calendar_id')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('provider', 'acuity')
      .eq('active', true),
    admin
      .from('users')
      .select('id, first_name, last_name')
      .eq('shop_id', BARBERS_SHOP_ID)
      .eq('role', 'barber'),
  ])

  const barberMap = new Map<string, string>(
    ((barbersResult.data ?? []) as unknown as BarberRow[]).map((b) => [
      b.id,
      `${b.first_name} ${b.last_name}`,
    ]),
  )

  const calendars = []
  for (const conn of (connsResult.data ?? []) as unknown as ConnRow[]) {
    try {
      const blocks = await provider.listBlocks({
        calendarID: conn.provider_calendar_id,
        minDate,
        maxDate,
      })
      calendars.push({
        calendarID: conn.provider_calendar_id,
        barberName: barberMap.get(conn.barber_id) ?? conn.barber_id,
        count: blocks.length,
        first5: blocks.slice(0, 5).map((b) => ({
          id: b.id,
          start: b.start,
          end: b.end,
          notes: b.notes,
        })),
      })
    } catch (err) {
      calendars.push({
        calendarID: conn.provider_calendar_id,
        barberName: barberMap.get(conn.barber_id) ?? conn.barber_id,
        count: 0,
        first5: [],
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ minDate, maxDate, calendars })
}
