'use client'

import { useState } from 'react'
import { FloorDisplay } from '@/app/tv-display/FloorDisplay'
import { KioskForm } from '@/app/kiosk/KioskForm'
import { AdminDashboard } from '@/app/admin/AdminDashboard'
import { ShareLinksPanel } from './ShareLinksPanel'
import { PinGate } from './PinGate'
import WalkInQueue from '@/components/WalkInQueue'

type Tab = 'tv' | 'kiosk' | 'settings' | 'links' | 'walkins'

interface Props {
  currentUserName: string
  shopId: string
  shopSlug: string | null
  initialBarbers: Array<{ id: string; first_name: string; last_name: string }>
  initialStates: Array<{ barber_id: string; state: string; state_since: string }>
  initialWalkins: Array<{
    id: string
    display_name: string | null
    status: string
    position: number
    assigned_barber_id: string | null
    called_at: string | null
    created_at: string
  }>
  initialEvents: Array<{
    id: string
    type: string
    payload: Record<string, unknown>
    created_at: string
  }>
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'tv',       label: 'TV Display'     },
  { id: 'kiosk',    label: 'Kiosk'          },
  { id: 'settings', label: 'Owner Settings' },
  { id: 'links',    label: 'Share Links'    },
  { id: 'walkins',  label: 'Walk-ins'       },
]

// ─────────────────────────────────────────────
// Accent palette for barber initials fallback
// ─────────────────────────────────────────────
const ACCENT_PALETTE = [
  '#4f46e5', // indigo
  '#0284c7', // sky
  '#16a34a', // green
  '#ca8a04', // amber
  '#dc2626', // red
  '#9333ea', // purple
  '#0891b2', // cyan
  '#ea580c', // orange
]

// ─────────────────────────────────────────────
// Map server-side props → WalkInQueue Barber shape
//
// status mapping:
//   AVAILABLE          → available
//   IN_CHAIR | CLEANUP → busy
//   ON_BREAK | OFF | OTHER | (missing) → closed
//
// queue  = walkins with status WAITING assigned to this barber
// currentClient = first IN_SERVICE or CALLED walkin for this barber
// waitMin = queue × 20 min (rough estimate; null when empty)
// nextAppt = "–" (appointment data not in dashboard props)
// photoUrl = null (dashboard doesn't fetch photo URLs)
// ─────────────────────────────────────────────
function mapToQueueBarbers(
  barbers: Props['initialBarbers'],
  states:  Props['initialStates'],
  walkins: Props['initialWalkins'],
) {
  const stateMap = new Map(states.map(s => [s.barber_id, s.state]))

  return barbers.map((b, i) => {
    const state = stateMap.get(b.id) ?? 'OFF'

    const status: 'available' | 'busy' | 'closed' =
      state === 'AVAILABLE'                        ? 'available' :
      state === 'IN_CHAIR' || state === 'CLEANUP'  ? 'busy'      :
      /* ON_BREAK | OFF | OTHER | fallback */        'closed'

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

export function DashboardTabs({
  currentUserName,
  shopId,
  shopSlug,
  initialBarbers,
  initialStates,
  initialWalkins,
  initialEvents,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tv')

  const queueBarbers = mapToQueueBarbers(initialBarbers, initialStates, initialWalkins)

  return (
    <div className="min-h-screen bg-secondary-950 flex flex-col">

      {/* Tab bar */}
      <nav className="bg-secondary-800 border-b border-secondary-700 px-4 flex sticky top-0 z-10">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'text-white border-primary-400'
                : 'text-secondary-400 border-transparent hover:text-secondary-200 hover:border-secondary-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">

        {activeTab === 'tv' && <FloorDisplay shopId={shopId || undefined} />}

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

        {activeTab === 'settings' && (
          <PinGate>
            <div className="flex flex-col gap-6 p-6 overflow-y-auto">
              <AdminDashboard
                currentUserName={currentUserName}
                shopId={shopId}
                initialWalkins={initialWalkins}
                initialBarbers={initialBarbers}
                initialStates={initialStates}
                initialEvents={initialEvents}
              />
            </div>
          </PinGate>
        )}

        {activeTab === 'links' && (
          <div className="flex flex-col gap-6 p-6 max-w-lg">
            {shopId && (
              <ShareLinksPanel shopId={shopId} shopSlug={shopSlug} />
            )}
          </div>
        )}

        {/* ── Walk-in Queue ─────────────────────────────────────────────────
            Rendered inside a phone-chrome preview so it reads exactly as
            the customer-facing mobile experience would look.
        ─────────────────────────────────────────────────────────────────── */}
        {activeTab === 'walkins' && (
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
                {/* Nudge content below the notch */}
                <div className="pt-8">
                  <WalkInQueue barbers={queueBarbers} />
                </div>
              </div>

              {/* Home indicator bar — non-interactive overlay at very bottom */}
              <div className="absolute bottom-0 inset-x-0 z-20 h-9 pointer-events-none
                              bg-gradient-to-t from-neutral-950/80 to-transparent
                              flex items-end justify-center pb-[9px]">
                <div className="w-28 h-[5px] bg-neutral-600 rounded-full" />
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
