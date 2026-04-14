'use client'

// ---------------------------------------------------------------------------
// BarberBookingSheet
//
// A modal sheet that opens over the queue display when a customer taps a
// barber card.  This keeps scheduling embedded in the queue experience rather
// than routing away to a separate page.
//
// Modes (controlled by shop_settings.scheduling_mode):
//   native   — slot picker → info form → confirmation
//   external — shows external booking URL/button; no in-app flow
//
// Auto-closes 30 s after confirmation (matches kiosk auto-reset cadence).
// Closes immediately on backdrop click or × button.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from 'react'
import { submitWalkin } from '@/lib/kiosk/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SheetBarber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  photo_x?: number | null
  photo_y?: number | null
}

interface BookingSlot {
  start: string
  end: string
  status: 'AVAILABLE' | 'BUSY' | 'TOO_SOON' | 'OUTSIDE_HOURS'
}

interface ConfirmedData {
  confirmation_code: string
  barber_name: string
  start_time: string
}

export interface BarberBookingSheetProps {
  barber: SheetBarber
  shopId: string
  /** 'native' | 'external' — 'off' should never mount this component */
  schedulingMode: 'native' | 'external'
  externalBookingUrl?: string | null
  onClose: () => void
}

type SheetStep = 'choice' | 'queue' | 'queue-confirmed' | 'times' | 'info' | 'confirmed'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DURATION = 30

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/**
 * Returns YYYY-MM-DD for today + offset days, in the browser's local timezone.
 * Using toLocaleDateString('en-CA') avoids the UTC date-shift bug from
 * toISOString().slice(0,10) which returns the UTC date, not the local date.
 */
function getLocalDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA') // en-CA → YYYY-MM-DD, local timezone
}

// ---------------------------------------------------------------------------
// BarberBookingSheet
// ---------------------------------------------------------------------------

