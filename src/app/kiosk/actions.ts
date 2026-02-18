'use server'

import { sanitizePhone, buildDisplayName } from "@/lib/kiosk/utils"

import { createAdminClient } from '@/lib/supabase/admin'
import { getNextQueuePosition } from '@/lib/walkin/helpers'
import { validateWalkinTransition } from '@/lib/walkin/validation'
import { appendEvent, WALKIN_ADDED, WALKIN_STATUS_CHANGED } from '@/lib/walkin/events'

const SHOP_ID = '00000000-0000-0000-0000-000000000001'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KioskSubmitInput {
  firstName: string
  lastInitial: string
  phone: string
  preferenceType: 'ANY' | 'PREFERRED'
  preferredBarberId: string | null
}

export interface KioskSubmitResult {
  success: boolean
  walkinId?: string
  position?: number
  displayName?: string
  existingStatus?: string
  existingPosition?: number
  assignedBarberName?: string | null
  error?: string
}

export interface KioskLookupResult {
  found: boolean
  walkin?: {
    id: string
    status: string
    position: number
    displayName: string
    assignedBarberName: string | null
  }
}

// ---------------------------------------------------------------------------
// Validation helpers

export async function submitWalkin(input: KioskSubmitInput): Promise<KioskSubmitResult> {
  // Validate
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

  const displayName = buildDisplayName(firstName, lastInitial)
  const admin = createAdminClient()

  // -----------------------------------------------------------------------
  // 1. Upsert client by phone (find or create)
  // -----------------------------------------------------------------------
  const { data: existingClient } = await admin
    .from('clients')
    .select('id')
    .eq('shop_id', SHOP_ID)
    .eq('phone', phone)
    .single()

  type ClientRow = { id: string }
  let clientId: string

  if (existingClient) {
    clientId = (existingClient as unknown as ClientRow).id
    // Update name in case it changed
    await admin
      .from('clients')
      // @ts-expect-error — Supabase generated types resolve update param to never
      .update({
        first_name: firstName,
        last_initial: lastInitial.toUpperCase(),
        display_name: displayName,
      })
      .eq('id', clientId)
  } else {
    const { data: newClient, error: insertErr } = await admin
      .from('clients')
      // @ts-expect-error — Supabase generated types resolve insert param to never
      .insert({
        shop_id: SHOP_ID,
        first_name: firstName,
        last_initial: lastInitial.toUpperCase(),
        phone,
        display_name: displayName,
      })
      .select('id')
      .single()

    if (insertErr || !newClient) {
      return { success: false, error: 'Failed to create client record' }
    }
    clientId = (newClient as unknown as ClientRow).id
  }

  // -----------------------------------------------------------------------
  // 2. Check for duplicate active entry
  // -----------------------------------------------------------------------
  const { data: activeWalkin } = await admin
    .from('walkins')
    .select('id, status, position, display_name, assigned_barber_id')
    .eq('shop_id', SHOP_ID)
    .eq('client_id', clientId)
    .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
    .limit(1)

  type ActiveRow = {
    id: string
    status: string
    position: number
    display_name: string | null
    assigned_barber_id: string | null
  }
  const active = (activeWalkin ?? []) as unknown as ActiveRow[]

  if (active.length > 0) {
    const entry = active[0]

    // Look up barber name if assigned
    let assignedBarberName: string | null = null
    if (entry.assigned_barber_id) {
      const { data: barber } = await admin
        .from('users')
        .select('first_name, last_name')
        .eq('id', entry.assigned_barber_id)
        .single()
      type BRow = { first_name: string; last_name: string }
      if (barber) {
        const b = barber as unknown as BRow
        assignedBarberName = `${b.first_name} ${b.last_name}`
      }
    }

    return {
      success: true,
      walkinId: entry.id,
      existingStatus: entry.status,
      existingPosition: entry.position,
      displayName: entry.display_name ?? displayName,
      assignedBarberName,
    }
  }

  // -----------------------------------------------------------------------
  // 3. Create new walk-in entry
  // -----------------------------------------------------------------------
  const position = await getNextQueuePosition(admin, SHOP_ID)

  const { data: walkin, error: walkinErr } = await admin
    .from('walkins')
    // @ts-expect-error — Supabase generated types resolve insert param to never
    .insert({
      shop_id: SHOP_ID,
      client_id: clientId,
      display_name: displayName,
      service_type: 'cut',
      preference_type: input.preferenceType,
      preferred_barber_id: input.preferredBarberId,
      status: 'WAITING',
      position,
    })
    .select('id')
    .single()

  if (walkinErr || !walkin) {
    return { success: false, error: 'Failed to join queue' }
  }

  type WRow = { id: string }
  const walkinId = (walkin as unknown as WRow).id

  // Append event
  await appendEvent(admin, {
    shop_id: SHOP_ID,
    type: WALKIN_ADDED,
    actor_user_id: null,
    payload: {
      walkin_id: walkinId,
      display_name: displayName,
      preference_type: input.preferenceType,
      preferred_barber_id: input.preferredBarberId,
      position,
    },
  })

  return {
    success: true,
    walkinId,
    position,
    displayName,
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
