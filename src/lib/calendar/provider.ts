// Re-export the CalendarProvider interface from the types module.
// Import from here in library code so the interface source is centralized.
export type {
  CalendarProvider,
  BusyWindow,
  BlockedWindow,
  CalendarInfo,
} from '@/types/calendar-provider'
