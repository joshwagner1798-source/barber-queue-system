'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarberMobileCard } from '@/components/BarberMobileCard'
import { BarberModal } from '@/components/BarberModal'
import { FirstAvailableCard } from './FirstAvailableCard'
import { KioskForm } from '@/app/kiosk/KioskForm'

interface TVBarber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  status: string
  busy_reason: string | null
  free_at: string | null
  blocked_until: string | null
  off_label: string | null
  direct_booking_url?: string | null
  walkin_eligible: boolean
}

interface TVResponse {
  barbers: TVBarber[]
  shop_booking_url: string | null
}

interface QueueEntry {
  initialBarberId: string | undefined
  initialPreference: 'ANY' | 'PREFERRED'
}

interface Props {
  shopId: string
}

export function MobileQueue({ shopId }: Props) {
  const [barbers, setBarbers] = useState<TVBarber[]>([])
  const [shopBookingUrl, setShopBookingUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedBarber, setSelectedBarber] = useState<TVBarber | null>(null)
  const [screen, setScreen] = useState<'grid' | 'form'>('grid')
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tv?shop_id=${encodeURIComponent(shopId)}`)
      if (!res.ok) throw new Error(`/api/tv returned ${res.status}`)
      const data: TVResponse = await res.json()
      const freshBarbers = data.barbers ?? []
      setBarbers(freshBarbers)
      setShopBookingUrl(data.shop_booking_url ?? null)
      // Keep modal in sync with freshest status after each poll
      setSelectedBarber(prev =>
        prev ? freshBarbers.find((b) => b.id === prev.id) ?? null : null
      )
      setError(null)
    } catch (err) {
      setError('Unable to load barber availability. Please try again.')
      console.error('[MobileQueue] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [shopId])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleHopInQueue = (entry: QueueEntry) => {
    setSelectedBarber(null)
    setQueueEntry(entry)
    setScreen('form')
  }

  const handleBack = () => {
    setScreen('grid')
    setQueueEntry(null)
  }

  // ── Form screen ────────────────────────────────────────────────────────────
  if (screen === 'form' && queueEntry) {
    return (
      <div className="min-h-full flex flex-col">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm px-4 pt-4 pb-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex-1 flex items-center justify-center p-4">
          <KioskForm
            shopId={shopId}
            initialBarberId={queueEntry.initialBarberId}
            initialPreference={queueEntry.initialPreference}
          />
        </div>
      </div>
    )
  }

  // ── Grid screen ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full px-4 py-6 space-y-3">
      <h2 className="text-white font-bold text-xl mb-4">Who do you want?</h2>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-full h-20 bg-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm text-center py-4">{error}</p>
      )}

      {!loading && !error && (
        <>
          <FirstAvailableCard
            shopBookingUrl={shopBookingUrl}
            onQueue={() => handleHopInQueue({ initialBarberId: undefined, initialPreference: 'ANY' })}
          />

          {barbers.map((barber) => (
            <BarberMobileCard
              key={barber.id}
              firstName={barber.first_name}
              lastName={barber.last_name}
              avatarUrl={barber.avatar_url}
              status={barber.status}
              busyReason={barber.busy_reason}
              freeAt={barber.free_at}
              blockedUntil={barber.blocked_until}
              offLabel={barber.off_label}
              onClick={() => setSelectedBarber(barber)}
            />
          ))}
        </>
      )}

      {/* Modal */}
      {selectedBarber && (
        <BarberModal
          isOpen={true}
          onClose={() => setSelectedBarber(null)}
          onQueue={() => handleHopInQueue({
            initialBarberId: selectedBarber.id,
            initialPreference: 'PREFERRED',
          })}
          firstName={selectedBarber.first_name}
          lastName={selectedBarber.last_name}
          avatarUrl={selectedBarber.avatar_url}
          status={selectedBarber.status}
          busyReason={selectedBarber.busy_reason}
          freeAt={selectedBarber.free_at}
          blockedUntil={selectedBarber.blocked_until}
          offLabel={selectedBarber.off_label}
          walkinEligible={selectedBarber.walkin_eligible}
          directBookingUrl={selectedBarber.direct_booking_url}
          shopBookingUrl={shopBookingUrl}
        />
      )}
    </div>
  )
}
