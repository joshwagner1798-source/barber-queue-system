// ---------------------------------------------------------------------------
// Walk-in SMS offer orchestration
//
// Flow:
//   1. Walk-in created → initiateWalkinOffer()
//   2. Sends SMS offer to first eligible barber, creates attempt (status=pending)
//   3. Barber replies YES → handleOfferAccepted()  (atomic claim)
//      Barber replies NO  → handleOfferDeclined()  (advance rotation)
//   4. After 90 s with no reply → processExpiredAttempts() marks timeout,
//      calls advanceOfferRotation() for next barber
//
// Eligibility rules (via getEligibleWalkinBarbers — matches TV barber-cards logic):
//   • users.walkin_enabled = true           ← filters Tyrik / Will
//   • Acuity barber_status: FREE or BUSY    ← Acuity override takes priority
//   • Not in active provider_block
//   • Not off (calendar_connections.off_until_at)
//   • No appointment starting within 15-min buffer
//   • Within working shift (business_hours, only when no Acuity override)
//   • Barber has a phone number configured
//
// Rotation order: idle longest (barber_state.state_since ASC) → display_order ASC
// ---------------------------------------------------------------------------

import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getEligibleWalkinBarbers } from './eligible_barbers'
import { sendSms, OFFER_MESSAGE, toE164 } from '@/lib/sms/twilio'
import { appendEvent } from './events'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WALKIN_OFFER_TIMEOUT_SECONDS = 90

// Event type constants
export const WALKIN_OFFER_SENT      = 'WALKIN_OFFER_SENT'
export const WALKIN_OFFER_ACCEPTED  = 'WALKIN_OFFER_ACCEPTED'
export const WALKIN_OFFER_DECLINED  = 'WALKIN_OFFER_DECLINED'
export const WALKIN_OFFER_TIMEOUT   = 'WALKIN_OFFER_TIMEOUT'
export const WALKIN_OFFER_EXHAUSTED = 'WALKIN_OFFER_EXHAUSTED'
export const WALKIN_OFFER_SMS_ERROR = 'WALKIN_OFFER_SMS_ERROR'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EligibleBarber {
  barber_id: string
  barber_name: string
  phone: string           // raw stored phone (may not be E.164)
  display_order: number
  state_since: string     // ISO — used for idle-longest sort
}

type AttemptRow = {
  id: string
  shop_id: string
  walkin_id: string
  barber_id: string
  status: 'pending' | 'accepted' | 'declined' | 'timeout' | 'canceled'
  sent_at: string
  responded_at: string | null
  expires_at: string
}

type BarberUserRow = {
  id: string
  first_name: string
  last_name: string
  phone: string
  display_order: number
}

type BarberStateRow = {
  barber_id: string
  state_since: string
}

// ---------------------------------------------------------------------------
// Eligibility query
// ---------------------------------------------------------------------------

/**
 * Returns barbers who are eligible to receive a walk-in offer right now,
 * sorted by idle-longest first, then display_order.
 *
 * Uses getEligibleWalkinBarbers (shared with TV display logic) for the
 * core eligibility determination, then augments with phone/state_since.
 *
 * @param excludeBarberIds  Barber IDs to skip (already tried for this walk-in).
 */
export async function getEligibleBarbers(
  admin: SupabaseClient<Database>,
  shopId: string,
  excludeBarberIds: string[] = [],
): Promise<EligibleBarber[]> {
  // 1. Use shared eligibility function (matches TV barber-cards logic)
  const { eligible } = await getEligibleWalkinBarbers(admin, shopId)

  // 2. Filter out already-tried barbers
  const eligibleIds = eligible
    .map((b) => b.barberId)
    .filter((id) => !excludeBarberIds.includes(id))

  if (!eligibleIds.length) return []

  // 3. Fetch phone + display_order for SMS sending (must have a phone number)
  const { data: users } = await admin
    .from('users')
    .select('id, first_name, last_name, phone, display_order')
    .eq('shop_id', shopId)
    .in('id', eligibleIds)
    .not('phone', 'is', null)

  if (!users?.length) return []

  const validBarbers = (users as unknown as BarberUserRow[]).filter((b) => b.phone)
  if (!validBarbers.length) return []

  // 4. Fetch barber_state.state_since for idle-longest sort
  const { data: states } = await admin
    .from('barber_state')
    .select('barber_id, state_since')
    .eq('shop_id', shopId)
    .in('barber_id', validBarbers.map((b) => b.id))

  const stateMap = new Map<string, string>()
  for (const s of (states ?? []) as unknown as BarberStateRow[]) {
    stateMap.set(s.barber_id, s.state_since)
  }

  return validBarbers
    .map((b) => ({
      barber_id: b.id,
      barber_name: `${b.first_name} ${b.last_name}`,
      phone: b.phone,
      display_order: b.display_order,
      state_since: stateMap.get(b.id) ?? new Date(0).toISOString(),
    }))
    .sort((a, b) => {
      // Primary: idle longest (state_since ascending — earlier = idled longer)
      const timeDiff =
        new Date(a.state_since).getTime() - new Date(b.state_since).getTime()
      if (timeDiff !== 0) return timeDiff
      // Fallback: display_order ascending
      return a.display_order - b.display_order
    })
}

