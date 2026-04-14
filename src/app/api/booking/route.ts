// ---------------------------------------------------------------------------
// POST /api/booking
//
// Creates a new appointment booking.  Public — no auth required.
//
// Required body: barber_id, start_time, end_time, first_name, last_initial, phone
// Optional body: service_type, notes, shop_id
//
// Phone normalization:
//   10-digit US → stored as-is (clients table uses 10-digit)
//   +1XXXXXXXXXX (E.164) → strip +1 → 10-digit
//   Other E.164 → pass through
//
// HTTP status map:
//   SLOT_TAKEN         → 409
//   BARBER_UNAVAILABLE → 422
//   INVALID_SLOT       → 422
//   DB_ERROR           → 500
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createBooking } from '@/lib/scheduling/booking-creation'

const DEFAULT_SHOP_ID = process.env.DEFAULT_SHOP_ID ?? ''

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // +1XXXXXXXXXX or 1XXXXXXXXXX → strip country code
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1)
  // Already E.164 format with non-US country code — pass through
  if (raw.startsWith('+') && digits.length > 10) return raw
  return digits
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    barber_id,
    start_time,
    end_time,
    first_name,
    last_initial,
    phone,
    service_type,
    notes,
    shop_id,
  } = body as Record<string, string | undefined>

  // ── Validate required fields ──────────────────────────────────────────────
  const missing = ['barber_id', 'start_time', 'end_time', 'first_name', 'last_initial', 'phone']
    .filter((k) => !body[k])
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 },
    )
  }

  if (!first_name || !last_initial || !phone || !barber_id || !start_time || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!/^[a-zA-Z]$/.test(last_initial)) {
    return NextResponse.json({ error: 'last_initial must be a single letter' }, { status: 400 })
  }

  const normalizedPhone = normalizePhone(phone)
  const resolvedShopId  = shop_id ?? DEFAULT_SHOP_ID

  console.log('[POST /api/booking] payload', {
    barber_id,
    start_time,
    end_time,
    shop_id_in_body: shop_id,
    resolved_shop_id: resolvedShopId,
    has_phone: !!normalizedPhone,
  })

  const result = await createBooking({
    shopId: resolvedShopId,
    barberId: barber_id,
    startTime: start_time,
    endTime: end_time,
    firstName: first_name,
    lastInitial: last_initial,
    phone: normalizedPhone,
    serviceType: service_type,
    notes,
  })

  if (!result.ok) {
    console.error('[POST /api/booking] createBooking failed:', result.code, result.message)
    const statusMap: Record<string, number> = {
      SLOT_TAKEN: 409,
      BARBER_UNAVAILABLE: 422,
      INVALID_SLOT: 422,
      DB_ERROR: 500,
    }
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: statusMap[result.code] ?? 500 },
    )
  }

  return NextResponse.json(
    {
      appointment_id: result.appointmentId,
      confirmation_code: result.confirmationCode,
      barber_id: result.barberId,
      barber_name: result.barberName,
      start_time: result.startTime,
      end_time: result.endTime,
      service_type: result.serviceType,
    },
    { status: 201 },
  )
}
