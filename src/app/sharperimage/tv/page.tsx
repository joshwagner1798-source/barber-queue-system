'use client'

import { useState } from 'react'
import { FloorDisplay } from './FloorDisplay'
import { KioskForm } from '@/app/kiosk/KioskForm'
import { OwnerPanel } from '@/app/tv/OwnerPanel'

type Tab = 'tv' | 'kiosk' | 'owner'

interface Props {
  shopId: string
  backgroundUrl?: string
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'tv', label: 'TV Display' },
  { id: 'kiosk', label: 'Kiosk' },
  { id: 'owner', label: 'Owner' },
]

export function TVDisplayTabs({ shopId, backgroundUrl }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tv')
  const [ownerOpen, setOwnerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-secondary-950 flex flex-col">
      {/* Tab bar */}
      <nav className="bg-secondary-800 border-b border-secondary-700 px-4 flex sticky top-0 z-10">
        {TABS.map((t) => {
          const active =
            t.id === 'owner' ? ownerOpen : activeTab === t.id

          return (
            <button
              key={t.id}
              onClick={() => {
                if (t.id === 'owner') setOwnerOpen(true)
                else setActiveTab(t.id)
              }}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                active
                  ? 'text-white border-primary-400'
                  : 'text-secondary-400 border-transparent hover:text-secondary-200 hover:border-secondary-500'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      <div className="flex-1">
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
      </div>

      {/* Owner modal overlay */}
      <OwnerPanel open={ownerOpen} onClose={() => setOwnerOpen(false)} />
    </div>
  )
}