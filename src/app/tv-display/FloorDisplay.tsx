'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { WaitingList } from '@/app/tv/WaitingList'
import { BarberCard } from '@/components/BarberCard'
import { NewYorkClock } from '@/components/tv/NewYorkClock'
import { FullscreenButton } from './FullscreenButton'
import { useMotionEnabled } from '@/hooks/useMotionEnabled'
import { formatWaitTime } from '@/lib/formatWaitTime'
import type { OwnerSettings } from '@/types/database'


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
  /** True when the barber accepts walk-ins (walkin_enabled=true in users table). */
  walkin_eligible: boolean
  photo_x: number | null
  photo_y: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Average minutes per walk-in service — mirrors AVG_WALKIN_MINUTES in wait_time_estimator.ts
const AVG_WALKIN_MINUTES = 30

function computeWaitSecs(
  barbers: TVBarber[],
  statuses: TVBarberStatus[],
  waitingCount: number,
): number {
  if (waitingCount === 0) return 0

  // Only walkin-eligible barbers determine wait time.
  // Non-eligible barbers (e.g. Tyrik, Will with walkin_enabled=false) appear
  // on the TV but must NOT influence the walk-in wait countdown.
  const walkinBarbers = barbers.filter((b) => b.walkin_eligible !== false)

  // Effective status: Acuity barber_status override → API availability engine status
  // (same priority used by the barber card display)
  const statusMap = new Map(statuses.map((s) => [s.barber_id, s]))
  const effStatus = (b: TVBarber) => statusMap.get(b.id)?.status ?? b.status

  if (walkinBarbers.some((b) => effStatus(b) === 'FREE')) return 0

  const freeAts = walkinBarbers
    .filter((b) => effStatus(b) === 'BUSY')
    .map((b) => {
      const freeAt = statusMap.get(b.id)?.free_at ?? b.free_at
      return freeAt ? new Date(freeAt).getTime() : null
    })
    .filter((t): t is number => t !== null)

  // No eligible barbers or no free_at estimates: fall back to one service slot
  if (freeAts.length === 0) return AVG_WALKIN_MINUTES * 60

  return Math.max(0, Math.round((Math.min(...freeAts) - Date.now()) / 1000))
}

// ---------------------------------------------------------------------------
// FloorDisplay
// ---------------------------------------------------------------------------

interface Props {
  /** Custom background URL from shop_settings; falls back to default image. */
  backgroundUrl?: string
  /** Shop ID to pass to API calls. If omitted, the API uses DEFAULT_SHOP_ID. */
  shopId?: string
}

const SETTINGS_DEFAULTS: Pick<OwnerSettings, 'layout' | 'theme' | 'font_size'> = {
  layout: 'compact',
  theme: 'dark',
  font_size: 'md',
}