export function BarberBookingSheet({
  barber,
  shopId,
  schedulingMode,
  externalBookingUrl,
  onClose,
}: BarberBookingSheetProps) {
  // ── State ────────────────────────────────────────────────────────────────
  const [step, setStep]           = useState<SheetStep>('choice')
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateStr(0))
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)

  const [slots, setSlots]         = useState<BookingSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [slotError, setSlotError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [phone, setPhone]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Returning-customer lookup state
  const [lookedUpPhone, setLookedUpPhone] = useState('')
  const [lookupFound, setLookupFound]     = useState(false)

  const [confirmed, setConfirmed] = useState<ConfirmedData | null>(null)

  // Queue form state
  const [queueFirstName, setQueueFirstName]       = useState('')
  const [queueLastInitial, setQueueLastInitial]   = useState('')
  const [queuePhone, setQueuePhone]               = useState('')
  const [queueSubmitting, setQueueSubmitting]     = useState(false)
  const [queueError, setQueueError]               = useState<string | null>(null)
  const [queuePosition, setQueuePosition]         = useState<number | null>(null)
  const [queueDisplayName, setQueueDisplayName]   = useState<string | null>(null)
  const [queueExistingStatus, setQueueExistingStatus] = useState<string | null>(null)

  // Post-confirmation email capture
  const [emailInput, setEmailInput]         = useState('')
  const [emailSaved, setEmailSaved]         = useState(false)
  const [emailSaving, setEmailSaving]       = useState(false)
  const [emailError, setEmailError]         = useState<string | null>(null)
  const [emailDismissed, setEmailDismissed] = useState(false)

  // ── Auto-close 30s after confirmation (booking or queue) ─────────────────
  useEffect(() => {
    if (step !== 'confirmed' && step !== 'queue-confirmed') return
    const t = setTimeout(onClose, 30_000)
    return () => clearTimeout(t)
  }, [step, onClose])

  // ── Returning-customer lookup ─────────────────────────────────────────────
  // Fires once per unique 10-digit phone. Silently auto-fills name if found.
  useEffect(() => {
    if (phone.length < 10) {
      if (lookedUpPhone) {
        setLookedUpPhone('')
        setLookupFound(false)
      }
      return
    }
    if (phone === lookedUpPhone) return

    setLookupFound(false)
    const params = new URLSearchParams({ phone })
    if (shopId) params.set('shop_id', shopId)

    fetch(`/api/booking/lookup?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLookedUpPhone(phone)
        if (data.found) {
          setFirstName(data.first_name)
          setLastInitial(data.last_initial)
          setLookupFound(true)
        }
      })
      .catch(() => { setLookedUpPhone(phone) })
  }, [phone, shopId, lookedUpPhone])

  // ── Slot fetching ─────────────────────────────────────────────────────────
  const fetchSlots = useCallback(async (date: string) => {
    setLoadingSlots(true)
    setSlotError(null)
    setSlots([])

    const params = new URLSearchParams({
      barber_id:        barber.id,
      date,
      service_duration: String(DEFAULT_DURATION),
    })
    if (shopId) params.set('shop_id', shopId)

    try {
      const r = await fetch(`/api/booking/slots?${params}`)
      const data = await r.json()
      if (!r.ok) {
        // No calendar → friendly message instead of raw API error
        if (r.status === 422) {
          setSlotError(`${barber.first_name} doesn't have online booking yet. Walk in or call.`)
        } else {
          setSlotError(data.error ?? 'Could not load available times.')
        }
        return
      }
      setSlots(data.slots ?? [])
    } catch {
      setSlotError('Could not load times. Please try again.')
    } finally {
      setLoadingSlots(false)
    }
  }, [barber.id, barber.first_name, shopId])

  useEffect(() => {
    if (schedulingMode === 'native' && step === 'times') fetchSlots(selectedDate)
  }, [fetchSlots, selectedDate, schedulingMode, step])

  // ── Derived slot data ─────────────────────────────────────────────────────
  const availableSlots  = slots.filter((s) => s.status === 'AVAILABLE')
  const preferredSlots  = availableSlots.slice(0, 3)
  const remainingSlots  = availableSlots.slice(3)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSlotSelect = (slot: BookingSlot) => {
    setSelectedSlot(slot)
    setFormError(null)
    setStep('info')
  }

  const handleSaveEmail = async () => {
    if (!emailInput.trim() || !confirmed) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())) {
      setEmailError('Enter a valid email address')
      return
    }
    setEmailSaving(true)
    setEmailError(null)
    try {
      const r = await fetch('/api/booking/save-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation_code: confirmed.confirmation_code,
          shop_id: shopId || undefined,
          email: emailInput.trim().toLowerCase(),
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setEmailError(d.error ?? 'Could not save. Try again.')
        return
      }
      setEmailSaved(true)
    } catch {
      setEmailError('Could not save. Try again.')
    } finally {
      setEmailSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot) return
    setFormError(null)
    setSubmitting(true)

    try {
      const r = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barber_id:   barber.id,
          start_time:  selectedSlot.start,
          end_time:    selectedSlot.end,
          first_name:  firstName.trim(),
          last_initial: lastInitial.trim(),
          phone:       phone.replace(/\D/g, ''),
          service_type: 'Haircut',
          shop_id:     shopId || undefined,
        }),
      })
      const data = await r.json()

      if (r.status === 409) {
        // Slot just taken — send customer back to pick another
        setFormError('That time was just taken. Please choose another.')
        setStep('times')
        fetchSlots(selectedDate)
        return
      }
      if (!r.ok) {
        setFormError(data.error ?? 'Booking failed. Please try again.')
        return
      }

      setConfirmed({
        confirmation_code: data.confirmation_code,
        barber_name:       data.barber_name,
        start_time:        data.start_time,
      })
      setStep('confirmed')
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Queue submit ──────────────────────────────────────────────────────────
  const handleQueueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setQueueError(null)
    setQueueSubmitting(true)
    try {
      const result = await submitWalkin({
        firstName:        queueFirstName.trim(),
        lastInitial:      queueLastInitial.trim(),
        phone:            queuePhone,
        preferenceType:   'PREFERRED',
        preferredBarberId: barber.id,
      })
      if (!result.success) {
        setQueueError(result.error ?? 'Could not join queue. Please try again.')
        return
      }
      setQueuePosition(result.existingPosition ?? result.position ?? null)
      setQueueDisplayName(result.displayName ?? null)
      setQueueExistingStatus(result.existingStatus ?? null)
      setStep('queue-confirmed')
    } catch {
      setQueueError('Something went wrong. Please try again.')
    } finally {
      setQueueSubmitting(false)
    }
  }

  // ── Date quick-select labels ──────────────────────────────────────────────
  const dateOptions = [0, 1, 2, 3].map((offset) => {
    const d = getLocalDateStr(offset)
    const label =
      offset === 0 ? 'Today' :
      offset === 1 ? 'Tomorrow' :
      // Use noon local time to avoid date boundary issues with toLocaleDateString
      new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    return { d, label }
  })

  // ── Photo style ───────────────────────────────────────────────────────────
  const photoStyle = barber.avatar_url ? {
    backgroundImage:    `url(${barber.avatar_url})`,
    backgroundPosition: `${barber.photo_x ?? 50}% ${barber.photo_y ?? 50}%`,
    backgroundSize:     'cover',
  } : undefined

  // ── Input class (shared) ──────────────────────────────────────────────────
  const inputCls = 'block w-full px-3 py-3 border border-[rgba(255,255,255,0.1)] rounded-lg text-lg text-[#f7f8f8] bg-[#191a1b] placeholder-[#62666d] focus:outline-none focus:ring-2 focus:ring-[#7170ff] focus:border-[#7170ff] transition-colors'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-md bg-[#0f1011] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-[rgba(255,255,255,0.07)]">

        {/* ── Barber header ── */}
        <div className="relative h-48 flex-shrink-0 bg-[#191a1b]">
          {barber.avatar_url ? (
            <div className="absolute inset-0" style={photoStyle} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white text-6xl font-bold opacity-30 select-none">
                {barber.first_name[0]}{barber.last_name[0]}
              </span>
            </div>
          )}
          {/* Gradient over photo */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors text-lg leading-none"
            aria-label="Close"
          >
            &#215;
          </button>

          {/* Name */}
          <div className="absolute bottom-4 left-4 right-12">
            <h2 className="text-white text-2xl font-bold leading-tight">
              {barber.first_name} {barber.last_name}
            </h2>
            <p className="text-white/60 text-sm mt-0.5">
              {step === 'queue' || step === 'queue-confirmed'
                ? 'Join the queue'
                : step === 'choice'
                  ? 'Walk in or book an appointment'
                  : schedulingMode === 'external' ? 'Book online' : 'Book an appointment'}
            </p>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ────── CHOICE STEP ────── */}
          {step === 'choice' && (
            <div className="p-6 space-y-3">
              {/* Primary: queue */}
              <button
                type="button"
                onClick={() => setStep('queue')}
                className="w-full py-5 px-4 bg-[#27a644] hover:bg-[#22933d] text-white text-xl font-bold rounded-xl transition-colors"
              >
                Hop in Queue
              </button>
              {/* Secondary: booking */}
              <button
                type="button"
                onClick={() => setStep('times')}
                className="w-full py-4 px-4 border border-[rgba(255,255,255,0.12)] text-[#d0d6e0] text-base font-medium rounded-xl hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              >
                Book Appointment
              </button>
              <button
                type="button"
                onClick={onClose}
                className="block w-full py-3 text-[#62666d] text-sm hover:text-[#8a8f98] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ────── QUEUE FORM ────── */}
          {step === 'queue' && (
            <div className="p-4">
              <button
                type="button"
                onClick={() => { setStep('choice'); setQueueError(null) }}
                className="flex items-center gap-1 text-sm text-[#7170ff] hover:text-[#828fff] font-medium mb-5 transition-colors"
              >
                &#8592; Back
              </button>

              {queueError && (
                <p className="text-sm text-red-400 bg-[rgba(239,68,68,0.1)] rounded-lg px-3 py-2 mb-4">{queueError}</p>
              )}

              <form onSubmit={handleQueueSubmit} className="space-y-4">
                <p className="text-xs text-[#62666d] pb-1">
                  Joining queue for{' '}
                  <span className="text-[#d0d6e0] font-medium">{barber.first_name}</span>
                </p>

                <div>
                  <label className="block text-sm font-medium text-[#d0d6e0] mb-1">Phone Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={formatPhone(queuePhone)}
                    onChange={(e) => setQueuePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="(555) 123-4567"
                    required
                    autoComplete="off"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#d0d6e0] mb-1">First Name</label>
                  <input
                    type="text"
                    value={queueFirstName}
                    onChange={(e) => setQueueFirstName(e.target.value)}
                    placeholder="Marcus"
                    required
                    autoComplete="off"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#d0d6e0] mb-1">Last Initial</label>
                  <input
                    type="text"
                    value={queueLastInitial}
                    onChange={(e) => setQueueLastInitial(e.target.value.slice(0, 1))}
                    placeholder="J"
                    required
                    maxLength={1}
                    autoComplete="off"
                    className={inputCls}
                  />
                </div>

                <button
                  type="submit"
                  disabled={queueSubmitting}
                  className="w-full py-4 px-4 bg-[#27a644] hover:bg-[#22933d] disabled:opacity-40 text-white text-lg font-semibold rounded-xl transition-colors"
                >
                  {queueSubmitting ? 'Joining…' : 'Join Queue'}
                </button>
              </form>
            </div>
          )}

          {/* ────── QUEUE CONFIRMED ────── */}
          {step === 'queue-confirmed' && (
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-[rgba(39,166,68,0.15)] rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-[#27a644]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#f7f8f8] mb-1">
                {queueExistingStatus ? 'Already in queue!' : "You're in line!"}
              </h3>
              {queueDisplayName && queuePosition != null && (
                <p className="text-[#8a8f98] text-sm mb-4">
                  <span className="text-[#d0d6e0] font-medium">{queueDisplayName}</span>
                  {queueExistingStatus ? ' — ' : ', you are '}
                  <span className="text-[#27a644] font-bold">#{queuePosition}</span> in the queue
                </p>
              )}
              <div className="bg-[#191a1b] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 mb-4">
                <p className="text-xs font-medium text-[#62666d] uppercase tracking-widest mb-1">Barber</p>
                <p className="text-lg font-bold text-[#f7f8f8]">{barber.first_name} {barber.last_name}</p>
              </div>
              <p className="text-xs text-[#62666d]">Watch the TV for your name.</p>
              <p className="text-xs text-[#62666d] mt-1">This screen will close automatically.</p>
            </div>
          )}

          {/* ────── EXTERNAL MODE ────── */}
          {schedulingMode === 'external' && step === 'times' && (
            <div className="p-6 text-center space-y-4">
              <p className="text-[#8a8f98] text-sm">
                {barber.first_name} accepts bookings through an external service.
              </p>
              {externalBookingUrl ? (
                <a
                  href={externalBookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-4 px-4 bg-[#5e6ad2] hover:bg-[#7170ff] text-white text-lg font-semibold rounded-xl transition-colors text-center"
                >
                  Open Booking Page &#8599;
                </a>
              ) : (
                <p className="text-[#62666d] text-sm">No booking URL configured. Contact the shop.</p>
              )}
              <button
                type="button"
                onClick={() => setStep('choice')}
                className="block w-full py-3 px-4 border border-[rgba(255,255,255,0.08)] text-[#8a8f98] font-medium rounded-xl hover:bg-[rgba(255,255,255,0.04)] transition-colors text-sm"
              >
                Back
              </button>
            </div>
          )}

          {/* ────── CONFIRMED ────── */}
          {schedulingMode === 'native' && step === 'confirmed' && confirmed && (
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-[rgba(39,166,68,0.15)] rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-[#27a644]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#f7f8f8] mb-1">You&apos;re booked!</h3>
              <p className="text-[#8a8f98] text-sm mb-6">Show this code when you arrive.</p>

              <div className="bg-[#191a1b] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 mb-4">
                <p className="text-xs font-medium text-[#62666d] uppercase tracking-widest mb-1">
                  Confirmation Code
                </p>
                <p className="text-3xl font-bold text-[#7170ff] tracking-widest">
                  {confirmed.confirmation_code}
                </p>
              </div>

              <div className="space-y-1 text-sm text-[#8a8f98] mb-4">
                <p>
                  <span className="text-[#62666d]">Barber: </span>
                  <span className="font-medium text-[#d0d6e0]">{confirmed.barber_name}</span>
                </p>
                <p>
                  <span className="text-[#62666d]">Time: </span>
                  <span className="font-medium text-[#d0d6e0]">{formatSlotTime(confirmed.start_time)}</span>
                </p>
              </div>

              {/* ── Optional email capture ── */}
              {!emailSaved && !emailDismissed && (
                <div className="mt-2 pt-4 border-t border-[rgba(255,255,255,0.06)] text-left">
                  <p className="text-xs font-medium text-[#62666d] mb-2 text-center">
                    Book faster next time
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => { setEmailInput(e.target.value); setEmailError(null) }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEmail()}
                      placeholder="your@email.com"
                      autoComplete="email"
                      className="flex-1 px-3 py-2 text-sm border border-[rgba(255,255,255,0.1)] rounded-lg text-[#f7f8f8] bg-[#191a1b] placeholder-[#62666d] focus:outline-none focus:ring-2 focus:ring-[#7170ff] focus:border-[#7170ff] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleSaveEmail}
                      disabled={emailSaving}
                      className="px-3 py-2 text-sm font-medium bg-[#5e6ad2] hover:bg-[#7170ff] disabled:opacity-40 text-white rounded-lg transition-colors"
                    >
                      {emailSaving ? '…' : 'Save'}
                    </button>
                  </div>
                  {emailError && <p className="text-xs text-red-400 mt-1">{emailError}</p>}
                  <div className="text-center mt-2">
                    <button
                      type="button"
                      onClick={() => setEmailDismissed(true)}
                      className="text-xs text-[#62666d] hover:text-[#8a8f98] transition-colors"
                    >
                      No thanks
                    </button>
                  </div>
                </div>
              )}
              {emailSaved && (
                <p className="mt-2 pt-4 border-t border-[rgba(255,255,255,0.06)] text-xs text-[#27a644] text-center">
                  &#10003; Email saved — we&apos;ll recognize you next time
                </p>
              )}

              <p className="text-xs text-[#62666d] mt-4">This screen will close automatically.</p>
            </div>
          )}

          {/* ────── INFO FORM ────── */}
          {schedulingMode === 'native' && step === 'info' && selectedSlot && (
            <div className="p-4">
              {/* Selected time summary */}
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
                <div>
                  <p className="text-xs text-[#62666d] uppercase tracking-widest font-medium">Selected Time</p>
                  <p className="text-xl font-bold text-[#f7f8f8]">{formatSlotTime(selectedSlot.start)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep('times'); setFormError(null) }}
                  className="text-sm text-[#7170ff] hover:text-[#828fff] font-medium transition-colors"
                >
                  Change
                </button>
              </div>

              {formError && (
                <p className="text-sm text-red-400 bg-[rgba(239,68,68,0.1)] rounded-lg px-3 py-2 mb-4">{formError}</p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#d0d6e0] mb-1">Phone Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={formatPhone(phone)}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="(555) 123-4567"
                    required
                    autoComplete="off"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#d0d6e0] mb-1">
                    First Name
                    {lookupFound && (
                      <span className="ml-2 text-xs font-normal text-[#27a644]">&#10003; Saved info found</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Marcus"
                    required
                    autoComplete="off"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#d0d6e0] mb-1">Last Initial</label>
                  <input
                    type="text"
                    value={lastInitial}
                    onChange={(e) => setLastInitial(e.target.value.slice(0, 1))}
                    placeholder="J"
                    required
                    maxLength={1}
                    autoComplete="off"
                    className={inputCls}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 px-4 bg-[#5e6ad2] hover:bg-[#7170ff] disabled:opacity-40 text-white text-lg font-semibold rounded-xl transition-colors"
                >
                  {submitting ? 'Booking…' : 'Confirm Booking'}
                </button>
              </form>
            </div>
          )}

          {/* ────── TIMES ────── */}
          {schedulingMode === 'native' && step === 'times' && (
            <div className="p-4 space-y-5">
              {formError && (
                <p className="text-sm text-red-400 bg-[rgba(239,68,68,0.1)] rounded-lg px-3 py-2">{formError}</p>
              )}

              {/* Date quick-select */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {dateOptions.map(({ d, label }) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      selectedDate === d
                        ? 'border-[#7170ff] bg-[rgba(113,112,255,0.12)] text-[#7170ff]'
                        : 'border-[rgba(255,255,255,0.08)] text-[#8a8f98] hover:border-[rgba(255,255,255,0.15)] hover:text-[#d0d6e0]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Loading */}
              {loadingSlots && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[rgba(255,255,255,0.08)] border-t-[#7170ff] rounded-full animate-spin" />
                </div>
              )}

              {/* Error */}
              {slotError && !loadingSlots && (
                <p className="text-sm text-[#8a8f98] text-center py-6">{slotError}</p>
              )}

              {/* No slots */}
              {!loadingSlots && !slotError && availableSlots.length === 0 && (
                <p className="text-sm text-[#8a8f98] text-center py-6">
                  No available times for this day. Try another date.
                </p>
              )}

              {/* Slot lists */}
              {!loadingSlots && availableSlots.length > 0 && (
                <>
                  {/* Preferred times — top 3, prominent */}
                  <div>
                    <p className="text-xs font-semibold text-[#62666d] uppercase tracking-widest mb-2">
                      Next Available
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {preferredSlots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => handleSlotSelect(slot)}
                          className="py-3 rounded-xl border border-[rgba(113,112,255,0.35)] bg-[rgba(113,112,255,0.08)] hover:bg-[rgba(113,112,255,0.18)] hover:border-[#7170ff] transition-colors text-sm font-semibold text-[#7170ff]"
                        >
                          {formatSlotTime(slot.start)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* More times */}
                  {remainingSlots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[#62666d] uppercase tracking-widest mb-2">
                        More Times
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {remainingSlots.map((slot) => (
                          <button
                            key={slot.start}
                            type="button"
                            onClick={() => handleSlotSelect(slot)}
                            className="py-2.5 rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.04)] transition-colors text-sm font-medium text-[#d0d6e0]"
                          >
                            {formatSlotTime(slot.start)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