// ---------------------------------------------------------------------------
// Offer initiation — called right after a walk-in is created
// ---------------------------------------------------------------------------

/**
 * Start the SMS offer rotation for a newly-created walk-in.
 * Safe to call multiple times — exits early if an offer is already pending.
 * Fire-and-forget safe (does not throw to the caller).
 */
export async function initiateWalkinOffer(
  admin: SupabaseClient<Database>,
  shopId: string,
  walkinId: string,
): Promise<void> {
  // Verify walk-in is still WAITING (it might have been auto-assigned already)
  const { data: walkin } = await admin
    .from('walkins')
    .select('id, status')
    .eq('id', walkinId)
    .eq('status', 'WAITING')
    .maybeSingle()

  if (!walkin) return

  // Check whether a pending offer already exists (idempotency guard)
  const { data: existing } = await admin
    .from('walkin_assignment_attempts')
    .select('id')
    .eq('walkin_id', walkinId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return // already in-flight

  await advanceOfferRotation(admin, shopId, walkinId)
}

// ---------------------------------------------------------------------------
// Rotation — advance to the next eligible barber
// ---------------------------------------------------------------------------

/**
 * Determine the next eligible barber for this walk-in (excluding anyone who
 * has already been tried) and send them an SMS offer.
 */
export async function advanceOfferRotation(
  admin: SupabaseClient<Database>,
  shopId: string,
  walkinId: string,
): Promise<void> {
  // Guard: walk-in must still be WAITING
  const { data: walkin } = await admin
    .from('walkins')
    .select('id, status, display_name')
    .eq('id', walkinId)
    .eq('status', 'WAITING')
    .maybeSingle()

  if (!walkin) return

  // Build exclude list from all terminal attempts for this walk-in
  const { data: pastAttempts } = await admin
    .from('walkin_assignment_attempts')
    .select('barber_id')
    .eq('walkin_id', walkinId)
    .in('status', ['declined', 'timeout', 'canceled', 'accepted'])

  type PastAttempt = { barber_id: string }
  const triedIds = (pastAttempts ?? []).map(
    (a) => (a as unknown as PastAttempt).barber_id,
  )

  const eligible = await getEligibleBarbers(admin, shopId, triedIds)

  if (!eligible.length) {
    // All available + walkin-enabled barbers have been tried — give up gracefully
    await appendEvent(admin, {
      shop_id: shopId,
      type: WALKIN_OFFER_EXHAUSTED,
      actor_user_id: null,
      payload: {
        walkin_id: walkinId,
        tried_barber_ids: triedIds,
        message: 'No more eligible barbers for this walk-in',
      },
    })
    return
  }

  const next = eligible[0]
  await sendOfferToBarber(admin, shopId, walkinId, next.barber_id, next.phone)
}

// ---------------------------------------------------------------------------
// Send a single offer
// ---------------------------------------------------------------------------

/**
 * Creates a pending attempt record and sends the SMS offer.
 * The unique partial index on (walkin_id) WHERE status='pending' prevents
 * duplicate offers — if a concurrent call races here the insert will fail
 * and we exit silently.
 */
export async function sendOfferToBarber(
  admin: SupabaseClient<Database>,
  shopId: string,
  walkinId: string,
  barberId: string,
  barberPhone: string,
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + WALKIN_OFFER_TIMEOUT_SECONDS * 1000,
  ).toISOString()

  // Insert attempt — partial unique index on pending walkin prevents duplicates
  const { error: insertErr } = await admin
    .from('walkin_assignment_attempts')
    // @ts-expect-error — Supabase generated types resolve insert param to never
    .insert({
      shop_id: shopId,
      walkin_id: walkinId,
      barber_id: barberId,
      status: 'pending',
      expires_at: expiresAt,
    })

  if (insertErr) {
    // Unique constraint violation = pending offer already exists, nothing to do
    return
  }

  // Send SMS — errors are logged but do not abort (we still have the DB record)
  try {
    await sendSms(toE164(barberPhone), OFFER_MESSAGE)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await appendEvent(admin, {
      shop_id: shopId,
      type: WALKIN_OFFER_SMS_ERROR,
      actor_user_id: null,
      payload: { walkin_id: walkinId, barber_id: barberId, error: msg },
    }).catch(() => {})
  }

  await appendEvent(admin, {
    shop_id: shopId,
    type: WALKIN_OFFER_SENT,
    actor_user_id: null,
    payload: { walkin_id: walkinId, barber_id: barberId, expires_at: expiresAt },
  }).catch(() => {})
}

// ---------------------------------------------------------------------------
// YES handler — atomic claim
// ---------------------------------------------------------------------------

export type OfferAcceptResult =
  | { accepted: true }
  | { accepted: false; reason: string }

/**
 * Atomically claim the walk-in for this barber.
 * Uses a conditional UPDATE (WHERE status='WAITING' AND assigned_barber_id IS NULL)
 * so two simultaneous YES replies cannot both succeed.
 */
