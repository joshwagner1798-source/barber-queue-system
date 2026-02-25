'use client'

import { useState, useTransition } from 'react'
import { FloorDisplay } from '@/app/tv-display/FloorDisplay'
import { KioskForm } from '@/app/kiosk/KioskForm'
import { AdminDashboard } from '@/app/admin/AdminDashboard'
import { ShareLinksPanel } from './ShareLinksPanel'

type Tab = 'tv' | 'kiosk' | 'settings' | 'links'

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
  { id: 'tv', label: 'TV Display' },
  { id: 'kiosk', label: 'Kiosk' },
  { id: 'settings', label: 'Owner Settings' },
  { id: 'links', label: 'Share Links' },
]

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
  const [isPending, startTransition] = useTransition()

  function handleTabClick(id: Tab) {
    if (id !== 'settings') {
      setActiveTab(id)
      return
    }
    // Owner Settings requires a server-side session (cookie-based auth).
    // The browser Supabase client reads localStorage and won't see it, so
    // we check via the debug API which reads the same cookie the server uses.
    startTransition(async () => {
      const res = await fetch('/api/auth/debug')
      const { session } = await res.json()
      if (!session) {
        window.location.assign('/login')
        return
      }
      setActiveTab('settings')
    })
  }

  return (
    <div className="min-h-screen bg-secondary-950 flex flex-col">
      {/* Tab bar */}
      <nav className="bg-secondary-800 border-b border-secondary-700 px-4 flex sticky top-0 z-10">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            disabled={isPending && t.id === 'settings'}
            className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'text-white border-primary-400'
                : 'text-secondary-400 border-transparent hover:text-secondary-200 hover:border-secondary-500'
            } disabled:opacity-50`}
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
        )}

        {activeTab === 'links' && (
          <div className="flex flex-col gap-6 p-6 max-w-lg">
            {shopId && (
              <ShareLinksPanel shopId={shopId} shopSlug={shopSlug} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
