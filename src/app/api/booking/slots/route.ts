// ---------------------------------------------------------------------------
// GET /api/booking/slots
//
// Returns bookable time slots for a single barber on a specific date.
// Public — no auth required.  Uses createAdminClient() for DB reads.
//
// Query params:
//   barber_id        — required
//   date             — required, YYYY-MM-DD in shop timezone
//   service_duration — optional, minutes (default 30)
//   shop_id          — optional, falls back to DEFAULT_SHOP_ID
//
// Cache-Control: public, max-age=30, stale-while-revalidate=60
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'
import { generateBookingSlots } from '@/lib/scheduling/slot-generator'

const DEFAULT_SHOP_ID = process.env.DEFAULT_SHOP_ID ?? ''
const DEFAULT_DURATION = 30

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const barberId       = searchParams.get('barber_id')
  const date           = searchParams.get('date')
  const shopId         = searchParams.get('shop_id') ?? DEFAULT_SHOP_ID
  const durationParam  = searchParams.get('service_duration')
  const duration       = durationParam ? parseInt(durationParam, 10) : DEFAULT_DURATION

  // ── Validate required params ─────────────────────────────────────────────
  if (!barberId) {
    return NextResponse.json({ error: 'barber_id is required' }, { status: 400 })
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 })
  }
  if (isNaN(duration) || duration < 5 || duration > 480) {
    return NextResponse.json({ error: 'service_duration must be between 5 and 480' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Validate barber ──────────────────────────────────────────────────────
  const { data: barberData } = await admin
    .from('users')
    .select('id, acuity_calendar_id')
    .eq('id', barberId)
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)
    .maybeSingle()

  type BarberRow = { id: string; acuity_calendar_id: string | null }
  const barber = barberData as unknown as BarberRow | null

  if (!barber) {
    return NextResponse.json(
      { error: 'Barber not found or inactive' },
      { status: 404 },
    )
  }

  // ── Fetch shop timezone ───────────────────────────────────────────────────
  const { data: shopData } = await admin
    .from('shops')
    .select('timezone')
    .eq('id', shopId)
    .maybeSingle()

  type ShopRow = { timezone: string | null }
  const timezone = (shopData as unknown as ShopRow | null)?.timezone ?? 'America/New_York'

  // ── Generate slots ────────────────────────────────────────────────────────
  // calendarId may be null — slot-generator skips Acuity calls in that case.
  try {
    const provider = new AcuityProvider()
    const result = await generateBookingSlots(admin, provider, {
      barberId: barber.id,
      calendarId: barber.acuity_calendar_id ?? null,
      date,
      shopId,
      duration,
      timezone,
    })

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    })
  } catch (err) {
    console.error('[/api/booking/slots] slot generation failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to generate slots'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
