'use client'

import { useState } from 'react'
import { FloorDisplay } from './FloorDisplay'
import { MobileQueue } from './MobileQueue'

// Note: Owner Settings intentionally NOT shown here — this page is public
// (no auth). Real Owner Settings live at /dashboard → Owner Settings tab.
type Tab = 'tv' | 'kiosk'

interface Props {
  shopId: string
  backgroundUrl?: string
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'tv', label: 'TV Display' },
  { id: 'kiosk', label: 'Kiosk' },
]

export function TVDisplayTabs({ shopId, backgroundUrl }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tv')

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

      {/* Tab content — overflow-visible so layout animations are not clipped */}
      <div className="flex-1">
        {activeTab === 'tv' && (
          <FloorDisplay shopId={shopId} backgroundUrl={backgroundUrl} />
        )}

        {activeTab === 'kiosk' && (
          <div className="min-h-full bg-zinc-950">
            <MobileQueue shopId={shopId} />
          </div>
        )}

      </div>
    </div>
  )
}
