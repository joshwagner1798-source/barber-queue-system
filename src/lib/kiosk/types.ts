export interface KioskSubmitInput {
  firstName: string
  lastInitial: string
  phone: string
  preferenceType: 'ANY' | 'PREFERRED'
  preferredBarberId: string | null
}

export interface KioskBookingSuggestion {
  should_suggest: boolean
  estimated_wait_minutes: number
  earliest_slot: {
    barber_id: string
    barber_name: string
    start: string
    end: string
    date: string
  } | null
  booking_url: string | null
}

export interface KioskSubmitResult {
  success: boolean
  walkinId?: string
  position?: number
  displayName?: string
  existingStatus?: string
  existingPosition?: number
  assignedBarberName?: string | null
  bookingSuggestion?: KioskBookingSuggestion
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
