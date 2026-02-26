// ---------------------------------------------------------------------------
// GET /api/jobs/reconcile-acuity?shop_id=<uuid>
//
// Full-window reconcile: pulls all appointments from Acuity for the
// [-7 days, +30 days] window, upserts them into provider_appointments, then
// marks rows that weren't returned by Acuity as DELETED (drift repair).
//
// Blocks use a tighter window: [-1 day, +14 days] per spec.
//
// Auth: requires  Authorization: Bearer <RECONCILE_SECRET>
//              or Authorization: Bearer <CRON_SECRET>  (Vercel cron)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'

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

/** Clean and truncate a block note to 40 chars for display. Always returns a string. */
function blockNoteShort(notes: string | null | undefined): string {
  if (!notes) return 'Blocked'
  const clean = notes.replace(/\n/g, ' ').trim()
  if (!clean) return 'Blocked'
  return clean.length <= 40 ? clean : clean.slice(0, 40).trimEnd() + '…'
}

/** Strip newlines/trim for storage; returns null if empty. */
function cleanNote(raw: string | null | undefined): string | null {
  if (!raw) return null
  const clean = raw.replace(/\n/g, ' ').trim()
  return clean || null
}

export async function GET(request: NextRequest) {
  // ---------------------------------------------------------------------------
  // Auth: Bearer RECONCILE_SECRET  (manual calls)
  //    or Bearer CRON_SECRET       (Vercel cron — auto-injected by platform)
  // ---------------------------------------------------------------------------
  const auth = request.headers.get('authorization')
  const reconcileSecret = process.env.RECONCILE_SECRET
  const cronSecret = process.env.CRON_SECRET
  const validTokens = [reconcileSecret, cronSecret].filter(Boolean)
  if (validTokens.length === 0 || !validTokens.some((t) => auth === `Bearer ${t}`)) {
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

  // Today in NY (YYYY-MM-DD) — used for availability checks
  const todayNy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

  // ---------------------------------------------------------------------------
  // Windows
  // Appointments: -7 days → +30 days
  // Blocks:       -1 day  → +14 days
  // ---------------------------------------------------------------------------
  const reconcileStartedAt = new Date()
  const windowStart   = new Date(reconcileStartedAt.getTime() -  7 * 24 * 60 * 60 * 1000)
  const windowEnd     = new Date(reconcileStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
  const blockWinStart = new Date(reconcileStartedAt.getTime() -  1 * 24 * 60 * 60 * 1000)
  const blockWinEnd   = new Date(reconcileStartedAt.getTime() + 14 * 24 * 60 * 60 * 1000)

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

  // ---------------------------------------------------------------------------
  // Step 1b: Fetch appointment types once; build calendarID → appointmentTypeID map
  // ---------------------------------------------------------------------------
  let apptTypeByCalendar = new Map<number, number>()
  try {
    const apptTypes = await provider.listAppointmentTypes()
    for (const t of apptTypes) {
      if (!t.active) continue
      for (const calId of t.calendarIDs) {
        if (!apptTypeByCalendar.has(calId)) apptTypeByCalendar.set(calId, t.id)
      }
    }
    console.log(`[AVAIL] Loaded ${apptTypes.length} appointment types, covering ${apptTypeByCalendar.size} calendars`)
  } catch (err) {
    console.error(`[AVAIL] Failed to load appointment types: ${err instanceof Error ? err.message : err}`)
    apptTypeByCalendar = new Map()
  }

  // Pre-fetch barber names for debug logging
  type BarberNameRow = { id: string; first_name: string; last_name: string }
  const { data: barberNameRows } = await admin
    .from('users')
    .select('id, first_name, last_name')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
  const barberNameMap = new Map<string, string>(
    ((barberNameRows ?? []) as unknown as BarberNameRow[]).map((b) => [
      b.id,
      `${b.first_name} ${b.last_name}`,
    ]),
  )

  const results: Array<{
    calendarId: string
    appts: number
    blocks: number
    error?: string
  }> = []

  // ---------------------------------------------------------------------------
  // Step 2: For each connection, sync appointments then blocks
  // ---------------------------------------------------------------------------
  for (const conn of (connections as unknown as { id: string; barber_id: string; provider_calendar_id: string }[]) ?? []) {
    const barberName = barberNameMap.get(conn.barber_id) ?? conn.barber_id

    try {
      // ── Appointments ───────────────────────────────────────────────────────
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
        provider_calendar_id: String(a.calendarID),
        kind: 'appointment',
        start_at: new Date(a.datetime).toISOString(),
        end_at: parseEndTime(a.endTime, a.datetime),
        status: a.canceled ? 'CANCELLED' : 'ACTIVE',
        client_name: [a.firstName, a.lastName].filter(Boolean).join(' ') || null,
        notes: null,
        last_seen_at: reconcileStartedAt.toISOString(),
        payload_json: a as unknown as Record<string, unknown>,
      }))

      if (apptRows.length > 0) {
        const { error: upsertErr } = await admin
          .from('provider_appointments')
          .upsert(apptRows as never, { onConflict: 'provider,provider_appointment_id' })

        if (upsertErr) throw new Error(upsertErr.message)
      }

      // ── Blocks ─────────────────────────────────────────────────────────────
      console.log(
        `[BLOCKS] Calendar ${conn.provider_calendar_id} → barber="${barberName}" (${conn.barber_id})` +
        ` | window ${toDateStr(blockWinStart)} → ${toDateStr(blockWinEnd)}`,
      )

      const blocks = await provider.listBlocks({
        calendarID: conn.provider_calendar_id,
        minDate: toDateStr(blockWinStart),
        maxDate: toDateStr(blockWinEnd),
      })

      console.log(`[BLOCKS] Fetched: ${blocks.length} blocks for "${barberName}" (calendar ${conn.provider_calendar_id})`)

      for (const b of blocks) {
        const parsedStart = new Date(b.start).toISOString()
        const parsedEnd   = new Date(b.end).toISOString()
        console.log(
          `[BLOCK]  id=${b.id} calendarID=${b.calendarID}` +
          ` | raw start="${b.start}" → parsed start_at="${parsedStart}"` +
          ` | raw end="${b.end}"   → parsed end_at="${parsedEnd}"` +
          ` | notes="${b.notes ?? ''}"`,
        )
      }

      // Write to provider_blocks (primary source for TV BLOCKED status)
      const pbRows = blocks.map((b) => ({
        provider: 'acuity',
        provider_block_id: String(b.id),
        calendar_id: conn.provider_calendar_id,
        barber_id: conn.barber_id,
        shop_id: shopId,
        start_at: new Date(b.start).toISOString(),
        end_at: new Date(b.end).toISOString(),
        note: cleanNote(b.notes ?? null),
        note_short: blockNoteShort(b.notes ?? null),
        payload_json: b as unknown as Record<string, unknown>,
        last_seen_at: reconcileStartedAt.toISOString(),
      }))

      if (pbRows.length > 0) {
        const { error: pbErr } = await admin
          .from('provider_blocks')
          .upsert(pbRows as never, { onConflict: 'provider,provider_block_id' })

        if (pbErr) throw new Error(`provider_blocks upsert: ${pbErr.message}`)
      }

      console.log(`[BLOCKS] Saved: ${pbRows.length} blocks for "${barberName}"`)

      // Also write to provider_appointments.kind='blocked' (backward compat)
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
        notes: cleanNote(b.notes ?? null),
        last_seen_at: reconcileStartedAt.toISOString(),
        payload_json: b as unknown as Record<string, unknown>,
      }))

      if (blockRows.length > 0) {
        const { error: blockUpsertErr } = await admin
          .from('provider_appointments')
          .upsert(blockRows as never, { onConflict: 'provider,provider_appointment_id' })

        if (blockUpsertErr) throw new Error(`provider_appointments blocks upsert: ${blockUpsertErr.message}`)
      }

      // ── Availability: compute off_until_at ───────────────────────────────
      const apptTypeId = apptTypeByCalendar.get(Number(conn.provider_calendar_id))
      let offUntilAt: string | null = null
      if (apptTypeId) {
        try {
          offUntilAt = await provider.getNextAvailableTime({
            calendarID: conn.provider_calendar_id,
            appointmentTypeID: String(apptTypeId),
            todayNy,
          })
          console.log(`[AVAIL] ${barberName}: availability API → off_until_at=${offUntilAt ?? 'working today (open slots)'}`)
        } catch (err) {
          console.error(`[AVAIL] ${barberName}: getNextAvailableTime failed: ${err instanceof Error ? err.message : err}`)
        }
      } else {
        console.log(`[AVAIL] ${barberName}: no appointment type found for calendar ${conn.provider_calendar_id}`)
      }

      // Cross-check: the availability API only shows open booking slots, not existing appointments.
      // If a barber is fully booked on a day, the API skips it — but they ARE physically working.
      // Use the first existing (non-cancelled) appointment to correct the off_until_at.
      if (offUntilAt !== null) {
        const nyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
        const firstFutureAppt = appointments
          .filter((a) => !a.canceled && !a.noShow)
          .map((a) => ({ date: nyFmt.format(new Date(a.datetime)), dt: new Date(a.datetime) }))
          .filter(({ date }) => date >= todayNy)
          .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0]

        if (firstFutureAppt) {
          const offUntilDate = new Date(offUntilAt)
          if (firstFutureAppt.dt < offUntilDate) {
            // The barber's earliest appointment starts before the first open booking slot.
            // Compare by datetime (not just date) — an appointment tonight at 5:30pm should
            // not mark a barber as "working now" at 2pm.
            const now = new Date()
            if (firstFutureAppt.dt <= now) {
              // Appointment already started → barber has been working since then
              offUntilAt = null
              console.log(`[AVAIL] ${barberName}: existing appt already started → overriding to working now`)
            } else {
              // Appointment starts in the future but before the first open slot → use it
              offUntilAt = firstFutureAppt.dt.toISOString()
              console.log(`[AVAIL] ${barberName}: first appt on ${firstFutureAppt.date} starts before open slot → off_until_at=${offUntilAt}`)
            }
          }
          // If appointment starts after off_until_at, no change — keep existing value
        }
      }

      // Update connection health + off_until_at
      await admin
        .from('calendar_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_health: 'OK',
          off_until_at: offUntilAt,
        } as never)
        .eq('id', conn.id)

      results.push({ calendarId: conn.provider_calendar_id, appts: apptRows.length, blocks: pbRows.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[BLOCKS] ERROR for "${barberName}" (calendar ${conn.provider_calendar_id}): ${message}`)
      await admin
        .from('calendar_connections')
        .update({ sync_health: `ERROR: ${message.slice(0, 200)}` } as never)
        .eq('id', conn.id)
      results.push({ calendarId: conn.provider_calendar_id, appts: 0, blocks: 0, error: message })
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: Drift repair — appointments
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
      { error: `Drift repair (appointments) failed: ${driftErr.message}`, results },
      { status: 500 },
    )
  }

  // ---------------------------------------------------------------------------
  // Step 4: Drift repair — provider_blocks
  // ---------------------------------------------------------------------------
  const { error: blockDriftErr } = await admin
    .from('provider_blocks')
    .delete()
    .eq('shop_id', shopId)
    .eq('provider', 'acuity')
    .gte('start_at', blockWinStart.toISOString())
    .lt('start_at', blockWinEnd.toISOString())
    .lt('last_seen_at', reconcileStartedAt.toISOString())

  if (blockDriftErr) {
    return NextResponse.json(
      { error: `Drift repair (blocks) failed: ${blockDriftErr.message}`, results },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    reconcileStartedAt: reconcileStartedAt.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    blockWindowStart: blockWinStart.toISOString(),
    blockWindowEnd: blockWinEnd.toISOString(),
    connections: (connections as unknown[])?.length ?? 0,
    results,
  })
}
