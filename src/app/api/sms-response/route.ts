// ---------------------------------------------------------------------------
// POST /api/sms-response
//
// Twilio webhook — receives inbound SMS replies from barbers (YES / NO).
// Configure this URL in your Twilio console under the phone number's
// "A MESSAGE COMES IN" webhook: https://your-domain.com/api/sms-response
//
// Twilio posts application/x-www-form-urlencoded with fields including:
//   From — barber's E.164 phone number (e.g. +15551234567)
//   Body — the message text
//
// Security: TODO — add X-Twilio-Signature validation for production hardening.
//   Set TWILIO_VALIDATE_WEBHOOKS=true and use twilio.validateRequest() with the
//   auth token and the exact webhook URL registered in Twilio.
//   See: https://www.twilio.com/docs/usage/security#validating-signatures
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  handleOfferAccepted,
  handleOfferDeclined,
} from '@/lib/walkin/walkin_offer'
import { normalizePhone, HELP_MESSAGE } from '@/lib/sms/twilio'

export async function POST(request: NextRequest) {
  // Twilio sends application/x-www-form-urlencoded
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const from = formData.get('From') as string | null
  const rawBody = (formData.get('Body') as string | null) ?? ''
  const intent = rawBody.trim().toUpperCase()

  if (!from) {
    return twimlResponse('')
  }

  const normalizedFrom = normalizePhone(from)
  if (!normalizedFrom) {
    return twimlResponse('')
  }

  const admin = createAdminClient()

  // -------------------------------------------------------------------------
  // 1. Find barber by phone number
  //    Load all active barbers and match on last-10-digits comparison.
  //    (Avoids column-function indexes that would be needed for a DB-level regex.)
  // -------------------------------------------------------------------------
  const { data: users } = await admin
    .from('users')
    .select('id, shop_id, phone, first_name')
    .eq('role', 'barber')
    .eq('is_active', true)
    .not('phone', 'is', null)

  type UserRow = { id: string; shop_id: string | null; phone: string; first_name: string }
  const allBarbers = (users ?? []) as unknown as UserRow[]

  const barber = allBarbers.find((u) => {
    const norm = normalizePhone(u.phone)
    return norm !== null && norm === normalizedFrom
  })

  if (!barber || !barber.shop_id) {
    // Unknown number — ignore silently (no TwiML reply)
    return twimlResponse('')
  }

  // -------------------------------------------------------------------------
  // 2. Find the latest PENDING offer for this barber
  // -------------------------------------------------------------------------
  const { data: attemptData } = await admin
    .from('walkin_assignment_attempts')
    .select('id, walkin_id, expires_at')
    .eq('barber_id', barber.id)
    .eq('shop_id', barber.shop_id)
    .eq('status', 'pending')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  type AttemptLookup = { id: string; walkin_id: string; expires_at: string }
  const attempt = attemptData as unknown as AttemptLookup | null

  if (!attempt) {
    return twimlResponse('No active walk-in offer for you right now.')
  }

  // Check expiry — the timeout job may not have run yet
  if (new Date(attempt.expires_at) < new Date()) {
    return twimlResponse(
      'That offer has expired. You\u2019ll receive a new offer if another walk-in becomes available.',
    )
  }

  // -------------------------------------------------------------------------
  // 3. Process YES / NO
  // -------------------------------------------------------------------------
  if (intent === 'YES') {
    const result = await handleOfferAccepted(
      admin,
      barber.shop_id,
      barber.id,
      attempt.id,
      attempt.walkin_id,
    )

    if (result.accepted) {
      return twimlResponse(
        `Walk-in accepted! The customer is being called to your chair.`,
      )
    } else {
      return twimlResponse(
        'This walk-in was already claimed by another barber. Sit tight \u2014 you\u2019ll get the next one.',
      )
    }
  }

  if (intent === 'NO') {
    await handleOfferDeclined(
      admin,
      barber.shop_id,
      barber.id,
      attempt.id,
      attempt.walkin_id,
    )
    return twimlResponse('Got it. Moving to the next available barber.')
  }

  // Unknown reply
  return twimlResponse(HELP_MESSAGE)
}

// ---------------------------------------------------------------------------
// TwiML helpers
// ---------------------------------------------------------------------------

function twimlResponse(message: string): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
