'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TVBarber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  status: 'BUSY' | 'FREE' | 'UNAVAILABLE' | 'OFF'
  walkin_eligible: boolean
}

interface TVWalkin {
  id: string
  status: string
  display_name: string | null
  position: number
  assigned_barber_id: string | null
  preference_type: string
  preferred_barber_id: string | null
}

interface Props {
  shopId: string
}

export function ManagerPanel({ shopId }: Props) {
  const [barbers, setBarbers]   = useState<TVBarber[]>([])
  const [walkins, setWalkins]   = useState<TVWalkin[]>([])
  const [selected, setSelected] = useState<TVWalkin | null>(null)
  const [loading, setLoading]   = useState(false)
  const [message, setMessage]   = useState<{ text: string; ok: boolean } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const url = shopId ? `/api/tv?shop_id=${encodeURIComponent(shopId)}` : '/api/tv'
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      setBarbers(data.barbers ?? [])
      setWalkins(data.walkins ?? [])
    } catch { /* silent */ }
  }, [shopId])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime refresh
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('manager-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkins' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  async function assign(barberId: string) {
    if (!selected) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, walkin_id: selected.id, barber_id: barberId }),
      })
      if (res.ok) {
        setMessage({ text: `Assigned ${selected.display_name ?? 'Guest'} successfully.`, ok: true })
        setSelected(null)
        fetchData()
      } else {
        const err = await res.json()
        setMessage({ text: err.error ?? 'Assignment failed.', ok: false })
      }
    } catch {
      setMessage({ text: 'Network error.', ok: false })
    } finally {
      setLoading(false)
    }
  }

  const waiting = walkins
    .filter((w) => w.status === 'WAITING')
    .sort((a, b) => a.position - b.position)

  const eligibleBarbers = barbers.filter((b) => b.walkin_eligible && b.status !== 'OFF')

  return (
    <div className="min-h-screen bg-secondary-950 p-6 flex gap-6">

      {/* Left — Waitlist */}
      <div className="flex-1 max-w-md">
        <h2 className="text-white text-xl font-bold mb-4">Waiting List</h2>

        {waiting.length === 0 ? (
          <p className="text-secondary-400">No one waiting right now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {waiting.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => { setSelected(w); setMessage(null) }}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                    selected?.id === w.id
                      ? 'bg-primary-600/30 border-primary-500 text-white'
                      : 'bg-secondary-800 border-secondary-700 text-secondary-200 hover:border-primary-500/60 hover:bg-secondary-700'
                  }`}
                >
                  <span className="text-secondary-400 font-mono text-sm mr-3">#{w.position}</span>
                  <span className="font-semibold">{w.display_name ?? 'Guest'}</span>
                  {w.preference_type === 'PREFERRED' && w.preferred_barber_id && (
                    <span className="ml-2 text-xs text-amber-400">
                      prefers {barbers.find(b => b.id === w.preferred_barber_id)?.first_name ?? '?'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right — Barber picker */}
      <div className="flex-1 max-w-md">
        <h2 className="text-white text-xl font-bold mb-4">
          {selected
            ? `Assign "${selected.display_name ?? 'Guest'}" to:`
            : 'Select a walk-in first'}
        </h2>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.ok
              ? 'bg-emerald-900/50 border border-emerald-500/40 text-emerald-300'
              : 'bg-red-900/50 border border-red-500/40 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {selected && (
          <ul className="flex flex-col gap-3">
            {eligibleBarbers.map((b) => (
              <li key={b.id}>
                <button
                  disabled={loading}
                  onClick={() => assign(b.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center justify-between ${
                    b.status === 'FREE'
                      ? 'bg-emerald-900/30 border-emerald-500/40 text-white hover:bg-emerald-900/50'
                      : 'bg-secondary-800 border-secondary-700 text-secondary-200 hover:border-secondary-500'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span className="font-semibold">
                    {b.first_name} {b.last_name.charAt(0)}.
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    b.status === 'FREE'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {b.status === 'FREE' ? 'READY' : 'BUSY'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  )
}
