'use client'

import { useState, useEffect, useCallback } from 'react'
import { FloorDisplay } from './FloorDisplay'
import { KioskForm } from '@/app/kiosk/KioskForm'
import { OwnerPanel } from './OwnerPanel'
import { createClient } from '@/lib/supabase/client'
import WalkInQueue from '@/components/WalkInQueue'

type Tab = 'tv' | 'kiosk' | 'walkins'

interface Props {
  shopId: string
  backgroundUrl?: string
}

// ─────────────────────────────────────────────
// Shared types for the feed
// ─────────────────────────────────────────────

type RawBarber  = { id: string; first_name: string; last_name: string }
type RawState   = { barber_id: string; state: string; state_since: string }
type RawWalkin  = {
  id: string
  display_name: string | null
  status: string
  position: number
  assigned_barber_id: string | null
  called_at: string | null
  created_at: string
}

// ─────────────────────────────────────────────
// Accent palette + mapper (mirrors DashboardTabs)
// ─────────────────────────────────────────────

const ACCENT_PALETTE = [
  '#4f46e5', '#0284c7', '#16a34a', '#ca8a04',
  '#dc2626', '#9333ea', '#0891b2', '#ea580c',
]

function mapToQueueBarbers(
  barbers: RawBarber[],
  states:  RawState[],
  walkins: RawWalkin[],
) {
  const stateMap = new Map(states.map(s => [s.barber_id, s.state]))

  return barbers.map((b, i) => {
    const state = stateMap.get(b.id) ?? 'OFF'

    const status: 'available' | 'busy' | 'closed' =
      state === 'AVAILABLE'                       ? 'available' :
      state === 'IN_CHAIR' || state === 'CLEANUP' ? 'busy'      :
      'closed'

    const activeWalkin = walkins.find(
      w => w.assigned_barber_id === b.id &&
           (w.status === 'IN_SERVICE' || w.status === 'CALLED'),
    )

    const queueCount = walkins.filter(
      w => w.assigned_barber_id === b.id && w.status === 'WAITING',
    ).length

    const initials = (
      (b.first_name[0] ?? '') + (b.last_name[0] ?? '')
    ).toUpperCase()

    return {
      id:            b.id,
      name:          `${b.first_name} ${b.last_name}`,
      status,
      currentClient: activeWalkin?.display_name ?? null,
      queue:         queueCount,
      maxQueue:      5,
      waitMin:       queueCount > 0 ? queueCount * 20 : null,
      nextAppt:      '–',
      initials,
      accentHex:     ACCENT_PALETTE[i % ACCENT_PALETTE.length],
      photoUrl:      null,
    }
  })
}

// ─────────────────────────────────────────────
// WalkInQueueFeed
// Self-contained: fetches barbers + state + walkins from Supabase,
// subscribes to realtime for live updates, renders WalkInQueue.
// ─────────────────────────────────────────────

function WalkInQueueFeed({ shopId }: { shopId: string }) {
  const [queueBarbers, setQueueBarbers] = useState<ReturnType<typeof mapToQueueBarbers>>([])

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [barbersRes, statesRes, walkinsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('role', 'barber')
        .eq('is_active', true),

      supabase
        .from('barber_state')
        .select('barber_id, state, state_since')
        .eq('shop_id', shopId),

      supabase
        .from('walkins')
        .select('id, display_name, status, position, assigned_barber_id, called_at, created_at')
        .eq('shop_id', shopId)
        .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
        .order('position', { ascending: true }),
    ])

    setQueueBarbers(
      mapToQueueBarbers(
        (barbersRes.data ?? []) as RawBarber[],
        (statesRes.data  ?? []) as RawState[],
        (walkinsRes.data ?? []) as RawWalkin[],
      )
    )
  }, [shopId])

  // Initial fetch
  useEffect(() => { fetchData() }, [fetchData])

  // Realtime — re-fetch on any barber_state or walkins change
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('walkin_queue_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_state' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkins' },       fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  return (
    <div className="flex-1 overflow-auto bg-[#0a0a0a] flex flex-col items-center pt-8 pb-16 px-4">

      {/* Section label */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600 mb-6 select-none">
        Customer walk-in view
      </p>

      {/* Phone chrome */}
      <div
        className="relative shrink-0 w-[390px] rounded-[48px] overflow-hidden ring-[10px] ring-neutral-800 shadow-[0_32px_80px_rgba(0,0,0,0.85)]"
        style={{ height: '780px' }}
      >
        {/* Dynamic-island notch */}
        <div className="absolute top-0 inset-x-0 z-20 flex justify-center">
          <div className="flex items-center gap-2 bg-black w-[120px] h-[34px] rounded-b-[24px] justify-center">
            <div className="w-10 h-[5px] bg-neutral-800 rounded-full" />
            <div className="w-[11px] h-[11px] rounded-full bg-neutral-800 ring-1 ring-neutral-700" />
          </div>
        </div>

        {/* Scrollable phone viewport */}
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
          <div className="pt-8">
            <WalkInQueue barbers={queueBarbers} />
          </div>
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-0 inset-x-0 z-20 h-9 pointer-events-none
                        bg-gradient-to-t from-neutral-950/80 to-transparent
                        flex items-end justify-center pb-[9px]">
          <div className="w-28 h-[5px] bg-neutral-600 rounded-full" />
        </div>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────
// TVDisplayTabs
// ─────────────────────────────────────────────

export function TVDisplayTabs({ shopId, backgroundUrl }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tv')
  const [ownerOpen, setOwnerOpen] = useState(false)

  const tabClass = (active: boolean) =>
    `px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
      active
        ? 'text-white border-primary-400'
        : 'text-secondary-400 border-transparent hover:text-secondary-200 hover:border-secondary-500'
    }`

  return (
    <div className="min-h-screen bg-secondary-950 flex flex-col">

      {/* Tab bar */}
      <nav className="bg-secondary-800 border-b border-secondary-700 px-4 flex sticky top-0 z-10">
        <button onClick={() => setActiveTab('tv')}      className={tabClass(activeTab === 'tv')}>
          TV Display
        </button>
        <button onClick={() => setActiveTab('kiosk')}   className={tabClass(activeTab === 'kiosk')}>
          Kiosk
        </button>
        <button onClick={() => setActiveTab('walkins')} className={tabClass(activeTab === 'walkins')}>
          Walk-ins
        </button>
        <button onClick={() => setOwnerOpen(true)}      className={tabClass(ownerOpen)}>
          Owner
        </button>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {activeTab === 'tv' && (
          <FloorDisplay shopId={shopId} backgroundUrl={backgroundUrl} />
        )}

        {activeTab === 'kiosk' && (
          <div
            className="min-h-full flex items-center justify-center p-8 relative overflow-hidden"
            style={{
              backgroundImage: "url('/images/shop-bg.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundColor: '#0c0a09',
            }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] pointer-events-none" />
            <div className="relative z-10 w-full">
              <KioskForm shopId={shopId || undefined} />
            </div>
          </div>
        )}

        {activeTab === 'walkins' && (
          <WalkInQueueFeed shopId={shopId} />
        )}

      </div>

      {/* Owner modal */}
      <OwnerPanel open={ownerOpen} onClose={() => setOwnerOpen(false)} />
    </div>
  )
}
