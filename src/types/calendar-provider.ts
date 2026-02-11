// ---------------------------------------------------------------------------
// CalendarProvider — provider-agnostic scheduling abstraction
//
// The dispatcher calls this interface to fetch availability windows.
// Implement one adapter per scheduling platform:
//   AcuityProvider, GlossGeniusProvider, BooksyProvider, etc.
// ---------------------------------------------------------------------------

/** A time window where the barber is busy with a booked appointment. */
export interface BusyWindow {
  barber_id: string
  start: Date
  end: Date
  label?: string // appointment type name, e.g. "Haircut"
}

/** A time window where the barber is blocked (break, time off, etc.). */
export interface BlockedWindow {
  barber_id: string
  start: Date
  end: Date
  note: string | null // reason shown on TV, e.g. "Picking son up"
}

/** External calendar info returned by getCalendars() for initial setup. */
export interface CalendarInfo {
  external_id: string
  name: string
  email?: string
}

/**
 * CalendarProvider — the contract every scheduling adapter must implement.
 *
 * The dispatcher is provider-agnostic: it calls these methods and never
 * imports platform-specific code directly.
 */
export interface CalendarProvider {
  /**
   * Return all busy (appointment) windows for a barber in the given range.
   * Must filter out canceled / no-show appointments.
   */
  getBusyWindows(
    barberId: string,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<BusyWindow[]>

  /**
   * Return all blocked-time windows for a barber in the given range.
   * Include block notes so the TV can display the reason.
   */
  getBlockedWindows(
    barberId: string,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<BlockedWindow[]>

  /**
   * (Optional) List all calendars / staff members known to the provider.
   * Useful for initial setup to map provider calendar IDs to internal barber IDs.
   */
  getCalendars?(): Promise<CalendarInfo[]>
}
