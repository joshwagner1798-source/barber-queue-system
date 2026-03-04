// ---------------------------------------------------------------------------
// Twilio SMS client
//
// Required environment variables:
//   TWILIO_ACCOUNT_SID   — Twilio account SID (ACxxx...)
//   TWILIO_AUTH_TOKEN    — Twilio auth token
//   TWILIO_PHONE_NUMBER  — Your Twilio SMS-capable number (E.164, e.g. +15551234567)
//
// Optional:
//   TWILIO_VALIDATE_WEBHOOKS — set to "true" to enforce X-Twilio-Signature validation
//     in /api/sms-response (recommended in production)
// ---------------------------------------------------------------------------

import twilio from 'twilio'

// ---------------------------------------------------------------------------
// Client factory — lazy so missing env vars only throw at call time
// ---------------------------------------------------------------------------

function getClient(): ReturnType<typeof twilio> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars must be set')
  }
  return twilio(sid, token)
}

// ---------------------------------------------------------------------------
// SMS sending
// ---------------------------------------------------------------------------

/**
 * Send an SMS via Twilio. Returns the message SID.
 * Throws on network error or Twilio error response.
 */
export async function sendSms(to: string, body: string): Promise<string> {
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!from) {
    throw new Error('TWILIO_PHONE_NUMBER env var must be set')
  }
  const client = getClient()
  const message = await client.messages.create({ body, from, to })
  return message.sid
}

// ---------------------------------------------------------------------------
// Canned messages
// ---------------------------------------------------------------------------

export const OFFER_MESSAGE =
  'New walk-in ready! Reply YES to accept or NO to skip. Offer expires in 90 seconds.'

export const HELP_MESSAGE =
  'Reply YES to accept or NO to skip the current walk-in offer.'

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------

/**
 * Strip all non-digit characters and return the last 10 digits.
 * Used to compare an E.164 Twilio `From` number against a stored phone field
 * that might be formatted differently (e.g. "555-123-4567" vs "+15551234567").
 *
 * Returns null if the result is not exactly 10 digits.
 */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  // Strip leading country code 1 if 11 digits
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1)
  if (digits.length === 10) return digits
  return null
}

/**
 * Convert a 10-digit US number to E.164 format (+1XXXXXXXXXX).
 * Returns the input unchanged if it already starts with '+'.
 */
export function toE164(phone: string): string {
  if (phone.startsWith('+')) return phone
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return phone // fallback — pass through
}
