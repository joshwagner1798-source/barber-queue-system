// ---------------------------------------------------------------------------
// GET /api/jobs/reconcile-acuity?shop_id=<uuid>
//
// Full-window reconcile: pulls all appointments from Acuity for the
// [-7 days, +30 days] window, upserts them into provider_appointments, then
// marks rows that weren't returned by Acuity as DELETED (drift repair).
//
// Auth: requires  Authorization: Bearer <RECONCILE_SECRET>
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'
import { fetchBlocks } from '@/lib/calendar/acuity-client'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Acuity sometimes returns endTime as a 12-hour time string ("9:00am")
 * instead of a full ISO timestamp. When that happens, reconstruct a full
 * datetime by combining the date + timezone offset from `datetime` with the
 * parsed hours/minutes from `endTime`.
 */
function parseEndTime(endTime: string, datetime: string): string {
  const direct = new Date(endTime)
  if (!isNaN(direct.getTime())) return direct.toISOString()

  // Parse "h:mmam" / "h:mmpm"
  const match = endTime.match(/^(\d{1,2}):(\d{2})(am|pm)$/i)
  if (!match) throw new Error(`Cannot parse Acuity endTime: "${endTime}"`)

  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const ampm = match[3].toLowerCase()
  if (ampm === 'pm' && hours !== 12) hours += 12
  if (ampm === 'am' && hours === 12) hours = 0

  // Extract date (YYYY-MM-DD) and tz offset (+HHMM / -HHMM) from datetime
  const tzMatch = datetime.match(/([+-]\d{4})$/)
  const dateStr = datetime.slice(0, 10)
  const tz = tzMatch ? tzMatch[1] : '+0000'
  const hhMM = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  return new Date(`${dateStr}T${hhMM}:00${tz}`).toISOString()
}

export async function GET(request: NextRequest) {
  // ---------------------------------------------------------------------------
  // Auth: Bearer RECONCILE_SECRET
  // ---------------------------------------------------------------------------
  const auth = request.headers.get('authorization')
  const secret = process.env.RECONCILE_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shopId =
    request.nextUrl.searchParams.get('shop_id') ?? process.env.DEFAULT_SHOP_ID

  if (!shopId) {
    return NextResponse.json(
      { error: 'shop_id query param required (or set DEFAULT_SHOP_ID)' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const provider = new AcuityProvider()

  // ---------------------------------------------------------------------------
  // Reconcile window: -7 days → +30 days (UTC)
  // ---------------------------------------------------------------------------
  const reconcileStartedAt = new Date()
  const windowStart = new Date(reconcileStartedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(reconcileStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000)

  // ---------------------------------------------------------------------------
  // Step 1: Fetch active calendar connections for this shop
  // ---------------------------------------------------------------------------
  const { data: connections, error: connErr } = await admin
    .from('calendar_connections')
    .select('id, barber_id, provider_calendar_id')
    .eq('shop_id', shopId)
    .eq('provider', 'acuity')
    .eq('active', true)

  if (connErr) {
    return NextResponse.json({ error: connErr.message }, { status: 500 })
  }

  const results: Array<{
    calendarId: string
    upserted: number
    error?: string
  }> = []

  // ---------------------------------------------------------------------------
  // Step 2: For each connection, list appointments and upsert
  // ---------------------------------------------------------------------------
  for (const conn of (connections as unknown as { id: string; barber_id: string; provider_calendar_id: string }[]) ?? []) {
    try {
      const appointments = await provider.listAppointments({
        calendarID: conn.provider_calendar_id,
        minDate: toDateStr(windowStart),
        maxDate: toDateStr(windowEnd),
      })

      const apptRows = appointments.map((a) => ({
        shop_id: shopId,
        barber_id: conn.barber_id,
        provider: 'acuity',
        provider_appointment_id: String(a.id),
        // provider_calendar_id always stored as string
        provider_calendar_id: String(a.calendarID),
        kind: 'appointment',
        start_at: new Date(a.datetime).toISOString(),
        end_at: parseEndTime(a.endTime, a.datetime),
        status: a.canceled ? 'CANCELLED' : 'ACTIVE',
        client_name: [a.firstName, a.lastName].filter(Boolean).join(' ') || null,
        notes: null,
        // Stamp with reconcileStartedAt so drift repair can identify stale rows
        last_seen_at: reconcileStartedAt.toISOString(),
        payload_json: a as unknown as Record<string, unknown>,
      }))

      if (apptRows.length > 0) {
        const { error: upsertErr } = await admin
          .from('provider_appointments')
          .upsert(apptRows as never, { onConflict: 'provider,provider_appointment_id' })

        if (upsertErr) throw new Error(upsertErr.message)
      }

      // Fetch and upsert blocked times for this calendar
      const blocks = await fetchBlocks(
        Number(conn.provider_calendar_id),
        toDateStr(windowStart),
        toDateStr(windowEnd),
      )

      const blockRows = blocks.map((b) => ({
        shop_id: shopId,
        barber_id: conn.barber_id,
        provider: 'acuity',
        provider_appointment_id: `block_${b.id}`,
        provider_calendar_id: conn.provider_calendar_id,
        kind: 'blocked',
        start_at: new Date(b.start).toISOString(),
        end_at: new Date(b.end).toISOString(),
        status: 'ACTIVE',
        client_name: null,
        notes: b.notes ?? null,
        last_seen_at: reconcileStartedAt.toISOString(),
        payload_json: b as unknown as Record<string, unknown>,
      }))

      if (blockRows.length > 0) {
        const { error: blockUpsertErr } = await admin
          .from('provider_appointments')
          .upsert(blockRows as never, { onConflict: 'provider,provider_appointment_id' })

        if (blockUpsertErr) throw new Error(blockUpsertErr.message)
      }

      // Update connection health
      await admin
        .from('calendar_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_health: 'OK',
        } as never)
        .eq('id', conn.id)

      results.push({ calendarId: conn.provider_calendar_id, upserted: apptRows.length + blockRows.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await admin
        .from('calendar_connections')
        .update({ sync_health: `ERROR: ${message.slice(0, 200)}` } as never)
        .eq('id', conn.id)
      results.push({ calendarId: conn.provider_calendar_id, upserted: 0, error: message })
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: Drift repair
  // Any provider_appointment in the window whose last_seen_at is older than
  // reconcileStartedAt was not returned by Acuity → mark as DELETED.
  //
  // Equivalent SQL:
  //   UPDATE provider_appointments
  //   SET status = 'DELETED', updated_at = now()
  //   WHERE shop_id = $1
  //     AND provider = 'acuity'
  //     AND start_at >= $windowStart
  //     AND start_at < $windowEnd
  //     AND last_seen_at < $reconcileStartedAt;
  // ---------------------------------------------------------------------------
  const { error: driftErr } = await admin
    .from('provider_appointments')
    .update({ status: 'DELETED', updated_at: new Date().toISOString() } as never)
    .eq('shop_id', shopId)
    .eq('provider', 'acuity')
    .gte('start_at', windowStart.toISOString())
    .lt('start_at', windowEnd.toISOString())
    .lt('last_seen_at', reconcileStartedAt.toISOString())

  if (driftErr) {
    return NextResponse.json(
      { error: `Drift repair failed: ${driftErr.message}`, results },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    reconcileStartedAt: reconcileStartedAt.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    connections: (connections as unknown[])?.length ?? 0,
    results,
  })
}
