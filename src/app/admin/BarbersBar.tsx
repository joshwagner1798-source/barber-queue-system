'use client'

import { useState } from 'react'
import type { BarberInfo, BarberManualState } from '@/types/dashboard'

const STATE_COLOR: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500',
  IN_CHAIR: 'bg-primary-500',
  ON_BREAK: 'bg-amber-500',
  OFF: 'bg-secondary-500',
  CLEANUP: 'bg-blue-500',
  OTHER: 'bg-purple-500',
}

const STATE_OPTIONS: BarberManualState[] = ['AVAILABLE', 'IN_CHAIR', 'ON_BREAK', 'OFF']

interface BarbersBarProps {
  barbers: BarberInfo[]
  shopId: string
  onStateChange: (barberId: string, newState: BarberManualState) => void
}

export function BarbersBar({ barbers, shopId, onStateChange }: BarbersBarProps) {
  const [openPopover, setOpenPopover] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function setBarberState(barberId: string, newState: BarberManualState) {
    setLoading(barberId)
    try {
      const res = await fetch(`/api/barber-state/${barberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, state: newState }),
      })
      if (res.ok) {
        onStateChange(barberId, newState)
        setOpenPopover(null)
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-secondary-900 border-b border-secondary-800 px-6 py-3 flex items-center gap-3 overflow-x-auto">
      <span className="text-secondary-500 text-xs font-medium uppercase tracking-wide whitespace-nowrap">Barbers</span>
      {barbers.map((barber) => (
        <div key={barber.id} className="relative">
          <button
            onClick={() => setOpenPopover(openPopover === barber.id ? null : barber.id)}
            className="flex items-center gap-2 bg-secondary-800 hover:bg-secondary-700 rounded-lg px-3 py-2 transition-colors whitespace-nowrap"
          >
            <span className={`w-2 h-2 rounded-full ${STATE_COLOR[barber.state] ?? 'bg-secondary-500'}`} />
            <span className="text-white text-sm font-medium">{barber.displayName}</span>
            <span className="text-secondary-500 text-xs">{barber.state}</span>
          </button>

          {openPopover === barber.id && (
            <div className="absolute top-full left-0 mt-1 bg-secondary-800 border border-secondary-700 rounded-lg shadow-xl z-10 p-2 min-w-[160px]">
              <p className="text-secondary-400 text-xs px-2 pb-2 font-medium">Set state</p>
              {STATE_OPTIONS.map((state) => (
                <button
                  key={state}
                  onClick={() => setBarberState(barber.id, state)}
                  disabled={loading === barber.id}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    barber.state === state
                      ? 'bg-secondary-700 text-white'
                      : 'text-secondary-300 hover:bg-secondary-700 hover:text-white'
                  } disabled:opacity-50`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${STATE_COLOR[state]}`} />
                  {state}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {/* Close popover when clicking outside */}
      {openPopover && (
        <div className="fixed inset-0 z-0" onClick={() => setOpenPopover(null)} />
      )}
    </div>
  )
}
