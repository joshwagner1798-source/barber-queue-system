// ---------------------------------------------------------------------------
// booking-creation.ts
//
// Writes a new booking to the appointments table with full overlap checking.
//
// Overlap check order:
//   1. Pre-check against native appointments (status=pending|confirmed)
//   2. Pre-check against provider_appointments (status=ACTIVE, kind=appointment)
//   3. DB-level GIST exclusion constraint (migration 00020) catches races
//
// PII: upserts clients table via same (shop_id, phone) dedup key as the
//      join_walkin_queue RPC.  Uses createAdminClient() throughout because
//      both clients writes and anonymous appointments inserts need service-role.
//
// Error codes returned (not thrown):
//   SLOT_TAKEN         — pre-check or 23505 unique violation
//   BARBER_UNAVAILABLE — barber not found / inactive / no calendar
//   INVALID_SLOT       — start >= end, or slot is in the past
//   DB_ERROR           — unexpected database error
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** No-ambiguous-chars alphabet for confirmation codes. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookingErrorCode =
  | 'SLOT_TAKEN'
  | 'BARBER_UNAVAILABLE'
  | 'INVALID_SLOT'
  | 'DB_ERROR'

export interface CreateBookingParams {
  shopId: string
  barberId: string
  startTime: string   // ISO UTC
  endTime: string     // ISO UTC
  firstName: string
  lastInitial: string
  phone: string       // normalized E.164 or raw 10-digit — normalized internally
  serviceType?: string
  notes?: string
}

