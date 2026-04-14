'use server'
import type { KioskSubmitInput, KioskSubmitResult, KioskLookupResult } from "./types"

import { sanitizePhone } from "./helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { validateWalkinTransition } from '@/lib/walkin/validation'
import { appendEvent, WALKIN_STATUS_CHANGED } from '@/lib/walkin/events'
import { autoAssignWalkins } from '@/lib/walkin/queue_assignment'
import { getBookingSuggestion } from '@/lib/scheduling/queue-booking-bridge'

const SHOP_ID = '00000000-0000-0000-0000-000000000001'

// ---------------------------------------------------------------------------
// Submit walk-in (single atomic RPC)
// ---------------------------------------------------------------------------

interface JoinQueueResult {
  already_active: boolean
  walkin_id: string
  status?: string
  position: number
  display_name: string
  assigned_barber_id?: string | null
  assigned_barber_name?: string | null
}

export async function submitWalkin(input: KioskSubmitInput): Promise<KioskSubmitResult> {
  // Client-side validation (fast-fail before DB round trip)
  const firstName = input.firstName.trim()
  if (!firstName || firstName.length < 1) {
    return { success: false, error: 'First name is required' }
  }

  const lastInitial = input.lastInitial.trim()
  if (!lastInitial || !/^[a-zA-Z]$/.test(lastInitial)) {
    return { success: false, error: 'Last initial must be a single letter' }
  }

  const phone = sanitizePhone(input.phone)
  if (phone.length !== 10) {
    return { success: false, error: 'Phone must be 10 digits' }
  }

  if (input.preferenceType === 'PREFERRED' && !input.preferredBarberId) {
    return { success: false, error: 'Select a barber or choose First Available' }
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('join_walkin_queue', {
    p_shop_id: SHOP_ID,
    p_first_name: firstName,
    p_last_initial: lastInitial,
    p_phone: phone,
    p_preference_type: input.preferenceType,
    p_preferred_barber_id: input.preferredBarberId ?? null,
  })

  if (error) {
    console.error('join_walkin_queue error:', error)
    return { success: false, error: 'Failed to join queue' }
  }

  const result = data as unknown as JoinQueueResult

  if (result.already_active) {
    return {
      success: true,
      walkinId: result.walkin_id,
      existingStatus: result.status,
      existingPosition: result.position,
      displayName: result.display_name,
      assignedBarberName: result.assigned_barber_name ?? null,
    }
  }

  // Fire auto-assignment immediately after new walk-in joins queue.
  // This is fire-and-forget — the response to the kiosk shouldn't wait.
  autoAssignWalkins(admin, SHOP_ID).catch(() => {})

  // Booking suggestion — check if wait is long enough to nudge toward booking
  const bookingSuggestion = await getBookingSuggestion(
    admin,
    SHOP_ID,
    result.position,
  ).catch(() => null)

  return {
    success: true,
    walkinId: result.walkin_id,
    position: result.position,
    displayName: result.display_name,
    bookingSuggestion: bookingSuggestion ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Check-in: CALLED → IN_SERVICE (prevents 5-min no-show timeout)
// ---------------------------------------------------------------------------

export async function checkInWalkin(
  walkinId: string,
): Promise<{ success: boolean; error?: string }> {
  const { valid, error: valErr } = validateWalkinTransition('CALLED', 'IN_SERVICE')
  if (!valid) return { success: false, error: valErr }

  const admin = createAdminClient()

  // Optimistic lock: only transition if still CALLED
  const { data, error } = await admin
    .from('walkins')
    // @ts-expect-error — Supabase generated types resolve update param to never
    .update({ status: 'IN_SERVICE' })
    .eq('id', walkinId)
    .eq('status', 'CALLED')
    .select('id')

  type Row = { id: string }
  if (error || !(data as unknown as Row[] | null)?.length) {
    return { success: false, error: 'Walk-in is not in CALLED status' }
  }

  await appendEvent(admin, {
    shop_id: SHOP_ID,
    type: WALKIN_STATUS_CHANGED,
    actor_user_id: null,
    payload: { walkin_id: walkinId, from: 'CALLED', to: 'IN_SERVICE', source: 'kiosk_checkin' },
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// Lookup by phone (returning customer checks their status)
// ---------------------------------------------------------------------------

export async function lookupByPhone(phone: string): Promise<KioskLookupResult> {
  const cleanPhone = sanitizePhone(phone)
  if (cleanPhone.length !== 10) return { found: false }

  const admin = createAdminClient()

  // Find client by phone
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('shop_id', SHOP_ID)
    .eq('phone', cleanPhone)
    .single()

  type CRow = { id: string }
  if (!client) return { found: false }
  const clientId = (client as unknown as CRow).id

  // Find active walkin
  const { data: walkins } = await admin
    .from('walkins')
    .select('id, status, position, display_name, assigned_barber_id')
    .eq('shop_id', SHOP_ID)
    .eq('client_id', clientId)
    .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
    .limit(1)

  type WRow = {
    id: string
    status: string
    position: number
    display_name: string | null
    assigned_barber_id: string | null
  }
  const rows = (walkins ?? []) as unknown as WRow[]
  if (rows.length === 0) return { found: false }

  const w = rows[0]

  let assignedBarberName: string | null = null
  if (w.assigned_barber_id) {
    const { data: barber } = await admin
      .from('users')
      .select('first_name, last_name')
      .eq('id', w.assigned_barber_id)
      .single()
    type BRow = { first_name: string; last_name: string }
    if (barber) {
      const b = barber as unknown as BRow
      assignedBarberName = `${b.first_name} ${b.last_name}`
    }
  }

  return {
    found: true,
    walkin: {
      id: w.id,
      status: w.status,
      position: w.position,
      displayName: w.display_name ?? '',
      assignedBarberName,
    },
  }
}
