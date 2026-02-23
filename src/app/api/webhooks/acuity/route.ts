// ---------------------------------------------------------------------------
// POST /api/webhooks/acuity
//
// Receives Acuity Scheduling webhook events, deduplicates them, hydrates the
// appointment from the Acuity API, and upserts into provider_appointments.
//
// TODO: Implement HMAC-SHA256 signature verification per Acuity webhook docs:
// https://developers.acuityscheduling.com/docs/webhooks#verifying-requests
// Verify the X-Acuity-Signature header using ACUITY_WEBHOOK_SECRET env var.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'

/** Same fix as reconcile route: Acuity sometimes returns endTime as "9:00am". */
function parseEndTime(endTime: string, datetime: string): string {
  const direct = new Date(endTime)
  if (!isNaN(direct.getTime())) return direct.toISOString()
  const match = endTime.match(/^(\d{1,2}):(\d{2})(am|pm)$/i)
  if (!match) throw new Error(`Cannot parse Acuity endTime: "${endTime}"`)
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const ampm = match[3].toLowerCase()
  if (ampm === 'pm' && hours !== 12) hours += 12
  if (ampm === 'am' && hours === 12) hours = 0
  const tzMatch = datetime.match(/([+-]\d{4})$/)
  const dateStr = datetime.slice(0, 10)
  const tz = tzMatch ? tzMatch[1] : '+0000'
  const hhMM = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  return new Date(`${dateStr}T${hhMM}:00${tz}`).toISOString()
}

export async function POST(request: NextRequest) {
  // Resolve shop from env — multi-shop routing is out of scope (single-shop MVP)
  const shopId = process.env.DEFAULT_SHOP_ID
  if (!shopId) {
    return NextResponse.json({ error: 'DEFAULT_SHOP_ID not configured' }, { status: 500 })
  }

  // Parse JSON body
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload = body as Record<string, unknown>

  // Acuity webhook payload: { id: number, action: string, calendarID: number, ... }
  const appointmentId = String(payload.id ?? payload.appointmentId ?? '')
  const action = String(payload.action ?? '')

  if (!appointmentId || !action) {
    return NextResponse.json({ error: 'Missing id or action in payload' }, { status: 400 })
  }

  // Composite idempotency key: "<appointment_id>:<action>"
  const providerEventId = `${appointmentId}:${action}`

  const admin = createAdminClient()

  // ---------------------------------------------------------------------------
  // Step 1: Idempotent insert into calendar_webhook_events
  // Unique constraint on (provider, provider_event_id) enforces exactly-once
  // processing. On duplicate (23505), return 200 immediately.
  // ---------------------------------------------------------------------------
  const { data: webhookEventData, error: insertErr } = await admin
    .from('calendar_webhook_events')
    .insert({
      provider: 'acuity',
      provider_event_id: providerEventId,
      payload_json: payload,
      status: 'RECEIVED',
    } as never)
    .select('id')
    .single()

  if (insertErr) {
    // PostgreSQL unique violation code — event already received
    if ((insertErr as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const eventId = (webhookEventData as { id?: string } | null)?.id

  // Helper: mark event as ERROR and return 500 (Acuity retries on non-200)
  const markError = async (msg: string) => {
    if (!eventId) return
    await admin
      .from('calendar_webhook_events')
      .update({
        status: 'ERROR',
        error: msg,
        processed_at: new Date().toISOString(),
      } as never)
      .eq('id', eventId)
  }

  try {
    // -------------------------------------------------------------------------
    // Step 2: Fetch full appointment from Acuity
    // -------------------------------------------------------------------------
    const provider = new AcuityProvider()
    const appointment = await provider.getAppointment(appointmentId)

    // provider_calendar_id always stored as string
    const calendarId = String(appointment.calendarID)

    // -------------------------------------------------------------------------
    // Step 3: Resolve barber_id from calendar_connections
    // -------------------------------------------------------------------------
    const { data: connection } = await admin
      .from('calendar_connections')
      .select('barber_id')
      .eq('shop_id', shopId)
      .eq('provider', 'acuity')
      .eq('provider_calendar_id', calendarId)
      .eq('active', true)
      .maybeSingle()

    if (!connection) {
      // No mapping configured — log and skip; don't blow up the webhook
      await markError(`No active calendar_connection for calendarID=${calendarId}`)
      return NextResponse.json({ ok: true, skipped: 'no_connection' })
    }

    const { barber_id } = connection as unknown as { barber_id: string }

    // -------------------------------------------------------------------------
    // Step 4: Upsert into provider_appointments (UTC timestamps enforced)
    // -------------------------------------------------------------------------
    const status = appointment.canceled ? 'CANCELLED' : 'ACTIVE'

    await admin
      .from('provider_appointments')
      .upsert(
        {
          shop_id: shopId,
          barber_id,
          provider: 'acuity',
          provider_appointment_id: String(appointment.id),
          provider_calendar_id: calendarId,
          kind: 'appointment',
          start_at: new Date(appointment.datetime).toISOString(),
          end_at: parseEndTime(appointment.endTime, appointment.datetime),
          status,
          client_name: [appointment.firstName, appointment.lastName].filter(Boolean).join(' ') || null,
          notes: null,
          last_seen_at: new Date().toISOString(),
          payload_json: appointment as unknown as Record<string, unknown>,
        } as never,
        { onConflict: 'provider,provider_appointment_id' },
      )

    // -------------------------------------------------------------------------
    // Step 5: Stamp last_webhook_at on the calendar connection
    // -------------------------------------------------------------------------
    await admin
      .from('calendar_connections')
      .update({ last_webhook_at: new Date().toISOString() } as never)
      .eq('shop_id', shopId)
      .eq('provider', 'acuity')
      .eq('provider_calendar_id', calendarId)

    // -------------------------------------------------------------------------
    // Step 6: Mark webhook event as PROCESSED
    // -------------------------------------------------------------------------
    if (eventId) {
      await admin
        .from('calendar_webhook_events')
        .update({
          status: 'PROCESSED',
          processed_at: new Date().toISOString(),
        } as never)
        .eq('id', eventId)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await markError(message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