export function FloorDisplay({ backgroundUrl, shopId }: Props) {
  const motionEnabled = useMotionEnabled()

  const [statuses, setStatuses] = useState<TVBarberStatus[]>([])
  const [walkins, setWalkins]   = useState<TVWalkin[]>([])
  const [barbers, setBarbers]   = useState<TVBarber[]>([])
  const [displaySecs, setDisplaySecs] = useState(0)
  const [ownerSettings, setOwnerSettings] = useState(SETTINGS_DEFAULTS)

  // Scheduling mode — loaded from shop_settings; defaults to 'off' (no change to UI)
  const [schedulingMode, setSchedulingMode] = useState<'off' | 'native' | 'external'>('off')
  const [externalBookingUrl, setExternalBookingUrl] = useState<string | null>(null)

  // Which barber card has the in-card action slot open
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const url = shopId ? `/api/tv?shop_id=${encodeURIComponent(shopId)}` : '/api/tv'
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.text()
        setFetchError(`HTTP ${res.status}: ${body.slice(0, 300)}`)
        return
      }
      const data = await res.json()
      setFetchError(null)
      setStatuses(data.barber_statuses ?? [])
      setWalkins(data.walkins ?? [])
      setBarbers(data.barbers ?? [])
    } catch (e) {
      setFetchError(String(e))
    }
  }, [shopId])

  const fetchSettings = useCallback(async () => {
    try {
      const url = shopId
        ? `/api/owner/settings?shop_id=${encodeURIComponent(shopId)}`
        : '/api/owner/settings'
      const res = await fetch(url)
      if (!res.ok) return
      const data: OwnerSettings = await res.json()
      setOwnerSettings({ layout: data.layout, theme: data.theme, font_size: data.font_size })
    } catch { /* silent */ }
  }, [shopId])

  const fetchShopSettings = useCallback(async () => {
    try {
      const url = shopId
        ? `/api/shop-settings?shop_id=${encodeURIComponent(shopId)}`
        : '/api/shop-settings'
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      const mode = data.scheduling_mode ?? 'off'
      if (mode === 'native' || mode === 'external' || mode === 'off') {
        setSchedulingMode(mode)
      }
      setExternalBookingUrl(data.external_booking_url ?? null)
    } catch { /* silent — scheduling stays off */ }
  }, [shopId])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchSettings() }, [fetchSettings])
  useEffect(() => { fetchShopSettings() }, [fetchShopSettings])

  // Realtime — separate channel; do NOT touch subscriptions logic
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('floor-display-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_status' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkins' },       () => fetchData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'owner_settings' }, () => fetchSettings())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData, fetchSettings])

  useEffect(() => {
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  useEffect(() => {
    const waitCount = walkins.filter((w) => w.status === 'WAITING').length
    setDisplaySecs(computeWaitSecs(barbers, statuses, waitCount))
  }, [barbers, statuses, walkins])

  useEffect(() => {
    const id = setInterval(() => setDisplaySecs((p) => Math.max(0, p - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  // Preserve display_order from API (already sorted by display_order ascending)
  const sortedBarbers = barbers

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

  const waitMinutes      = Math.floor(displaySecs / 60)
  const nextAvailableIso = displaySecs > 0 ? new Date(Date.now() + displaySecs * 1000).toISOString() : null
  const waitLabel        = displaySecs > 0 ? formatWaitTime(waitMinutes, nextAvailableIso) : '—'
  const waitFontClass    = waitMinutes >= 90 ? 'text-xl' : waitMinutes >= 60 ? 'text-4xl' : 'text-6xl'

  const statusMapForFree = new Map(statuses.map((s) => [s.barber_id, s]))
  // Only walkin-eligible barbers count for "Walk right in!" — non-eligible barbers
  // (walkin_enabled=false) are visible on TV but do NOT accept walk-ins.
  const anyFree = barbers
    .filter((b) => b.walkin_eligible !== false)
    .some((b) => (statusMapForFree.get(b.id)?.status ?? b.status) === 'FREE')

  const bgImage = backgroundUrl ?? '/images/shop-bg.png'

  // ── Owner settings: layout / theme / font size ─────────────────────────
  // Layout: compact = one card per barber (current default), large = max 2 cols
  const colCount = ownerSettings.layout === 'large'
    ? Math.min(Math.max(sortedBarbers.length, 1), 2)
    : Math.max(sortedBarbers.length, 1)

  const isLight = ownerSettings.theme === 'light'

  const fontSizeClass =
    ownerSettings.font_size === 'sm' ? 'text-sm' :
    ownerSettings.font_size === 'lg' ? 'text-xl' :
    'text-base'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={`h-screen flex relative overflow-hidden ${fontSizeClass}`}
      onClick={() => setSelectedBarberId(null)}
      style={{
        backgroundImage: isLight ? undefined : `url('${bgImage}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: isLight ? '#f9fafb' : '#0c0a09',
      }}
    >
      {/* Overlay — dark bg: darken photo; light bg: subtle white wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backdropFilter: isLight ? undefined : 'blur(2px)', background: isLight ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.65)' }}
      />


      {/* Subtle background gradient drift — very slow, TV-scale */}
      {motionEnabled && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background:
              'radial-gradient(ellipse 120% 80% at 35% 45%, rgba(255,255,255,0.025) 0%, transparent 55%)',
          }}
          animate={{ x: [0, 40, -25, 10, 0], y: [0, -25, 18, -10, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* ── Main area ──────────────────────────────────────────────────── */}
      {/* overflow-visible: outer h-screen overflow-hidden already clips; removing here prevents layout animation clipping */}
      <div className="relative flex-1 flex flex-col p-6 min-h-0 z-10">
        <header className="mb-3 flex-shrink-0 relative flex items-start justify-between">
          <div>
            <h1 className={`text-3xl font-bold drop-shadow-lg ${isLight ? 'text-gray-900' : 'text-white'}`}>Sharper Image</h1>
            <p className={`text-base ${isLight ? 'text-gray-600' : 'text-white/60'}`}>Live Barber Status</p>
          </div>
          {/* Clock — isolated client component; only it re-renders every second */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0">
            <NewYorkClock />
          </div>
          <FullscreenButton />
        </header>

        {/*
          Barber card grid.
          compact: one row, N equal columns (default).
          large:   up to 2 columns, auto rows so cards wrap.
        */}
        <div
          className="flex-1 min-h-0 grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
            gridTemplateRows: ownerSettings.layout === 'large' ? 'auto' : '1fr',
          }}
        >
          {/* AnimatePresence always wraps — plain <div> children are no-ops when motion off */}
          <AnimatePresence mode="popLayout">
            {sortedBarbers.map((b, i) => {
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

              const isSelected = selectedBarberId === b.id

              // STATUS_CONFIG subset for badge — mirrors BarberCard's config
              const badgeCfg: Record<string, string> = {
                AVAILABLE: 'bg-emerald-500 text-white',
                IN_CHAIR:  'bg-amber-500 text-white',
                ON_BREAK:  'bg-blue-500 text-white',
                BLOCKED:   'bg-red-600 text-white',
                OFF:       'bg-zinc-600 text-zinc-300',
              }
              const badgeLabel: Record<string, string> = {
                AVAILABLE: 'READY',
                IN_CHAIR:  'BUSY',
                ON_BREAK:  'ON BREAK',
                BLOCKED:   'BLOCKED',
                OFF:       'OFF',
              }

              // Focused photo card — rendered when this card is selected.
              // Photo fills the card as background. Dark gradient for readability.
              // Name + actions composited in the lower-middle of the photo.
              const focusedCard = (
                <div
                  className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-white/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Full-card photo background */}
                  {b.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.avatar_url}
                      alt={b.first_name}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ objectPosition: `${b.photo_x ?? 50}% ${b.photo_y ?? 50}%` }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                      <span className="text-zinc-400 text-5xl font-bold">
                        {b.first_name[0]}{b.last_name[0]}
                      </span>
                    </div>
                  )}

                  {/* EXAGGERATED gradient — covers bottom 65%, near-opaque at base */}
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.88) 40%, rgba(0,0,0,0.45) 65%, transparent 100%)' }}
                  />

                  {/* Status badge — top-right */}
                  <div className="absolute top-2 right-2 z-10">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tracking-wide ${badgeCfg[cardStatus] ?? badgeCfg.OFF}`}>
                      {badgeLabel[cardStatus] ?? 'OFF'}
                    </span>
                  </div>

                  {/* Name + buttons — lower half of the card */}
                  <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center px-4 pb-5">
                    {/* Name — large and unmistakable */}
                    <p
                      className="text-white font-black text-center leading-tight drop-shadow-lg mb-5"
                      style={{ fontSize: 'clamp(26px, 3vw, 44px)', letterSpacing: '-0.02em' }}
                    >
                      {b.first_name}<br />{b.last_name}
                    </p>

                    {/* Buttons — centered, 80% width */}
                    <div className="flex flex-col w-4/5 gap-2">
                      {/* Hop in Queue */}
                      <a
                        href={`/sharperimage/kiosk?barberId=${b.id}&preference=PREFERRED`}
                        className="block w-full rounded-xl font-bold text-white text-center py-2.5 text-base transition-colors bg-[#27a644] hover:bg-[#22923c]"
                      >
                        Hop in Queue
                      </a>

                      {/* Book a Time — external URL takes priority; native mode shows button in-card */}
                      {externalBookingUrl ? (
                        <a
                          href={externalBookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full rounded-xl font-bold text-white text-center py-2.5 text-base transition-colors hover:opacity-90"
                          style={{ background: 'rgba(255,255,255,0.25)' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Book a Time
                        </a>
                      ) : schedulingMode !== 'off' ? (
                        <a
                          href={`/sharperimage/book?barberId=${b.id}`}
                          className="block w-full rounded-xl font-bold text-white text-center py-2.5 text-base transition-colors hover:opacity-90"
                          style={{ background: 'rgba(255,255,255,0.25)' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Book a Time
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              )

              const normalCard = (
                <BarberCard
                  firstName={b.first_name}
                  lastName={b.last_name}
                  avatarUrl={b.avatar_url}
                  status={cardStatus}
                  nextApptAt={b.next_appt_at}
                  nextClientName={b.next_client_name}
                  busyReason={b.busy_reason}
                  blockedNoteShort={b.blocked_note}
                  freeAt={bs?.free_at ?? b.free_at}
                  offLabel={b.off_label}
                  photoX={b.photo_x ?? 50}
                  photoY={b.photo_y ?? 50}
                  className="h-full"
                />
              )

              const cardContent = (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedBarberId(isSelected ? null : b.id) }}
                  className="relative block w-full h-full text-left focus:outline-none rounded-xl"
                >
                  {isSelected ? focusedCard : normalCard}
                </button>
              )

              return motionEnabled ? (
                <motion.div
                  key={b.id}
                  layout="position"
                  initial={{ opacity: 0, y: 48, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.96 }}
                  transition={{ duration: 0.45, delay: i * 0.07, ease: 'easeOut' }}
                  className="h-full min-h-0"
                >
                  {cardContent}
                </motion.div>
              ) : (
                <div key={b.id} className="h-full min-h-0">
                  {cardContent}
                </div>
              )
            })}
          </AnimatePresence>
          {barbers.length === 0 && (
            <div className="text-white/60 text-base mt-8 space-y-1">
              <p>No barbers on the floor today.</p>
              <p className="text-xs text-white/30">shop_id: {shopId ?? '(none)'}</p>
              {fetchError && <p className="text-red-400 text-xs break-all">{fetchError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className={`relative z-10 w-72 xl:w-80 backdrop-blur-md border-l p-6 flex flex-col gap-6 ${isLight ? 'bg-white/70 border-gray-200' : 'bg-[#0f1011]/90 border-[rgba(255,255,255,0.06)]'}`}>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${isLight ? 'text-gray-500' : 'text-[#62666d]'}`}>
            Estimated Wait
          </p>
          <div className={`${waitFontClass} font-bold leading-tight ${isLight ? 'text-gray-900' : 'text-[#f7f8f8]'}`}>
            {waitLabel}
          </div>
          {anyFree && waitingEntries.length === 0 ? (
            <p className="text-[#27a644] text-sm mt-3 font-medium">Walk right in!</p>
          ) : waitingEntries.length > 0 ? (
            <p className={`text-sm mt-3 ${isLight ? 'text-gray-500' : 'text-[#8a8f98]'}`}>{waitingEntries.length} waiting</p>
          ) : null}
          <p className={`text-xs mt-3 ${isLight ? 'text-gray-400' : 'text-[#62666d]'}`}>Shop Hours: 9:00 AM – 7:00 PM</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${isLight ? 'text-gray-500' : 'text-[#62666d]'}`}>
            Queue
          </p>
          <WaitingList entries={waitingEntries} />
        </div>
      </aside>
    </div>
  )
}
