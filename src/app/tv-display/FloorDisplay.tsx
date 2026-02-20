'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WaitingList } from '@/app/tv/WaitingList'
import { FloorBarberCard } from './FloorBarberCard'

// ---------------------------------------------------------------------------
// Types — same shape as /api/tv response (display-safe)
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
// Wait estimate — derived from /api/tv data (no auth needed)
// ---------------------------------------------------------------------------

function computeWaitSecs(statuses: TVBarberStatus[], waitingCount: number): number {
  if (waitingCount === 0) return 0
  if (statuses.some((s) => s.status === 'FREE')) return 0
  const freeAts = statuses
    .filter((s) => s.status === 'BUSY' && s.free_at)
    .map((s) => new Date(s.free_at!).getTime())
  if (freeAts.length === 0) return waitingCount * 20 * 60
  return Math.max(0, Math.round((Math.min(...freeAts) - Date.now()) / 1000))
}

// ---------------------------------------------------------------------------
// FloorDisplay — TV floor layout with horizontal barber row + right sidebar
// ---------------------------------------------------------------------------

export function FloorDisplay() {
  const [statuses, setStatuses] = useState<TVBarberStatus[]>([])
  const [walkins, setWalkins] = useState<TVWalkin[]>([])
  const [barbers, setBarbers] = useState<TVBarber[]>([])
  const [displaySecs, setDisplaySecs] = useState(0)

  // Fetch from existing /api/tv — reuse same endpoint as /tv
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tv')
      if (!res.ok) return
      const data = await res.json()
      setStatuses(data.barber_statuses ?? [])
      setWalkins(data.walkins ?? [])
      setBarbers(data.barbers ?? [])
    } catch {
      // Silently retry on next cycle
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime — separate channel name to coexist with /tv page if both are open
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('floor-display-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barber_status' },
        () => fetchData(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'walkins' },
        () => fetchData(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  // 60s safety-net full refresh
  useEffect(() => {
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  // Resync countdown when data changes
  useEffect(() => {
    const waitCount = walkins.filter((w) => w.status === 'WAITING').length
    setDisplaySecs(computeWaitSecs(statuses, waitCount))
  }, [statuses, walkins])

  // Live second-by-second tick
  useEffect(() => {
    const id = setInterval(
      () => setDisplaySecs((prev) => Math.max(0, prev - 1)),
      1000,
    )
    return () => clearInterval(id)
  }, [])

  // ---------------------------------------------------------------------------
  // Derived display data
  // ---------------------------------------------------------------------------

  const barberNames = new Map(barbers.map((b) => [b.id, `${b.first_name} ${b.last_name}`]))

  const barberServingMap = new Map<string, TVWalkin>()
  for (const w of walkins) {
    if ((w.status === 'CALLED' || w.status === 'IN_SERVICE') && w.assigned_barber_id) {
      barberServingMap.set(w.assigned_barber_id, w)
    }
  }

  const waitingEntries = walkins
    .filter((w) => w.status === 'WAITING')
    .sort((a, b) => a.position - b.position)
    .map((w) => ({
      id: w.id,
      position: w.position,
      displayName: w.display_name ?? 'Guest',
      preferenceType: w.preference_type,
      preferredBarberName: w.preferred_barber_id
        ? (barberNames.get(w.preferred_barber_id) ?? null)
        : null,
    }))

  const mm = String(Math.floor(displaySecs / 60)).padStart(2, '0')
  const ss = String(displaySecs % 60).padStart(2, '0')
  const anyFree = statuses.some((s) => s.status === 'FREE')

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-secondary-950 flex">
      {/* ── Main area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white">Sharper Image</h1>
          <p className="text-secondary-400 text-lg">Live Barber Status</p>
        </header>

        {/* Horizontal barber card row */}
        <div className="flex flex-row flex-wrap gap-4 pb-4">
          {barbers.map((b) => {
            const bs = statuses.find((s) => s.barber_id === b.id)
            const serving = barberServingMap.get(b.id)
            const initials = `${b.first_name[0] ?? ''}${b.last_name[0] ?? ''}`.toUpperCase()
            return (
              <FloorBarberCard
                key={b.id}
                name={`${b.first_name} ${b.last_name}`}
                initials={initials}
                avatarUrl={b.avatar_url}
                status={bs?.status ?? 'UNKNOWN'}
                freeAt={bs?.free_at ?? null}
                nowServingName={serving?.display_name ?? null}
              />
            )
          })}
          {barbers.length === 0 && (
            <p className="text-secondary-500 text-xl mt-8">No barbers on the floor today.</p>
          )}
        </div>
      </div>

      {/* ── Right sidebar ───────────────────────────────────────── */}
      <aside className="w-72 xl:w-80 bg-secondary-900 border-l border-secondary-800 p-6 flex flex-col gap-6">
        {/* Estimated wait countdown */}
        <div>
          <p className="text-xs font-semibold text-secondary-400 uppercase tracking-widest mb-3">
            Estimated Wait
          </p>
          <div className="text-7xl font-mono font-bold text-white tabular-nums leading-none">
            {mm}:{ss}
          </div>
          {anyFree && waitingEntries.length === 0 ? (
            <p className="text-emerald-400 text-sm mt-3 font-medium">Walk right in!</p>
          ) : waitingEntries.length > 0 ? (
            <p className="text-secondary-400 text-sm mt-3">
              {waitingEntries.length} waiting
            </p>
          ) : null}
        </div>

        {/* Walk-in queue — sign-in order */}
        <div className="flex-1 overflow-y-auto">
          <p className="text-xs font-semibold text-secondary-400 uppercase tracking-widest mb-3">
            Queue
          </p>
          <WaitingList entries={waitingEntries} />
        </div>
      </aside>
    </div>
  )
}
