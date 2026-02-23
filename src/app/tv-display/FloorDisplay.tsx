'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { WaitingList } from '@/app/tv/WaitingList'
import { BarberCard } from '@/components/BarberCard'
import { NewYorkClock } from '@/components/tv/NewYorkClock'
import { FullscreenButton } from './FullscreenButton'

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
  status: 'BUSY' | 'FREE' | 'UNAVAILABLE' | 'OFF'
  busy_reason: 'appointment' | 'blocked' | null
  free_at: string | null
  blocked_until: string | null
  blocked_note: string | null
  next_appt_at: string | null
  next_client_name: string | null
  off_label: string | null
  off_until_at: string | null
}

// ---------------------------------------------------------------------------
// Helpers
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
// FloorDisplay
// ---------------------------------------------------------------------------

export function FloorDisplay() {
  const [statuses, setStatuses] = useState<TVBarberStatus[]>([])
  const [walkins, setWalkins]   = useState<TVWalkin[]>([])
  const [barbers, setBarbers]   = useState<TVBarber[]>([])
  const [displaySecs, setDisplaySecs] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tv')
      if (!res.ok) return
      const data = await res.json()
      setStatuses(data.barber_statuses ?? [])
      setWalkins(data.walkins ?? [])
      setBarbers(data.barbers ?? [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime — separate channel; do NOT touch subscriptions logic
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('floor-display-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_status' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkins' },       () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  useEffect(() => {
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  useEffect(() => {
    const waitCount = walkins.filter((w) => w.status === 'WAITING').length
    setDisplaySecs(computeWaitSecs(statuses, waitCount))
  }, [statuses, walkins])

  useEffect(() => {
    const id = setInterval(() => setDisplaySecs((p) => Math.max(0, p - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  // ── "Race to free" sort: soonest free first, OFF always last ──────────────
  const sortedBarbers = useMemo(() => {
    const sortKey = (
      effStatus: string,
      bsFreeAt: string | null | undefined,
      apiFreeAt: string | null,
    ): number => {
      if (effStatus === 'OFF')  return Number.MAX_SAFE_INTEGER
      if (effStatus === 'FREE') return 0
      const fa = bsFreeAt ?? apiFreeAt
      return fa ? new Date(fa).getTime() : Date.now() + 4 * 60 * 60 * 1000
    }
    return [...barbers].sort((a, b) => {
      const sa = statuses.find((s) => s.barber_id === a.id)
      const sb = statuses.find((s) => s.barber_id === b.id)
      // barber_status manual override takes priority over API status for sort
      const effA = sa?.status ?? a.status
      const effB = sb?.status ?? b.status
      return sortKey(effA, sa?.free_at, a.free_at) - sortKey(effB, sb?.free_at, b.free_at)
    })
  }, [barbers, statuses])

  // ── Derived queue data ─────────────────────────────────────────────────────
  const barberNames = new Map(barbers.map((b) => [b.id, `${b.first_name} ${b.last_name}`]))

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex relative overflow-hidden"
      style={{
        backgroundImage: "url('/images/shop-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0c0a09', // fallback when image absent
      }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] pointer-events-none" />

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="relative flex-1 flex flex-col p-6 overflow-hidden min-h-0 z-10">
        <header className="mb-4 flex-shrink-0 relative flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg">Sharper Image</h1>
            <p className="text-white/60 text-base">Live Barber Status</p>
          </div>
          {/* Clock — isolated client component; only it re-renders every second */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0">
            <NewYorkClock />
          </div>
          <FullscreenButton />
        </header>

        {/* Barber card grid — wraps gracefully if >6 barbers */}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] w-full">
          <AnimatePresence mode="popLayout" initial={false}>
            {sortedBarbers.map((b) => {
              const bs = statuses.find((s) => s.barber_id === b.id)

              // Derive card status.
              // Priority 1: live barber_status override (manual toggle)
              // Priority 2: API status field (OFF / BLOCKED / BUSY / FREE)
              const cardStatus =
                bs?.status === 'FREE'        ? 'AVAILABLE' :
                bs?.status === 'BUSY'        ? 'IN_CHAIR'  :
                bs?.status === 'UNAVAILABLE' ? 'ON_BREAK'  :
                b.status === 'OFF'                                         ? 'OFF'       :
                b.status === 'UNAVAILABLE' && b.busy_reason === 'blocked' ? 'BLOCKED'   :
                b.status === 'BUSY'                                        ? 'IN_CHAIR'  :
                b.status === 'FREE'                                        ? 'AVAILABLE' :
                'AVAILABLE'

              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                >
                  <BarberCard
                    firstName={b.first_name}
                    lastName={b.last_name}
                    avatarUrl={b.avatar_url}
                    status={cardStatus}
                    nextApptAt={b.next_appt_at}
                    nextClientName={b.next_client_name}
                    busyReason={b.busy_reason}
                    blockedNoteShort={b.blocked_note}
                    freeAt={b.free_at}
                    offLabel={b.off_label}
                    className="h-[62vh] min-h-[480px]"
                  />
                </motion.div>
              )
            })}
          </AnimatePresence>
          {barbers.length === 0 && (
            <p className="text-white/50 text-xl mt-8">No barbers on the floor today.</p>
          )}
        </div>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="relative z-10 w-72 xl:w-80 bg-black/60 backdrop-blur-md border-l border-white/10 p-6 flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">
            Estimated Wait
          </p>
          <div className="text-7xl font-mono font-bold text-white tabular-nums leading-none drop-shadow-lg">
            {mm}:{ss}
          </div>
          {anyFree && waitingEntries.length === 0 ? (
            <p className="text-emerald-400 text-sm mt-3 font-medium">Walk right in!</p>
          ) : waitingEntries.length > 0 ? (
            <p className="text-white/50 text-sm mt-3">{waitingEntries.length} waiting</p>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">
            Queue
          </p>
          <WaitingList entries={waitingEntries} />
        </div>
      </aside>
    </div>
  )
}
