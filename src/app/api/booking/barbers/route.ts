// ---------------------------------------------------------------------------
// GET /api/booking/barbers
//
// Returns bookable barbers for the booking flow.
// Public — no auth required.  Uses createAdminClient().
//
// Query params:
//   date             — optional YYYY-MM-DD; if present, include first_available
//                      and total_available_slots per barber
//   service_duration — optional minutes (default 30)
//   shop_id          — optional, falls back to DEFAULT_SHOP_ID
//
// Photo URL: taken from users.avatar_url (set by /api/barber-photos)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'
import { generateBookingSlots } from '@/lib/scheduling/slot-generator'

const DEFAULT_SHOP_ID = process.env.DEFAULT_SHOP_ID ?? ''
const DEFAULT_DURATION = 30

export interface BookingBarber {
  id: string
  first_name: string
  last_name: string
  bio: string | null
  photo_url: string | null
  has_calendar: boolean
  // Only present when date query param is provided
  first_available?: string | null  // ISO UTC of first available slot
  total_available_slots?: number
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const date           = searchParams.get('date')
  const shopId         = searchParams.get('shop_id') ?? DEFAULT_SHOP_ID
  const durationParam  = searchParams.get('service_duration')
  const duration       = durationParam ? parseInt(durationParam, 10) : DEFAULT_DURATION

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Fetch active barbers ──────────────────────────────────────────────────
  const { data: barbersData, error: barbersErr } = await admin
    .from('users')
    .select('id, first_name, last_name, bio, avatar_url, acuity_calendar_id')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (barbersErr) {
    console.error('[/api/booking/barbers] DB query failed:', barbersErr)
    return NextResponse.json({ error: barbersErr.message }, { status: 500 })
  }

  type BarberRow = {
    id: string
    first_name: string
    last_name: string
    bio: string | null
    avatar_url: string | null
    acuity_calendar_id: string | null
  }
  const barbers = (barbersData ?? []) as unknown as BarberRow[]

  // ── If no date, return basic barber list ─────────────────────────────────
  if (!date) {
    const result: BookingBarber[] = barbers.map((b) => ({
      id: b.id,
      first_name: b.first_name,
      last_name: b.last_name,
      bio: b.bio,
      photo_url: b.avatar_url,
      has_calendar: !!b.acuity_calendar_id,
    }))
    return NextResponse.json(result)
  }

  // ── With date: augment with slot data ────────────────────────────────────
  const { data: shopData } = await admin
    .from('shops')
    .select('timezone')
    .eq('id', shopId)
    .maybeSingle()

  type ShopRow = { timezone: string | null }
  const timezone = (shopData as unknown as ShopRow | null)?.timezone ?? 'America/New_York'

  const provider = new AcuityProvider()

  const result: BookingBarber[] = await Promise.all(
    barbers.map(async (b): Promise<BookingBarber> => {
      const base: BookingBarber = {
        id: b.id,
        first_name: b.first_name,
        last_name: b.last_name,
        bio: b.bio,
        photo_url: b.avatar_url,
        has_calendar: !!b.acuity_calendar_id,
        first_available: null,
        total_available_slots: 0,
      }

      try {
        // calendarId may be null — slot-generator skips Acuity when absent
        const slots = await generateBookingSlots(admin, provider, {
          barberId: b.id,
          calendarId: b.acuity_calendar_id ?? null,
          date,
          shopId,
          duration,
          timezone,
        })

        const available = slots.slots.filter((s) => s.status === 'AVAILABLE')
        base.first_available = available[0]?.start ?? null
        base.total_available_slots = available.length
      } catch (err) {
        console.error(`[/api/booking/barbers] slot generation failed for barber ${b.id}:`, err)
        // Degrade gracefully — return barber without slot data
        base.first_available = null
        base.total_available_slots = 0
      }

      return base
    }),
  )

  return NextResponse.json(result)
}
