'use client'

import { useState, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookingBarber {
  id: string
  first_name: string
  last_name: string
  bio: string | null
  photo_url: string | null
  has_calendar: boolean
  first_available?: string | null
  total_available_slots?: number
}

interface BookingSlot {
  start: string
  end: string
  status: 'AVAILABLE' | 'BUSY' | 'TOO_SOON' | 'OUTSIDE_HOURS'
}

interface ConfirmationData {
  confirmation_code: string
  barber_name: string
  start_time: string
  end_time: string
  service_type: string | null
}

type Step = 'barber' | 'date' | 'slot' | 'info' | 'confirmed'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHOP_ID = process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID ?? ''
const DEFAULT_DURATION = 30

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatConfirmationDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
}

function formatConfirmationTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function getMaxDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepHeader({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-medium text-secondary-400 uppercase tracking-wide mb-1">
        Step {step} of {total}
      </p>
      <h2 className="text-2xl font-bold text-secondary-900">{label}</h2>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm text-secondary-500 hover:text-secondary-700 mb-6 transition-colors"
    >
      <span>&#8592;</span> Back
    </button>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="w-8 h-8 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function BookPage() {
  const [step, setStep] = useState<Step>('barber')

  // Selections
  const [selectedBarber, setSelectedBarber] = useState<BookingBarber | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)

  // Form fields (Step 4)
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceType] = useState('Haircut')

  // Data
  const [barbers, setBarbers] = useState<BookingBarber[]>([])
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null)

  // UI state
  const [loadingBarbers, setLoadingBarbers] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)

  // Returning-customer lookup state
  const [lookedUpPhone, setLookedUpPhone] = useState('')
  const [lookupFound, setLookupFound]     = useState(false)

  // Post-confirmation email capture
  const [emailInput, setEmailInput]         = useState('')
  const [emailSaved, setEmailSaved]         = useState(false)
  const [emailSaving, setEmailSaving]       = useState(false)
  const [emailError, setEmailError]         = useState<string | null>(null)
  const [emailDismissed, setEmailDismissed] = useState(false)

  // ── Load barbers on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams()
    if (SHOP_ID) params.set('shop_id', SHOP_ID)
    // Include today's date to get first_available per barber
    params.set('date', getTodayStr())

    fetch(`/api/booking/barbers?${params}`)
      .then((r) => r.json())
      .then((data: BookingBarber[]) => setBarbers(data))
      .catch(() => setError('Failed to load barbers'))
      .finally(() => setLoadingBarbers(false))
  }, [])

  // ── Pre-select barber from URL query param ────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const barberId = params.get('barber_id')
    const startParam = params.get('start')
    if (barberId && barbers.length > 0) {
      const match = barbers.find((b) => b.id === barberId)
      if (match) {
        setSelectedBarber(match)
        if (startParam) {
          const dateStr = new Date(startParam).toISOString().slice(0, 10)
          setSelectedDate(dateStr)
          setStep('slot')
        } else {
          setStep('date')
        }
      }
    }
  }, [barbers])

  // ── Load slots when barber + date selected ────────────────────────────────
  const fetchSlots = useCallback(async (barberId: string, date: string) => {
    setLoadingSlots(true)
    setSlotError(null)
    setSlots([])

    const params = new URLSearchParams({
      barber_id: barberId,
      date,
      service_duration: String(DEFAULT_DURATION),
    })
    if (SHOP_ID) params.set('shop_id', SHOP_ID)

    try {
      const r = await fetch(`/api/booking/slots?${params}`)
      const data = await r.json()
      if (!r.ok) {
        setSlotError(data.error ?? 'Failed to load slots')
        return
      }
      setSlots(data.slots ?? [])
      if ((data.slots ?? []).filter((s: BookingSlot) => s.status === 'AVAILABLE').length === 0) {
        setSlotError('No available slots for this date. Try another day.')
      }
    } catch {
      setSlotError('Failed to load slots. Please try again.')
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  // ── Post-confirmation email save ─────────────────────────────────────────
  const handleSaveEmail = async () => {
    if (!emailInput.trim() || !confirmation) return
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
          confirmation_code: confirmation.confirmation_code,
          shop_id: SHOP_ID || undefined,
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

  // ── Returning-customer lookup ─────────────────────────────────────────────
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
    if (SHOP_ID) params.set('shop_id', SHOP_ID)

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
  }, [phone, lookedUpPhone])

  const handleBarberSelect = (barber: BookingBarber) => {
    setSelectedBarber(barber)
    setSelectedDate('')
    setSelectedSlot(null)
    setStep('date')
    setError(null)
  }

  const handleDateSelect = (date: string) => {
    setSelectedDate(date)
    setSelectedSlot(null)
    setStep('slot')
    if (selectedBarber) {
      fetchSlots(selectedBarber.id, date)
    }
  }

  const handleSlotSelect = (slot: BookingSlot) => {
    setSelectedSlot(slot)
    setStep('info')
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBarber || !selectedSlot) return
    setError(null)
    setSubmitting(true)

    try {
      const body = {
        barber_id: selectedBarber.id,
        start_time: selectedSlot.start,
        end_time: selectedSlot.end,
        first_name: firstName.trim(),
        last_initial: lastInitial.trim(),
        phone: phone.replace(/\D/g, ''),
        service_type: serviceType,
        shop_id: SHOP_ID || undefined,
      }

      const r = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await r.json()

      if (r.status === 409) {
        setError('That slot was just taken. Please pick a different time.')
        setStep('slot')
        if (selectedBarber) fetchSlots(selectedBarber.id, selectedDate)
        return
      }

      if (!r.ok) {
        setError(data.error ?? 'Booking failed. Please try again.')
        return
      }

      setConfirmation({
        confirmation_code: data.confirmation_code,
        barber_name: data.barber_name,
        start_time: data.start_time,
        end_time: data.end_time,
        service_type: data.service_type,
      })
      setStep('confirmed')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-secondary-50 flex items-start justify-center p-0 sm:p-6">
      <div className="w-full sm:max-w-md bg-white min-h-screen sm:min-h-0 sm:rounded-2xl sm:shadow-xl p-6 sm:p-8">

        {/* ── STEP: Confirmed ─────────────────────────────────────────── */}
        {step === 'confirmed' && confirmation && (
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-secondary-900 mb-1">Booking Confirmed!</h2>
            <p className="text-secondary-500 text-sm mb-8">You&apos;re all set. Save your confirmation code.</p>

            <div className="w-full bg-secondary-50 rounded-xl p-5 mb-6 text-left space-y-3">
              <div>
                <p className="text-xs font-medium text-secondary-400 uppercase tracking-wide">Confirmation Code</p>
                <p className="text-3xl font-bold text-primary-600 tracking-widest mt-1">
                  {confirmation.confirmation_code}
                </p>
              </div>
              <div className="border-t border-secondary-100 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-500">Barber</span>
                  <span className="font-medium text-secondary-900">{confirmation.barber_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-500">Date</span>
                  <span className="font-medium text-secondary-900">
                    {formatConfirmationDate(confirmation.start_time)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-500">Time</span>
                  <span className="font-medium text-secondary-900">
                    {formatConfirmationTime(confirmation.start_time)}
                  </span>
                </div>
                {confirmation.service_type && (
                  <div className="flex justify-between text-sm">
                    <span className="text-secondary-500">Service</span>
                    <span className="font-medium text-secondary-900">{confirmation.service_type}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Optional email capture ── */}
            {!emailSaved && !emailDismissed && (
              <div className="w-full mb-6 pt-4 border-t border-secondary-100">
                <p className="text-xs font-medium text-secondary-500 mb-2 text-center">
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
                    className="flex-1 px-3 py-2 text-sm border-2 border-secondary-200 rounded-lg text-secondary-900 placeholder-secondary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveEmail}
                    disabled={emailSaving}
                    className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg transition-colors"
                  >
                    {emailSaving ? '…' : 'Save'}
                  </button>
                </div>
                {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
                <div className="text-center mt-2">
                  <button
                    type="button"
                    onClick={() => setEmailDismissed(true)}
                    className="text-xs text-secondary-400 hover:text-secondary-500 transition-colors"
                  >
                    No thanks
                  </button>
                </div>
              </div>
            )}
            {emailSaved && (
              <p className="w-full mb-6 pt-4 border-t border-secondary-100 text-xs text-green-600 text-center">
                &#10003; Email saved — we&apos;ll recognize you next time
              </p>
            )}

            <a
              href="/kiosk"
              className="w-full block text-center py-3 px-4 rounded-lg border-2 border-secondary-200 text-secondary-600 font-medium hover:border-secondary-300 transition-colors text-sm"
            >
              Back to Walk-In Queue
            </a>
          </div>
        )}

        {/* ── STEP 1: Pick Barber ──────────────────────────────────────── */}
        {step === 'barber' && (
          <div>
            <h1 className="text-3xl font-bold text-secondary-900 mb-1">Book an Appointment</h1>
            <p className="text-secondary-500 text-sm mb-8">Choose your barber to get started</p>

            {loadingBarbers && <LoadingSpinner />}

            {error && !loadingBarbers && (
              <p className="text-sm text-red-600 text-center py-4">{error}</p>
            )}

            {!loadingBarbers && !error && (
              <div className="space-y-3">
                {barbers.map((barber) => (
                  <button
                    key={barber.id}
                    type="button"
                    onClick={() => handleBarberSelect(barber)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-secondary-100 hover:border-primary-300 hover:bg-primary-50 transition-all text-left"
                  >
                    {/* Photo */}
                    <div className="w-14 h-14 rounded-full bg-secondary-100 flex-shrink-0 overflow-hidden">
                      {barber.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={barber.photo_url}
                          alt={`${barber.first_name} ${barber.last_name}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-secondary-400 text-lg font-bold">
                          {barber.first_name[0]}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-secondary-900">
                        {barber.first_name} {barber.last_name}
                      </p>
                      {barber.bio && (
                        <p className="text-xs text-secondary-500 truncate mt-0.5">{barber.bio}</p>
                      )}
                      {barber.first_available != null && (
                        <p className="text-xs text-green-600 font-medium mt-1">
                          Next available: {formatSlotTime(barber.first_available)}
                        </p>
                      )}
                      {!barber.has_calendar && (
                        <p className="text-xs text-secondary-400 mt-1">Walk-in only</p>
                      )}
                    </div>

                    <svg className="w-5 h-5 text-secondary-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Pick Date ────────────────────────────────────────── */}
        {step === 'date' && selectedBarber && (
          <div>
            <BackButton onClick={() => setStep('barber')} />
            <StepHeader step={2} total={4} label="Pick a Date" />

            <div className="mb-2">
              <p className="text-sm text-secondary-500 mb-1">
                Booking with{' '}
                <span className="font-semibold text-secondary-900">
                  {selectedBarber.first_name} {selectedBarber.last_name}
                </span>
              </p>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Select Date
              </label>
              <input
                type="date"
                min={getTodayStr()}
                max={getMaxDateStr()}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) handleDateSelect(e.target.value)
                }}
                className="block w-full px-4 py-3 border-2 border-secondary-200 rounded-xl text-lg text-secondary-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-xs text-secondary-400 mt-2">Available up to 14 days out</p>
            </div>

            {/* Quick date buttons */}
            <div className="mt-6">
              <p className="text-sm font-medium text-secondary-700 mb-3">Quick select</p>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }, (_, i) => {
                  const d = new Date()
                  d.setDate(d.getDate() + i)
                  const dateStr = d.toISOString().slice(0, 10)
                  const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => handleDateSelect(dateStr)}
                      className={`py-2.5 px-2 rounded-lg border-2 text-xs font-medium transition-colors ${
                        selectedDate === dateStr
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-secondary-200 text-secondary-600 hover:border-secondary-300'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Pick Slot ────────────────────────────────────────── */}
        {step === 'slot' && selectedBarber && selectedDate && (
          <div>
            <BackButton onClick={() => setStep('date')} />
            <StepHeader step={3} total={4} label="Pick a Time" />

            <p className="text-sm text-secondary-500 mb-6">
              {formatDate(selectedDate)} with{' '}
              <span className="font-semibold text-secondary-900">{selectedBarber.first_name}</span>
            </p>

            {loadingSlots && <LoadingSpinner />}

            {!loadingSlots && slotError && (
              <div className="text-center py-6">
                <p className="text-sm text-secondary-500">{slotError}</p>
                <button
                  type="button"
                  onClick={() => setStep('date')}
                  className="mt-4 text-sm text-primary-600 font-medium hover:underline"
                >
                  Try a different date
                </button>
              </div>
            )}

            {!loadingSlots && !slotError && (
              <div className="grid grid-cols-3 gap-2">
                {slots
                  .filter((s) => s.status === 'AVAILABLE')
                  .map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => handleSlotSelect(slot)}
                      className={`py-3 px-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        selectedSlot?.start === slot.start
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-secondary-200 text-secondary-700 hover:border-primary-300 hover:bg-primary-50'
                      }`}
                    >
                      {formatSlotTime(slot.start)}
                    </button>
                  ))}
              </div>
            )}

            {!loadingSlots && !slotError && slots.filter((s) => s.status === 'AVAILABLE').length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-secondary-500">No available times for this date.</p>
                <button
                  type="button"
                  onClick={() => setStep('date')}
                  className="mt-4 text-sm text-primary-600 font-medium hover:underline"
                >
                  Try a different date
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Enter Info ───────────────────────────────────────── */}
        {step === 'info' && selectedBarber && selectedSlot && (
          <div>
            <BackButton onClick={() => setStep('slot')} />
            <StepHeader step={4} total={4} label="Your Info" />

            {/* Appointment summary */}
            <div className="bg-secondary-50 rounded-xl p-4 mb-6 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-secondary-500">Barber</span>
                <span className="font-medium text-secondary-900">
                  {selectedBarber.first_name} {selectedBarber.last_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-500">Date</span>
                <span className="font-medium text-secondary-900">{formatDate(selectedDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-500">Time</span>
                <span className="font-medium text-secondary-900">{formatSlotTime(selectedSlot.start)}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={formatPhone(phone)}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="(555) 123-4567"
                  required
                  autoComplete="tel"
                  className="block w-full px-4 py-3 border-2 border-secondary-200 rounded-xl text-lg text-secondary-900 placeholder-secondary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  First Name
                  {lookupFound && (
                    <span className="ml-2 text-xs font-normal text-green-600">&#10003; Saved info found</span>
                  )}
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Marcus"
                  required
                  autoComplete="given-name"
                  className="block w-full px-4 py-3 border-2 border-secondary-200 rounded-xl text-lg text-secondary-900 placeholder-secondary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Last Initial
                </label>
                <input
                  type="text"
                  value={lastInitial}
                  onChange={(e) => setLastInitial(e.target.value.slice(0, 1))}
                  placeholder="J"
                  required
                  maxLength={1}
                  autoComplete="off"
                  className="block w-full px-4 py-3 border-2 border-secondary-200 rounded-xl text-lg text-secondary-900 placeholder-secondary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 px-4 bg-primary-600 text-white font-semibold text-lg rounded-xl hover:bg-primary-700 active:bg-primary-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Booking...
                  </span>
                ) : (
                  'Confirm Booking'
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