export async function handleOfferAccepted(
  admin: SupabaseClient<Database>,
  shopId: string,
  barberId: string,
  attemptId: string,
  walkinId: string,
): Promise<OfferAcceptResult> {
  const now = new Date().toISOString()

  // Atomic claim: WAITING → CALLED
  const { data: claimed, error: claimErr } = await admin
    .from('walkins')
    // @ts-expect-error — Supabase generated types resolve update param to never
    .update({
      status: 'CALLED',
      assigned_barber_id: barberId,
      called_at: now,
    })
    .eq('id', walkinId)
    .eq('status', 'WAITING')
    .is('assigned_barber_id', null)
    .select('id')

  type ClaimedRow = { id: string }
  const claimedRows = (claimed as unknown as ClaimedRow[] | null) ?? []

  if (claimErr || claimedRows.length === 0) {
    // Race: another barber or the dispatcher claimed it first
    // @ts-expect-error — Supabase generated types resolve update param to never
    await admin
      .from('walkin_assignment_attempts')
      .update({ status: 'canceled', responded_at: now })
      .eq('id', attemptId)
    return { accepted: false, reason: 'Walk-in already claimed by another barber' }
  }

  // Mark this attempt accepted
  // @ts-expect-error — Supabase generated types resolve update param to never
  await admin
    .from('walkin_assignment_attempts')
    .update({ status: 'accepted', responded_at: now })
    .eq('id', attemptId)

  // Create assignment record (mirrors the pattern in queue_assignment.ts)
  // @ts-expect-error — Supabase generated types resolve insert param to never
  await admin.from('assignments').insert({
    shop_id: shopId,
    walkin_id: walkinId,
    barber_id: barberId,
  })

  // Cancel any other concurrent pending attempts for this walk-in (safety net)
  // @ts-expect-error — Supabase generated types resolve update param to never
  await admin
    .from('walkin_assignment_attempts')
    .update({ status: 'canceled', responded_at: now })
    .eq('walkin_id', walkinId)
    .eq('status', 'pending')
    .neq('id', attemptId)

  await appendEvent(admin, {
    shop_id: shopId,
    type: WALKIN_OFFER_ACCEPTED,
    actor_user_id: null,
    payload: { walkin_id: walkinId, barber_id: barberId, attempt_id: attemptId },
  }).catch(() => {})

  return { accepted: true }
}

// ---------------------------------------------------------------------------
// NO handler — move to next barber
// ---------------------------------------------------------------------------

/**
 * Mark the attempt declined and advance the offer to the next eligible barber.
 */
export async function handleOfferDeclined(
  admin: SupabaseClient<Database>,
  shopId: string,
  barberId: string,
  attemptId: string,
  walkinId: string,
): Promise<void> {
  const now = new Date().toISOString()

  // @ts-expect-error — Supabase generated types resolve update param to never
  await admin
    .from('walkin_assignment_attempts')
    .update({ status: 'declined', responded_at: now })
    .eq('id', attemptId)

  await appendEvent(admin, {
    shop_id: shopId,
    type: WALKIN_OFFER_DECLINED,
    actor_user_id: null,
    payload: { walkin_id: walkinId, barber_id: barberId, attempt_id: attemptId },
  }).catch(() => {})

  // Advance to next barber
  await advanceOfferRotation(admin, shopId, walkinId)
}

// ---------------------------------------------------------------------------
// Timeout processing — called by /api/jobs/walkin-timeouts every ~2 minutes
// ---------------------------------------------------------------------------

/**
 * Finds all pending attempts whose expires_at has passed and advances the
 * rotation for each affected walk-in. Returns the number of timeouts handled.
 *
 * Safe to call concurrently — the conditional update (.eq('status', 'pending'))
 * acts as an optimistic lock.
 */
export async function processExpiredAttempts(
  admin: SupabaseClient<Database>,
  shopId: string,
): Promise<number> {
  const now = new Date().toISOString()

  const { data: expired, error } = await admin
    .from('walkin_assignment_attempts')
    .select('id, walkin_id, barber_id')
    .eq('shop_id', shopId)
    .eq('status', 'pending')
    .lt('expires_at', now)

  if (error || !expired?.length) return 0

  type ExpiredRow = { id: string; walkin_id: string; barber_id: string }
  const expiredRows = expired as unknown as ExpiredRow[]

  let processed = 0

  for (const attempt of expiredRows) {
    // Optimistic lock: only transition if still pending (guard against races)
    const { error: updateErr } = await admin
      .from('walkin_assignment_attempts')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({ status: 'timeout', responded_at: now })
      .eq('id', attempt.id)
      .eq('status', 'pending')

    if (updateErr) continue // another process already handled it

    await appendEvent(admin, {
      shop_id: shopId,
      type: WALKIN_OFFER_TIMEOUT,
      actor_user_id: null,
      payload: {
        walkin_id: attempt.walkin_id,
        barber_id: attempt.barber_id,
        attempt_id: attempt.id,
      },
    }).catch(() => {})

    // Advance to next eligible barber
    await advanceOfferRotation(admin, shopId, attempt.walkin_id)
    processed++
  }

  return processed
}
