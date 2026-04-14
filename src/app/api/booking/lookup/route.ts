// ---------------------------------------------------------------------------
// GET /api/booking/lookup
//
// Lightweight returning-customer lookup by phone number.
// Returns first_name + last_initial if a matching client record exists.
// Public — intentionally returns only display-safe fields (no PII beyond
// what the customer entered when booking).
//
// Query params:
//   phone    — required, digits only (10-digit US or 11-digit with leading 1)
//   shop_id  — optional, falls back to DEFAULT_SHOP_ID
//
// Response:
//   { found: false }
//   { found: true, first_name: string, last_initial: string }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_SHOP_ID = process.env.DEFAULT_SHOP_ID ?? ''

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const rawPhone = searchParams.get('phone') ?? ''
  const shopId   = searchParams.get('shop_id') ?? DEFAULT_SHOP_ID

  const digits = rawPhone.replace(/\D/g, '')

  // Normalize: strip +1 / 1 prefix for US numbers
  const phone = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits

  if (phone.length < 10 || !shopId) {
    return NextResponse.json({ found: false })
  }

  const admin = createAdminClient()

  const { data } = await admin
    .from('clients')
    .select('first_name, last_initial')
    .eq('shop_id', shopId)
    .eq('phone', phone)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ found: false })
  }

  type ClientRow = { first_name: string; last_initial: string }
  const client = data as unknown as ClientRow

  return NextResponse.json({
    found:        true,
    first_name:   client.first_name,
    last_initial: client.last_initial,
  })
}
