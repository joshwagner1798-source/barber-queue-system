'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { submitWalkin, checkInWalkin, lookupByPhone } from '@/lib/kiosk/actions'
import type { KioskBarber } from '@/lib/kiosk/barbers'

type Screen = 'form' | 'confirmation' | 'existing' | 'checkedIn'

interface KioskFormProps {
  shopId?: string
}

export function KioskForm({ shopId }: KioskFormProps) {
  const [barbers, setBarbers] = useState<KioskBarber[]>([])

  useEffect(() => {
    const url = shopId
      ? `/api/kiosk/barbers?shop_id=${encodeURIComponent(shopId)}`
      : '/api/kiosk/barbers'
    fetch(url)
      .then((r) => r.json())
      .then((data: KioskBarber[]) => setBarbers(data))
      .catch((err) => console.error('[KioskForm] failed to load barbers:', err))
  }, [shopId])

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [phone, setPhone] = useState('')
  const [preferenceType, setPreferenceType] = useState<'ANY' | 'PREFERRED'>('ANY')
  const [preferredBarberId, setPreferredBarberId] = useState<string | null>(null)

  // UI state
  const [screen, setScreen] = useState<Screen>('form')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Result state
  const [position, setPosition] = useState<number | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [existingStatus, setExistingStatus] = useState<string | null>(null)
  const [walkinId, setWalkinId] = useState<string | null>(null)
  const [assignedBarberName, setAssignedBarberName] = useState<string | null>(null)

  // TEMP debug panel — remove in final commit
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [debugVisible, setDebugVisible] = useState(false)
  const dbg = useRef((msg: string) => setDebugLog((l) => [...l.slice(-8), msg]))

  // Auto-reset to form after 30s on non-form screens
  const resetToForm = useCallback(() => {
    setScreen('form')
    setFirstName('')
    setLastInitial('')
    setPhone('')
    setPreferenceType('ANY')
    setPreferredBarberId(null)
    setError(null)
    setPosition(null)
    setDisplayName(null)
    setExistingStatus(null)
    setWalkinId(null)
    setAssignedBarberName(null)
  }, [])

  useEffect(() => {
    if (screen === 'form') return
    const timer = setTimeout(resetToForm, 30_000)
    return () => clearTimeout(timer)
  }, [screen, resetToForm])

  // Format phone display
  const formatPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const payload = {
        firstName,
        lastInitial,
        phone,
        preferenceType,
        preferredBarberId: preferenceType === 'PREFERRED' ? preferredBarberId : null,
        shopId,
      }
      dbg.current(`submit → ${JSON.stringify(payload)}`)
      const result = await submitWalkin(payload)
      dbg.current(`result ← ${JSON.stringify(result)}`)

      if (!result.success) {
        setError(result.error ?? 'Something went wrong')
        return
      }

      setWalkinId(result.walkinId ?? null)
      setDisplayName(result.displayName ?? null)

      if (result.existingStatus) {
        setExistingStatus(result.existingStatus)
        setPosition(result.existingPosition ?? null)
        setAssignedBarberName(result.assignedBarberName ?? null)
        setScreen('existing')
      } else {
        setPosition(result.position ?? null)
        setScreen('confirmation')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCheckIn = async () => {
    if (!walkinId) return
    setIsSubmitting(true)
    try {
      dbg.current(`checkIn → ${walkinId}`)
      const result = await checkInWalkin(walkinId)
      dbg.current(`checkIn ← ${JSON.stringify(result)}`)
      if (result.success) {
        setScreen('checkedIn')
      } else {
        setError(result.error ?? 'Check-in failed')
      }
    } catch {
      setError('Check-in failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLookup = async () => {
    if (phone.replace(/\D/g, '').length !== 10) {
      setError('Enter your 10-digit phone number to check status')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      dbg.current(`lookup → phone=${phone} shopId=${shopId}`)
      const result = await lookupByPhone(phone, shopId)
      dbg.current(`lookup ← ${JSON.stringify(result)}`)
      if (result.found && result.walkin) {
        setWalkinId(result.walkin.id)
        setDisplayName(result.walkin.displayName)
        setExistingStatus(result.walkin.status)
        setPosition(result.walkin.position)
        setAssignedBarberName(result.walkin.assignedBarberName)
        setScreen('existing')
      } else {
        setError('No active walk-in found for this number')
      }
    } catch {
      setError('Lookup failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // -----------------------------------------------------------------------
  // Confirmation screen
  // -----------------------------------------------------------------------
  if (screen === 'confirmation') {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="text-6xl mb-4">&#10003;</div>
        <h2 className="text-2xl font-bold text-secondary-900 mb-2">
          You&apos;re in line!
        </h2>
        <p className="text-lg text-secondary-600 mb-6">
          <span className="font-semibold text-secondary-900">{displayName}</span>,
          you are <span className="font-bold text-primary-600">#{position}</span> in the queue.
        </p>
        <p className="text-sm text-secondary-500 mb-8">
          Watch the TV for your name. The screen will reset shortly.
        </p>
        <Button variant="outline" onClick={resetToForm}>
          Done
        </Button>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Existing entry screen
  // -----------------------------------------------------------------------
  if (screen === 'existing') {
    const statusLabel =
      existingStatus === 'CALLED'
        ? 'NOW SERVING'
        : existingStatus === 'IN_SERVICE'
          ? 'IN SERVICE'
          : `#${position} in line`

    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-secondary-900 mb-2">
          Welcome back, {displayName}!
        </h2>
        <p className="text-lg text-secondary-600 mb-2">
          Your status: <span className="font-bold text-primary-600">{statusLabel}</span>
        </p>
        {assignedBarberName && (
          <p className="text-secondary-600 mb-4">
            Barber: <span className="font-semibold">{assignedBarberName}</span>
          </p>
        )}

        {existingStatus === 'CALLED' && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-secondary-500">
              Tap below to confirm you&apos;re here:
            </p>
            <Button
              size="lg"
              onClick={handleCheckIn}
              isLoading={isSubmitting}
              className="w-full text-lg py-4"
            >
              Check In
            </Button>
          </div>
        )}

        <div className="mt-6">
          <Button variant="outline" onClick={resetToForm}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Checked-in screen
  // -----------------------------------------------------------------------
  if (screen === 'checkedIn') {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="text-6xl mb-4">&#128136;</div>
        <h2 className="text-2xl font-bold text-secondary-900 mb-2">
          You&apos;re checked in!
        </h2>
        <p className="text-lg text-secondary-600 mb-6">
          Head to your barber{assignedBarberName ? `, ${assignedBarberName}` : ''}.
        </p>
        <Button variant="outline" onClick={resetToForm}>
          Done
        </Button>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Main form screen
  // -----------------------------------------------------------------------
  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
      <h1 className="text-3xl font-bold text-secondary-900 text-center mb-2">
        Walk-In Sign Up
      </h1>
      <p className="text-secondary-500 text-center mb-8">
        Enter your info to join the queue
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="firstName"
          label="First Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Marcus"
          required
          autoComplete="off"
          className="text-lg py-3"
        />

        <Input
          id="lastInitial"
          label="Last Initial"
          value={lastInitial}
          onChange={(e) => setLastInitial(e.target.value.slice(0, 1))}
          placeholder="J"
          required
          maxLength={1}
          autoComplete="off"
          className="text-lg py-3"
        />

        <Input
          id="phone"
          label="Phone Number"
          type="tel"
          inputMode="numeric"
          value={formatPhone(phone)}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="(555) 123-4567"
          required
          autoComplete="off"
          className="text-lg py-3"
        />

        {/* Preference toggle */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-2">
            Barber Preference
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setPreferenceType('ANY')
                setPreferredBarberId(null)
              }}
              className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                preferenceType === 'ANY'
                  ? 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-secondary-200 text-secondary-600 hover:border-secondary-300'
              }`}
            >
              First Available
            </button>
            <button
              type="button"
              onClick={() => setPreferenceType('PREFERRED')}
              className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                preferenceType === 'PREFERRED'
                  ? 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-secondary-200 text-secondary-600 hover:border-secondary-300'
              }`}
            >
              Preferred Barber
            </button>
          </div>
        </div>

        {/* Barber dropdown */}
        {preferenceType === 'PREFERRED' && (
          <div>
            <label
              htmlFor="barber"
              className="block text-sm font-medium text-secondary-700 mb-1"
            >
              Select Barber
            </label>
            <select
              id="barber"
              value={preferredBarberId ?? ''}
              onChange={(e) => setPreferredBarberId(e.target.value || null)}
              className="block w-full px-3 py-3 border border-secondary-300 rounded-lg shadow-sm text-lg text-secondary-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            >
              <option value="">Choose a barber...</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}

        {/* TEMP debug panel — remove in final commit */}
        {debugVisible && (
          <div className="bg-zinc-900 text-green-400 font-mono text-xs rounded p-2 space-y-0.5 border border-green-600/40">
            <p className="text-green-300 font-semibold">DEBUG</p>
            <p>shopId: {shopId ?? '(none — using fallback)'}</p>
            {debugLog.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        )}
        <button
          type="button"
          onClick={() => setDebugVisible((v) => !v)}
          className="text-[10px] text-secondary-300 underline"
        >
          {debugVisible ? 'hide debug' : 'debug'}
        </button>

        <Button
          type="submit"
          size="lg"
          isLoading={isSubmitting}
          className="w-full text-lg py-4"
        >
          Join Queue
        </Button>
      </form>

      {/* Status lookup */}
      <div className="mt-6 pt-6 border-t border-secondary-200 text-center">
        <p className="text-sm text-secondary-500 mb-3">
          Already signed up? Enter your phone to check status.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLookup}
          isLoading={isSubmitting}
        >
          Check My Status
        </Button>
      </div>
    </div>
  )
}
