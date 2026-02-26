// Kiosk client-side actions — all routes are public (no auth required).
// API endpoints at /api/kiosk/walkins/* use service-role on the server.

const FALLBACK_SHOP_ID = '70467794-c7ce-47f2-8c62-bcb5bb19e31e'

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

export function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function buildDisplayName(firstName: string, lastInitial: string): string {
  const first = firstName.trim()
  const initial = lastInitial.trim().toUpperCase()
  const capitalized = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  return `${capitalized} ${initial}.`
}

// ---------------------------------------------------------------------------
// submitWalkin
// ---------------------------------------------------------------------------

export interface SubmitWalkinInput {
  firstName: string
  lastInitial: string
  phone: string
  preferenceType: 'ANY' | 'PREFERRED'
  preferredBarberId?: string | null
  shopId?: string
}

export interface SubmitWalkinResult {
  success: boolean
  error?: string
  walkinId?: string
  displayName?: string
  position?: number
  // Set when the phone number already has an active walk-in
  existingStatus?: string
  existingPosition?: number
  assignedBarberName?: string | null
}

export async function submitWalkin(input: SubmitWalkinInput): Promise<SubmitWalkinResult> {
  // Client-side validation
  if (!input.firstName.trim()) {
    return { success: false, error: 'First name is required' }
  }
  if (input.lastInitial.trim().length !== 1 || !/^[a-zA-Z]$/.test(input.lastInitial.trim())) {
    return { success: false, error: 'Last initial must be a single letter' }
  }
  const digits = sanitizePhone(input.phone)
  if (digits.length !== 10) {
    return { success: false, error: 'Phone number must be 10 digits' }
  }
  if (input.preferenceType === 'PREFERRED' && !input.preferredBarberId) {
    return { success: false, error: 'Please select a barber' }
  }

  try {
    const res = await fetch('/api/kiosk/walkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: input.firstName.trim(),
        lastInitial: input.lastInitial.trim(),
        phone: digits,
        shopId: input.shopId ?? FALLBACK_SHOP_ID,
        preferenceType: input.preferenceType,
        preferredBarberId: input.preferredBarberId ?? null,
      }),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error ?? `Error ${res.status}` }
    return data as SubmitWalkinResult
  } catch {
    return { success: false, error: 'Network error. Please try again.' }
  }
}

// ---------------------------------------------------------------------------
// checkInWalkin
// ---------------------------------------------------------------------------

export interface CheckInResult {
  success: boolean
  error?: string
}

export async function checkInWalkin(walkinId: string): Promise<CheckInResult> {
  try {
    const res = await fetch(`/api/kiosk/walkins/${walkinId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CHECK_IN' }),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error ?? `Error ${res.status}` }
    return { success: true }
  } catch {
    return { success: false, error: 'Network error. Please try again.' }
  }
}

// ---------------------------------------------------------------------------
// lookupByPhone
// ---------------------------------------------------------------------------

export interface LookupResult {
  found: boolean
  error?: string
  walkin?: {
    id: string
    status: string
    position: number
    displayName: string
    assignedBarberName: string | null
  }
}

export async function lookupByPhone(phone: string, shopId?: string): Promise<LookupResult> {
  try {
    const sid = shopId ?? FALLBACK_SHOP_ID
    const res = await fetch(
      `/api/kiosk/walkins/lookup?phone=${encodeURIComponent(phone)}&shop_id=${encodeURIComponent(sid)}`,
    )
    const data = await res.json()
    if (!res.ok) return { found: false, error: data.error ?? `Error ${res.status}` }
    return data as LookupResult
  } catch {
    return { found: false, error: 'Network error. Please try again.' }
  }
}
