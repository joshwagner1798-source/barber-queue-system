'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarbersBar } from './BarbersBar'
import { LiveQueuePanel } from './LiveQueuePanel'
import { EventLogPanel } from './EventLogPanel'
import { BarberManagementPanel } from './BarberManagementPanel'
import { DisplayBackgroundsPanel } from './DisplayBackgroundsPanel'
import { UISettingsPanel } from './UISettingsPanel'
import type { BarberInfo, QueueEntry, EventEntry, BarberManualState } from '@/types/dashboard'

interface RawWalkin {
  id: string
  display_name: string | null
  status: string
  position: number
  assigned_barber_id: string | null
  called_at: string | null
  created_at: string
}

interface RawBarber {
  id: string
  first_name: string
  last_name: string
}

interface RawState {
  barber_id: string
  state: string
  state_since: string
}

interface RawEvent {
  id: string
  type: string
  payload: Record<string, unknown>
  created_at: string
}

interface Props {
  currentUserName: string
  shopId: string
  initialWalkins: RawWalkin[]
  initialBarbers: RawBarber[]
  initialStates: RawState[]
  initialEvents: RawEvent[]
}

function buildBarberInfos(barbers: RawBarber[], states: RawState[]): BarberInfo[] {
  const stateMap = new Map(states.map(s => [s.barber_id, s]))
  return barbers.map(b => {
    const s = stateMap.get(b.id)
    return {
      id: b.id,
      firstName: b.first_name,
      lastName: b.last_name,
      displayName: `${b.first_name} ${b.last_name}`,
      state: (s?.state ?? 'OFF') as BarberManualState,
      stateSince: s?.state_since ?? '',
    }
  })
}

function buildQueue(walkins: RawWalkin[], barberInfos: BarberInfo[]): QueueEntry[] {
  const barberMap = new Map(barberInfos.map(b => [b.id, b.displayName]))
  return walkins
    .filter(w => ['WAITING', 'CALLED', 'IN_SERVICE'].includes(w.status))
    .sort((a, b) => a.position - b.position)
    .map(w => ({
      id: w.id,
      displayName: w.display_name ?? 'Guest',
      status: w.status as QueueEntry['status'],
      position: w.position,
      assignedBarberId: w.assigned_barber_id,
      assignedBarberName: w.assigned_barber_id ? barberMap.get(w.assigned_barber_id) ?? null : null,
      assignmentId: null,
      calledAt: w.called_at,
      createdAt: w.created_at,
      waitMinutes: Math.floor((Date.now() - new Date(w.created_at).getTime()) / 60000),
    }))
}

export function AdminDashboard({ currentUserName, shopId, initialWalkins, initialBarbers, initialStates, initialEvents }: Props) {
  const [walkins, setWalkins] = useState<RawWalkin[]>(initialWalkins)
  const [barbers, setBarbers] = useState<RawBarber[]>(initialBarbers)
  const [states, setStates] = useState<RawState[]>(initialStates)
  const [events, setEvents] = useState<RawEvent[]>(initialEvents)
  const [forceRefreshing, setForceRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    const [wRes, sRes, eRes] = await Promise.all([
      fetch('/api/walkins'),
      fetch('/api/barber-state'),
      fetch('/api/events'),
    ])
    if (wRes.ok) setWalkins(await wRes.json())
    if (sRes.ok) setStates(await sRes.json())
    if (eRes.ok) setEvents(await eRes.json())
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkins' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_state' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  useEffect(() => {
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  async function forceRefresh() {
    setForceRefreshing(true)
    try {
      await fetch('/api/shop-state', { method: 'POST' })
      await fetchData()
    } finally {
      setForceRefreshing(false)
    }
  }

  const barberInfos = buildBarberInfos(barbers, states)
  const queue = buildQueue(walkins, barberInfos)
  const availableBarbers = barberInfos.filter(b => b.state === 'AVAILABLE')

  const mappedEvents: EventEntry[] = events.map(e => ({
    id: e.id,
    type: e.type,
    payload: e.payload,
    createdAt: e.created_at,
  }))

  return (
    <div className="min-h-screen bg-secondary-950 flex flex-col">
      {/* Header */}
      <header className="bg-secondary-900 border-b border-secondary-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">🏠 Sharper Image Admin</h1>
          <p className="text-secondary-400 text-sm">{currentUserName}</p>
        </div>
        <button
          onClick={forceRefresh}
          disabled={forceRefreshing}
          className="bg-secondary-800 hover:bg-secondary-700 text-secondary-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {forceRefreshing ? 'Refreshing…' : '↻ Force Refresh'}
        </button>
      </header>

      {/* Barbers bar */}
      <BarbersBar
        barbers={barberInfos}
        shopId={shopId}
        onStateChange={(barberId, newState) => {
          setStates(prev => prev.map(s => s.barber_id === barberId ? { ...s, state: newState } : s))
        }}
      />

      {/* Main content */}
      <div className="flex-1 grid grid-cols-[1fr_360px] gap-6 p-6 overflow-hidden">
        <LiveQueuePanel
          queue={queue}
          availableBarbers={availableBarbers}
          shopId={shopId}
          onRefresh={fetchData}
        />
        <EventLogPanel events={mappedEvents} />
      </div>

      {/* Barber management (photo, name, active/walkin toggles) */}
      <BarberManagementPanel shopId={shopId} />

      {/* Display background customization */}
      <DisplayBackgroundsPanel />

      {/* TV display UI settings */}
      <UISettingsPanel shopId={shopId} />
    </div>
  )
}
