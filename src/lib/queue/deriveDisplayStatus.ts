// ---------------------------------------------------------------------------
// deriveDisplayStatus — pure function, no DB, no React, no side effects
//
// Maps internal engine state to a human-readable display string for TV/UI.
// This is the ONLY place display labels are generated.
// ---------------------------------------------------------------------------

export type EngineState =
  | 'AVAILABLE'
  | 'BUSY'
  | 'SOON_BOOKED'
  | 'BLOCKED'
  | 'OFF_TODAY'

export interface DisplayStatusInput {
  internalState: EngineState
  nextAppointment: Date | null
  blockNote: string | null
}

const LUNCH_KEYWORDS = [
  'lunch',
  'food',
  'eating',
  'eat',
  'meal',
  'grab food',
  'grabbing food',
]

const MAX_DETAIL_LENGTH = 30

export function deriveDisplayStatus(input: DisplayStatusInput): string {
  switch (input.internalState) {
    case 'AVAILABLE':
      return 'Available'

    case 'BUSY':
      return 'With client'

    case 'SOON_BOOKED': {
      if (input.nextAppointment) {
        const mins = Math.round(
          (input.nextAppointment.getTime() - Date.now()) / 60_000,
        )
        if (mins > 0) return `Appointment in ${mins}m`
      }
      return 'Appointment soon'
    }

    case 'BLOCKED': {
      const note = input.blockNote?.trim() ?? ''

      if (note) {
        const lower = note.toLowerCase()
        const isLunch = LUNCH_KEYWORDS.some((kw) => lower.includes(kw))
        if (isLunch) return 'Lunch break'

        if (note.length > MAX_DETAIL_LENGTH) {
          return note.slice(0, MAX_DETAIL_LENGTH) + '\u2026'
        }
        return note
      }

      return 'Unavailable'
    }

    case 'OFF_TODAY':
      return 'Off today'

    default:
      return 'Unknown'
  }
}
