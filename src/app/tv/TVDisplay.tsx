'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarberStatusCard } from './BarberStatusCard'
import { WaitingList } from './WaitingList'
import { NowServing } from './NowServing'

// ---------------------------------------------------------------------------
// Types for TV state (display-safe — no phone, no client_id)
// ---------------------------------------------------------------------------

interface TVBarberStatus {
  shop_id: string
  barber_id: string
  status: string
  status_detail: string | null
  free_at: string | null
}

interface TVWalkin {
  id: string
  status: string
  display_name: string | null
  position: number
  assigned_barber_id: string | null
  called_at: string | null
  preference_type: string
  preferred_barber_id: string | null
}

interface TVBarber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  display_order: number
}

// ---------------------------------------------------------------------------
// Main TV Display component
// ---------------------------------------------------------------------------

interface TVDisplayProps {
  shopId?: string
}

export function TVDisplay({ shopId }: TVDisplayProps) {
  const [statuses, setStatuses] = useState<TVBarberStatus[]>([])
  const [walkins, setWalkins] = useState<TVWalkin[]>([])
  const [barbers, setBarbers] = useState<TVBarber[]>([])

  // Build name lookup
  const barberNames = new Map<string, string>()
  for (const b of barbers) {
    barberNames.set(b.id, `${b.first_name} ${b.last_name}`)
  }

  // Fetch all data from /api/tv
  const fetchData = useCallback(async () => {
    try {
      const url = shopId ? `/api/tv?shop_id=${encodeURIComponent(shopId)}` : '/api/tv'
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      setStatuses(data.barber_statuses ?? [])
      setWalkins(data.walkins ?? [])
      setBarbers(data.barbers ?? [])
    } catch {
      // Silently retry on next interval
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('tv-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barber_status' },
        () => {
          // Refetch on any barber_status change
          fetchData()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'walkins' },
        () => {
          // Refetch on any walkins change
          fetchData()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  // 60s safety-net full refresh
  useEffect(() => {
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [fetchData])

  // ---------------------------------------------------------------------------
  // Derive display data
  // ---------------------------------------------------------------------------

  // Map barber_id → active walkin (CALLED or IN_SERVICE)
  const barberServingMap = new Map<string, TVWalkin>()
  for (const w of walkins) {
    if ((w.status === 'CALLED' || w.status === 'IN_SERVICE') && w.assigned_barber_id) {
      barberServingMap.set(w.assigned_barber_id, w)
    }
  }

  // Waiting list
  const waiting = walkins
    .filter((w) => w.status === 'WAITING')
    .sort((a, b) => a.position - b.position)
    .map((w) => ({
      id: w.id,
      position: w.position,
      displayName: w.display_name ?? 'Guest',
      preferenceType: w.preference_type,
      preferredBarberName: w.preferred_barber_id
        ? barberNames.get(w.preferred_barber_id) ?? null
        : null,
    }))

  // Now serving
  const nowServing = walkins
    .filter((w) => w.status === 'CALLED' || w.status === 'IN_SERVICE')
    .filter((w) => w.assigned_barber_id)
    .map((w) => ({
      id: w.id,
      displayName: w.display_name ?? 'Guest',
      barberName: barberNames.get(w.assigned_barber_id!) ?? 'Barber',
      status: w.status as 'CALLED' | 'IN_SERVICE',
    }))

  return (
    <div className="min-h-screen bg-secondary-950 p-6 flex flex-col">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-4xl font-bold text-white">Sharper Image</h1>
        <p className="text-secondary-400 text-lg">Walk-In Queue</p>
      </header>

      {/* Barber status cards */}
      <section className="mb-8">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {barbers.map((b) => {
            const bs = statuses.find((s) => s.barber_id === b.id)
            const serving = barberServingMap.get(b.id)
            return (
              <BarberStatusCard
                key={b.id}
                barberName={`${b.first_name} ${b.last_name}`}
                status={bs?.status ?? 'UNKNOWN'}
                statusDetail={bs?.status_detail ?? null}
                freeAt={bs?.free_at ?? null}
                nowServingName={serving?.display_name ?? null}
              />
            )
          })}
        </div>
      </section>

      {/* Queue sections */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <NowServing entries={nowServing} />
        <WaitingList entries={waiting} />
      </div>

      {/* Footer */}
      <footer className="mt-8 pt-4 border-t border-secondary-800 text-center">
        <p className="text-secondary-500 text-sm">
          Walk-ins are assigned automatically to the next available barber.
          Please remain inside the shop.
        </p>
      </footer>
    </div>
  )
}
