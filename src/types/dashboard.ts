// Types used across barber + admin dashboards
// Derived from database.ts — keep in sync if schema changes

export type BarberManualState = 'AVAILABLE' | 'IN_CHAIR' | 'ON_BREAK' | 'OFF' | 'CLEANUP' | 'OTHER'

export interface BarberInfo {
  id: string
  firstName: string
  lastName: string
  displayName: string // `${firstName} ${lastName}`
  state: BarberManualState
  stateSince: string // ISO timestamp
}

export interface QueueEntry {
  id: string
  displayName: string
  status: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'NO_SHOW' | 'DONE' | 'REMOVED'
  position: number
  assignedBarberId: string | null
  assignedBarberName: string | null
  assignmentId: string | null // needed for PATCH /api/assignments/[id]
  calledAt: string | null
  createdAt: string
  waitMinutes: number // derived: (now - createdAt) in minutes
}

export interface EventEntry {
  id: string
  type: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface DashboardData {
  currentUser: {
    id: string
    barberId: string // same as id — user IS the barber
    displayName: string
    role: 'barber' | 'admin' | 'owner'
  }
  barbers: BarberInfo[]
  queue: QueueEntry[] // active queue: WAITING, CALLED, IN_SERVICE
}
