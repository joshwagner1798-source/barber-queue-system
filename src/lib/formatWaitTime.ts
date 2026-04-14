const nyTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const nyDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
})

/**
 * Formats a wait time for customer-facing display.
 *
 *  < 60 min  → "25 min"
 * 60–89 min  → "1 hr 20 min"
 *   ≥ 90 min → "Next available at 6:00 PM"
 *              "Next available tomorrow at 9:00 AM" (if the slot is the next day)
 *
 * @param waitMinutes     Estimated wait in whole minutes
 * @param nextAvailableAt ISO string of the next available slot (used when ≥ 90 min)
 */
export function formatWaitTime(waitMinutes: number, nextAvailableAt?: string | null): string {
  if (waitMinutes < 60) {
    return `${waitMinutes} min`
  }

  if (waitMinutes < 90) {
    const hrs  = Math.floor(waitMinutes / 60)
    const mins = waitMinutes % 60
    return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`
  }

  // ≥ 90 min — show next-available time when we have it
  if (nextAvailableAt) {
    const d          = new Date(nextAvailableAt)
    const now        = new Date()
    const dDate      = nyDateFmt.format(d)
    const todayStr   = nyDateFmt.format(now)
    const [yr, mo, dy] = todayStr.split('-').map(Number)
    const tomorrowStr  = nyDateFmt.format(new Date(Date.UTC(yr, mo - 1, dy + 1)))
    const time       = nyTimeFmt.format(d)

    if (dDate === tomorrowStr) return `Next available tomorrow at ${time}`
    return `Next available at ${time}`
  }

  // Fallback: duration when no slot info is available
  const hrs  = Math.floor(waitMinutes / 60)
  const mins = waitMinutes % 60
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`
}
