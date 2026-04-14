// ---------------------------------------------------------------------------
// POST /api/booking/save-email
//
// Attaches an email address to the client record for a completed booking.
// Called from the post-confirmation screen — customer opts in to save their
// email for faster future booking.
//
// The confirmation_code acts as a session token: the customer just received
// it on screen, so possessing it is sufficient proof of the booking.
//
// Body: { confirmation_code, shop_id, email }
//
// HTTP status:
//   200  { ok: true }
//   400  invalid/missing fields or bad email format
//   404  confirmation code not found
//   500  database error
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_SHOP_ID = process.env.DEFAULT_SHOP_ID ?? ''
const EMAIL_RE        = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const confirmationCode = (body.confirmation_code as string | undefined)?.trim().toUpperCase()
  const email            = (body.email as string | undefined)?.trim().toLowerCase()
  const shopId           = (body.shop_id as string | undefined) ?? DEFAULT_SHOP_ID

  if (!confirmationCode || !email || !shopId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Find the appointment — must have a linked client record
  const { data: apptData } = await admin
    .from('appointments')
    .select('id, client_id')
    .eq('shop_id', shopId)
    .eq('confirmation_code', confirmationCode)
    .not('client_id', 'is', null)
    .maybeSingle()

  if (!apptData) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  type ApptRow = { id: string; client_id: string }
  const { client_id } = apptData as unknown as ApptRow

  const { error: updateErr } = await admin
    .from('clients')
    .update({ email } as any) // TODO: remove `as any` after regenerating types
    .eq('id', client_id)
    .eq('shop_id', shopId)

  if (updateErr) {
    console.error('[POST /api/booking/save-email] update failed:', updateErr)
    return NextResponse.json({ error: 'Could not save email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
