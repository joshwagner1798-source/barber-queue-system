'use client'

import { useState } from 'react'

type ActiveState = 'AVAILABLE' | 'ON_BREAK' | 'OFF'

interface StatusBarProps {
  barberId: string
  barberName: string
  shopId: string
  currentState: ActiveState
  onStateChange: (newState: ActiveState) => void
}

const STATE_STYLES: Record<ActiveState, string> = {
  AVAILABLE: 'bg-emerald-600 text-white',
  ON_BREAK: 'bg-amber-600 text-white',
  OFF: 'bg-secondary-600 text-white',
}

const STATE_LABELS: Record<ActiveState, string> = {
  AVAILABLE: 'Available',
  ON_BREAK: 'Break',
  OFF: 'Off',
}

export function StatusBar({ barberId, barberName, shopId, currentState, onStateChange }: StatusBarProps) {
  const [loading, setLoading] = useState(false)

  async function setState(newState: ActiveState) {
    if (newState === currentState || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/barber-state/${barberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, state: newState }),
      })
      if (res.ok) onStateChange(newState)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-secondary-900 border-b border-secondary-800 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-white font-semibold text-lg">✂️ {barberName}</span>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATE_STYLES[currentState]}`}>
          {STATE_LABELS[currentState]}
        </span>
      </div>
      <div className="flex gap-2">
        {(['AVAILABLE', 'ON_BREAK', 'OFF'] as ActiveState[]).map((state) => (
          <button
            key={state}
            onClick={() => setState(state)}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentState === state
                ? STATE_STYLES[state] + ' ring-2 ring-white/30'
                : 'bg-secondary-800 text-secondary-300 hover:bg-secondary-700'
            } disabled:opacity-50`}
          >
            {STATE_LABELS[state]}
          </button>
        ))}
      </div>
    </div>
  )
}
