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

// ---------------------------------------------------------------------------
// Simple structured logger — always writes to stdout so logs appear in
// Vercel / Railway / local Next.js output.
// ---------------------------------------------------------------------------
function log(level: 'INFO' | 'WARN' | 'ERROR', event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data })
  if (level === 'ERROR') {
    console.error(line)
  } else {
    console.log(line)
  }
}

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

// ---------------------------------------------------------------------------
// GET — health check so you can verify the route is reachable in a browser
// ---------------------------------------------------------------------------
export async function GET() {
  return NextResponse.json({ ok: true, route: 'POST /api/webhooks/acuity' })
}

// ---------------------------------------------------------------------------
// POST — main webhook handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // ── Request-level log ─────────────────────────────────────────────────────
  const rawBody = await request.text()
  log('INFO', 'webhook_received', {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent') ?? undefined,
    contentType: request.headers.get('content-type') ?? undefined,
    bodyLength: rawBody.length,
  })

  // Resolve shop from env — multi-shop routing is out of scope (single-shop MVP)
  const shopId = process.env.DEFAULT_SHOP_ID
  if (!shopId) {
    log('ERROR', 'missing_shop_id')
    return NextResponse.json({ error: 'DEFAULT_SHOP_ID not configured' }, { status: 500 })
  }

  // Parse JSON body
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    log('ERROR', 'invalid_json', { bodyLength: rawBody.length })
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    log('ERROR', 'non_object_body')
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload = body as Record<string, unknown>

  // Acuity webhook payload: { id: number, action: string, calendarID: number, ... }
  const appointmentId = String(payload.id ?? payload.appointmentId ?? '')
  const action = String(payload.action ?? '')

  log('INFO', 'webhook_parsed', { action, appointmentId })

  if (!appointmentId || !action) {
    log('ERROR', 'missing_fields', { appointmentId, action })
    // Return 200 so Acuity doesn't retry a malformed payload
    return NextResponse.json({ ok: true, skipped: 'missing_fields' })
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
    if ((insertErr as { code?: string }).code === '23505') {
      log('INFO', 'duplicate_event', { providerEventId })
      return NextResponse.json({ ok: true, duplicate: true })
    }
    log('ERROR', 'webhook_event_insert_failed', { error: insertErr.message })
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const eventId = (webhookEventData as { id?: string } | null)?.id

  // Helper: mark event as ERROR — always return 200 so Acuity doesn't loop-retry
  const markError = async (msg: string) => {
    log('ERROR', 'webhook_processing_error', { eventId, error: msg })
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

    const clientName = [appointment.firstName, appointment.lastName].filter(Boolean).join(' ') || null
    const startAt = new Date(appointment.datetime).toISOString()
    const endAt = parseEndTime(appointment.endTime, appointment.datetime)
    const calendarId = String(appointment.calendarID)

    log('INFO', 'appointment_fetched', {
      appointmentId,
      startAt,
      endAt,
      clientName,
      calendarId,
    })

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
      await markError(`No active calendar_connection for calendarID=${calendarId}`)
      return NextResponse.json({ ok: true, skipped: 'no_connection' })
    }

    const { barber_id } = connection as unknown as { barber_id: string }

    // -------------------------------------------------------------------------
    // Step 4: Upsert into provider_appointments (UTC timestamps enforced)
    // -------------------------------------------------------------------------
    const status = appointment.canceled ? 'CANCELLED' : 'ACTIVE'

    const { data: upsertData } = await admin
      .from('provider_appointments')
      .upsert(
        {
          shop_id: shopId,
          barber_id,
          provider: 'acuity',
          provider_appointment_id: String(appointment.id),
          provider_calendar_id: calendarId,
          kind: 'appointment',
          start_at: startAt,
          end_at: endAt,
          status,
          client_name: clientName,
          notes: null,
          last_seen_at: new Date().toISOString(),
          payload_json: appointment as unknown as Record<string, unknown>,
        } as never,
        { onConflict: 'provider,provider_appointment_id' },
      )
      .select('id, updated_at')
      .single()

    const row = upsertData as { id?: string; updated_at?: string } | null
    log('INFO', 'upsert_complete', {
      rowId: row?.id,
      updatedAt: row?.updated_at,
      status,
      barberId: barber_id,
    })

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

    log('INFO', 'webhook_processed', { providerEventId, rowId: row?.id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await markError(message)
    // Always 200 — Acuity retries on non-200, which would flood the log
    return NextResponse.json({ ok: true, error: message })
  }
}