export type CreateBookingResult =
  | {
      ok: true
      appointmentId: string
      confirmationCode: string
      barberId: string
      barberName: string
      startTime: string
      endTime: string
      serviceType: string | null
    }
  | { ok: false; code: BookingErrorCode; message: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateConfirmationCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

/** Normalize a US phone to 10-digit or pass through E.164 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1)
  return digits
}

// ---------------------------------------------------------------------------
// createBooking — main export
// ---------------------------------------------------------------------------

export async function createBooking(
  params: CreateBookingParams,
): Promise<CreateBookingResult> {
  const admin = createAdminClient()

  const {
    shopId,
    barberId,
    startTime,
    endTime,
    firstName,
    lastInitial,
    serviceType,
    notes,
  } = params

  const phone = normalizePhone(params.phone)

  // ── Validate slot times ──────────────────────────────────────────────────
  const start = new Date(startTime)
  const end   = new Date(endTime)
  const now   = new Date()

  console.log('[booking-creation] start', { shopId, barberId, startTime, endTime })

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('[booking-creation] INVALID_SLOT: unparseable times', { startTime, endTime })
    return { ok: false, code: 'INVALID_SLOT', message: 'Invalid start or end time' }
  }
  if (start >= end) {
    console.error('[booking-creation] INVALID_SLOT: start >= end')
    return { ok: false, code: 'INVALID_SLOT', message: 'start_time must be before end_time' }
  }
  if (end <= now) {
    console.error('[booking-creation] INVALID_SLOT: slot is in the past', { endTime, now: now.toISOString() })
    return { ok: false, code: 'INVALID_SLOT', message: 'Slot is in the past' }
  }

  // ── Validate barber ──────────────────────────────────────────────────────
  const { data: barberData } = await admin
    .from('users')
    .select('id, first_name, last_name, is_active, acuity_calendar_id')
    .eq('id', barberId)
    .eq('shop_id', shopId)
    .maybeSingle()

  type BarberRow = {
    id: string
    first_name: string
    last_name: string
    is_active: boolean
    acuity_calendar_id: string | null
  }
  const barber = barberData as unknown as BarberRow | null

  console.log('[booking-creation] barber lookup', { barberId, shopId, found: !!barber, is_active: barber?.is_active ?? null })

  if (!barber || !barber.is_active) {
    console.error('[booking-creation] BARBER_UNAVAILABLE', { barberId, shopId })
    return { ok: false, code: 'BARBER_UNAVAILABLE', message: 'Barber not found or inactive' }
  }

  // ── Pre-check: native appointments overlap ───────────────────────────────
  const { data: nativeConflicts } = await admin
    .from('appointments')
    .select('id')
    .eq('barber_id', barberId)
    .in('status', ['pending', 'confirmed'])
    .lt('start_time', endTime)
    .gt('end_time', startTime)
    .limit(1)

  console.log('[booking-creation] native overlap check', { conflicts: (nativeConflicts ?? []).length })

  if ((nativeConflicts ?? []).length > 0) {
    return { ok: false, code: 'SLOT_TAKEN', message: 'This slot is already booked' }
  }

  // ── Pre-check: provider_appointments overlap ─────────────────────────────
  const { data: providerConflicts } = await admin
    .from('provider_appointments')
    .select('id')
    .eq('barber_id', barberId)
    .eq('status', 'ACTIVE')
    .eq('kind', 'appointment')
    .lt('start_at', endTime)
    .gt('end_at', startTime)
    .limit(1)

  console.log('[booking-creation] provider overlap check', { conflicts: (providerConflicts ?? []).length })

  if ((providerConflicts ?? []).length > 0) {
    return { ok: false, code: 'SLOT_TAKEN', message: 'Barber has an Acuity appointment in this slot' }
  }

  // ── Upsert client (phone dedup, same pattern as join_walkin_queue RPC) ───
  const displayName = `${firstName.trim()} ${lastInitial.trim().toUpperCase()}.`

  // TODO: remove `as any` after regenerating src/types/database.ts — upsert
  // overload typing is incorrect in current stale generated types.
  const { data: clientData, error: clientErr } = await admin
    .from('clients')
    .upsert(
      {
        shop_id: shopId,
        first_name: firstName.trim(),
        last_initial: lastInitial.trim().toUpperCase().slice(0, 1),
        phone,
        display_name: displayName,
      } as any,
      { onConflict: 'shop_id,phone', ignoreDuplicates: false },
    )
    .select('id')
    .single()

  console.log('[booking-creation] client upsert', { error: clientErr?.message ?? null, clientId: (clientData as any)?.id ?? null })

  if (clientErr) {
    console.error('[booking-creation] client upsert FAILED', { code: clientErr.code, details: clientErr.details, message: clientErr.message })
    return { ok: false, code: 'DB_ERROR', message: `Client upsert failed: ${clientErr.message}` }
  }

  type ClientRow = { id: string }
  const clientId = (clientData as unknown as ClientRow).id

  const confirmationCode = generateConfirmationCode()

  // ── Insert appointment ────────────────────────────────────────────────────
  // customer_id and service_id are nullable after migration 00021.
  // client_id links to clients table (phone-dedup'd) for name display.
  // service_price defaults to 0.
  // TODO: remove `as any` after regenerating src/types/database.ts
  const { data: apptData, error: apptErr } = await admin
    .from('appointments')
    .insert({
      shop_id: shopId,
      customer_id: null,       // anonymous — no user account
      client_id: clientId,     // FK to clients table for name display
      barber_id: barberId,
      service_id: null,        // no service FK for anonymous booking
      service_price: 0,
      start_time: startTime,
      end_time: endTime,
      status: 'pending',
      notes: notes ?? null,
      confirmation_code: confirmationCode,
      service_type: serviceType ?? null,
    } as any) // TODO: regenerate types after migration 00021
    .select('id')
    .single()

  console.log('[booking-creation] appointment insert', { error: apptErr?.message ?? null, apptId: (apptData as any)?.id ?? null })

  if (apptErr) {
    console.error('[booking-creation] appointment insert FAILED', { pgCode: apptErr.code, details: apptErr.details, message: apptErr.message })
    // 23505 = unique_violation (caught by GIST exclusion constraint — race condition)
    if (apptErr.code === '23505') {
      return { ok: false, code: 'SLOT_TAKEN', message: 'This slot was just taken by another booking' }
    }
    return { ok: false, code: 'DB_ERROR', message: apptErr.message }
  }

  type ApptRow = { id: string }
  const appt = apptData as unknown as ApptRow

  console.log('[booking-creation] success', { appointmentId: appt.id, confirmationCode })

  return {
    ok: true,
    appointmentId: appt.id,
    confirmationCode,
    barberId,
    barberName: `${barber.first_name} ${barber.last_name}`,
    startTime,
    endTime,
    serviceType: serviceType ?? null,
  }
}
