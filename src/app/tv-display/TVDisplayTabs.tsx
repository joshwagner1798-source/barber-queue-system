'use client'

import { useState } from 'react'
import { FloorDisplay } from './FloorDisplay'
import { MobileQueue } from './MobileQueue'
import { OwnerPanel } from './OwnerPanel'
import { ManagerPanel } from './ManagerPanel'

type Tab = 'tv' | 'kiosk' | 'manager'

interface Props {
  shopId: string
  backgroundUrl?: string
}

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
        {/* TV */}
        <button
          onClick={() => setActiveTab('tv')}
          className={tabClass(activeTab === 'tv')}
        >
          TV Display
        </button>

        {/* Kiosk */}
        <button
          onClick={() => setActiveTab('kiosk')}
          className={tabClass(activeTab === 'kiosk')}
        >
          Kiosk
        </button>

        {/* Manager */}
        <button
          onClick={() => setActiveTab('manager')}
          className={tabClass(activeTab === 'manager')}
        >
          Manager
        </button>

        {/* Owner */}
        <button
          onClick={() => setOwnerOpen(true)}
          className={tabClass(ownerOpen)}
        >
          Owner
        </button>

      </nav>

      {/* Content */}
      <div className="flex-1">
        {activeTab === 'tv' && (
          <FloorDisplay shopId={shopId} backgroundUrl={backgroundUrl} />
        )}

        {activeTab === 'kiosk' && (
          <div className="min-h-full bg-zinc-950">
            <MobileQueue shopId={shopId} />
          </div>
        )}

        {activeTab === 'manager' && (
          <ManagerPanel shopId={shopId} />
        )}
      </div>

      {/* Owner modal */}
      <OwnerPanel open={ownerOpen} onClose={() => setOwnerOpen(false)} />
    </div>
  )
}