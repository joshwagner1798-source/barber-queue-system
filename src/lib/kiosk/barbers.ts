// KioskBarber type shared between the API route and client components.
// Data loading moved to /api/kiosk/barbers (GET) to avoid 'use server'
// module context where process.env resolution is unreliable.

export interface KioskBarber {
  id: string
  firstName: string
  lastName: string
  displayName: string
}
