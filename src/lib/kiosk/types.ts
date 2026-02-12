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

export interface KioskBarber {
  id: string
  firstName: string
  lastName: string
  displayName: string
}
