'use client'

import { useState } from 'react'
import { FloorDisplay } from '@/app/tv-display/FloorDisplay'
import { KioskForm } from '@/app/kiosk/KioskForm'
import { AdminDashboard } from '@/app/admin/AdminDashboard'

type Tab = 'tv' | 'kiosk' | 'settings'

interface Props {
  currentUserName: string
  shopId: string
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
]

export function DashboardTabs({
  currentUserName,
  shopId,
  initialBarbers,
  initialStates,
  initialWalkins,
  initialEvents,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tv')

  return (
    <div className="min-h-screen bg-secondary-950 flex flex-col">
      {/* Tab bar */}
      <nav className="bg-secondary-900 border-b border-secondary-800 px-6 flex gap-1 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.id
                ? 'bg-secondary-950 text-white border-t border-x border-secondary-700'
                : 'text-secondary-400 hover:text-secondary-200 hover:bg-secondary-800/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tv' && <FloorDisplay />}

        {activeTab === 'kiosk' && (
          <div className="min-h-full bg-secondary-950 flex items-center justify-center p-8">
            <KioskForm />
          </div>
        )}

        {activeTab === 'settings' && (
          <AdminDashboard
            currentUserName={currentUserName}
            shopId={shopId}
            initialWalkins={initialWalkins}
            initialBarbers={initialBarbers}
            initialStates={initialStates}
            initialEvents={initialEvents}
          />
        )}
      </div>
    </div>
  )
}
