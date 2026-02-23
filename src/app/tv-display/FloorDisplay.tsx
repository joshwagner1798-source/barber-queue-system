'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { WaitingList } from '@/app/tv/WaitingList'
import { BarberCard } from '@/components/BarberCard'
import { NewYorkClock } from '@/components/tv/NewYorkClock'

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
  next_start_at: string | null
  next_kind: 'APPT' | 'BLOCK' | null
  next_notes: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusRank(tvStatus?: string): number {
  if (tvStatus === 'FREE')         return 0
  if (tvStatus === 'BUSY')         return 1
  if (tvStatus === 'UNAVAILABLE')  return 2
  return 3
}

function computeWaitSecs(statuses: TVBarberStatus[], waitingCount: number): number {
  if (waitingCount === 0) return 0
  if (statuses.some((s) => s.status === 'FREE')) return 0
  const freeAts = statuses
    .filter((s) => s.status === 'BUSY' && s.free_at)
    .map((s) => new Date(s.free_at!).getTime())
  if (freeAts.length === 0) return waitingCount * 20 * 60
  return Math.max(0, Math.round((Math.min(...freeAts) - Date.now()) / 1000))
}

// Glow colour + opacity per TV status
function glowConfig(tvStatus?: string): { bg: string; opacity: string; pulse: boolean } {
  switch (tvStatus) {
    case 'FREE':        return { bg: 'bg-emerald-500', opacity: 'opacity-50', pulse: true  }
    case 'BUSY':        return { bg: 'bg-red-500',     opacity: 'opacity-40', pulse: true  }
    case 'UNAVAILABLE': return { bg: 'bg-blue-500',    opacity: 'opacity-20', pulse: true  }
    default:            return { bg: 'bg-zinc-600',    opacity: 'opacity-10', pulse: false }
  }
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

  // ── "Race" sort: FREE first → BUSY by freeAt → UNAVAILABLE → OFF ──────────
  const sortedBarbers = useMemo(() => {
    return [...barbers].sort((a, b) => {
      const sa = statuses.find((s) => s.barber_id === a.id)
      const sb = statuses.find((s) => s.barber_id === b.id)
      const ra = statusRank(sa?.status)
      const rb = statusRank(sb?.status)
      if (ra !== rb) return ra - rb
      const fa = sa?.free_at ? new Date(sa.free_at).getTime() : Infinity
      const fb = sb?.free_at ? new Date(sb.free_at).getTime() : Infinity
      return fa - fb
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
        </header>

        {/* Barber card row — animated "race" */}
        <div className="flex gap-4 w-full flex-1 min-h-0 items-stretch">
          <AnimatePresence mode="popLayout" initial={false}>
            {sortedBarbers.map((b) => {
              const bs = statuses.find((s) => s.barber_id === b.id)
              const cardStatus =
                bs?.status === 'FREE'        ? 'AVAILABLE' :
                bs?.status === 'BUSY'        ? 'IN_CHAIR'  :
                bs?.status === 'UNAVAILABLE' ? 'ON_BREAK'  : 'OFF'
              const glow = glowConfig(bs?.status)

              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                  className="relative flex-1 min-w-0"
                >
                  {/* Pulsing glow — behind card */}
                  <div
                    className={`absolute inset-[-10px] rounded-3xl blur-2xl ${glow.bg} ${glow.opacity}${glow.pulse ? ' animate-pulse' : ''} pointer-events-none`}
                    style={{ zIndex: 0 }}
                  />
                  {/* Card */}
                  <div className="relative" style={{ zIndex: 1 }}>
                    <BarberCard
                      firstName={b.first_name}
                      lastName={b.last_name}
                      avatarUrl={b.avatar_url}
                      status={cardStatus}
                      nextAppointmentAt={b.next_start_at}
                      nextKind={b.next_kind}
                      nextNotes={b.next_notes}
                      freeAt={bs?.free_at ?? null}
                      className="w-full h-[65vh] min-h-[520px] max-h-[820px] rounded-3xl"
                    />
                  </div>
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
