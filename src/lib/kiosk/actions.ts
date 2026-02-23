// src/lib/kiosk/actions.ts
export type SubmitWalkinInput = {
  displayName: string
  phone?: string
  serviceType?: string
  preferenceType?: 'ANY' | 'SPECIFIC'
  preferredBarberId?: string | null
}

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
  return res.json()
}

// Create a new walk-in
export async function submitWalkin(input: SubmitWalkinInput) {
  const res = await fetch('/api/walkins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return jsonOrThrow(res)
}

// Mark an existing walk-in as checked-in / called / etc (depends on your API implementation)
export async function checkInWalkin(walkinId: string) {
  const res = await fetch(`/api/walkins/${walkinId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'CHECK_IN' }),
  })
  return jsonOrThrow(res)
}

// Lookup walk-ins by phone (only works if your GET /api/walkins supports ?phone=)
export async function lookupByPhone(phone: string) {
  const res = await fetch(`/api/walkins?phone=${encodeURIComponent(phone)}`, {
    method: 'GET',
  })
  return jsonOrThrow(res)
}
