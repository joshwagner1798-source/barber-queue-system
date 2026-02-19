'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StatusBar } from './StatusBar'
import { ActiveClientCard } from './ActiveClientCard'
import { MyQueuePanel } from './MyQueuePanel'
import { ShopQueuePanel } from './ShopQueuePanel'
import type { QueueEntry, BarberManualState } from '@/types/dashboard'

interface RawWalkin {
  id: string
  display_name: string | null
  status: string
  position: number
  assigned_barber_id: string | null
  called_at: string | null
  created_at: string
}

interface RawState {
  barber_id: string
  state: string
}

interface Props {
  currentBarberId: string
  currentBarberName: string
  shopId: string
  initialWalkins: RawWalkin[]
  initialBarbers: { id: string; first_name: string; last_name: string }[]
  initialStates: RawState[]
  initialActiveAssignmentId: string | null
}

function toQueueEntry(w: RawWalkin, barberName: string | null): QueueEntry {
  const waitMs = Date.now() - new Date(w.created_at).getTime()
  return {
    id: w.id,
    displayName: w.display_name ?? 'Guest',
    status: w.status as QueueEntry['status'],
    position: w.position,
    assignedBarberId: w.assigned_barber_id,
    assignedBarberName: barberName,
    assignmentId: null,
    calledAt: w.called_at,
    createdAt: w.created_at,
    waitMinutes: Math.floor(waitMs / 60000),
  }
}

export function BarberDashboard({
  currentBarberId,
  currentBarberName,
  shopId,
  initialWalkins,
  initialBarbers,
  initialStates,
  initialActiveAssignmentId,
}: Props) {
  const barberNameMap = new Map(initialBarbers.map(b => [b.id, `${b.first_name} ${b.last_name}`]))

  const [walkins, setWalkins] = useState<RawWalkin[]>(initialWalkins)
  const [states, setStates] = useState<RawState[]>(initialStates)
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(initialActiveAssignmentId)

  const myStateRaw = states.find(s => s.barber_id === currentBarberId)?.state ?? 'OFF'
  const myState: BarberManualState = myStateRaw as BarberManualState

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/walkins')
    if (res.ok) {
      const data = await res.json()
      setWalkins(data)
    }
    const res2 = await fetch('/api/barber-state')
    if (res2.ok) {
      const data2 = await res2.json()
      setStates(data2)
    }
  }, [])

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('barber-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkins' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_state' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  // 60s polling fallback
  useEffect(() => {
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  // Derive display data
  const allQueue: QueueEntry[] = walkins
    .filter(w => ['WAITING', 'CALLED', 'IN_SERVICE'].includes(w.status))
    .sort((a, b) => a.position - b.position)
    .map(w => toQueueEntry(w, w.assigned_barber_id ? barberNameMap.get(w.assigned_barber_id) ?? null : null))

  const activeClient = allQueue.find(
    e => e.assignedBarberId === currentBarberId && (e.status === 'CALLED' || e.status === 'IN_SERVICE')
  )

  const myQueue = allQueue.filter(
    e => e.assignedBarberId === currentBarberId && e.status === 'WAITING'
  )

  return (
    <div className="min-h-screen bg-secondary-950 flex flex-col">
      <StatusBar
        barberId={currentBarberId}
        barberName={currentBarberName}
        shopId={shopId}
        currentState={(['AVAILABLE', 'ON_BREAK', 'OFF'].includes(myState) ? myState : 'OFF') as 'AVAILABLE' | 'ON_BREAK' | 'OFF'}
        onStateChange={(newState) => {
          setStates(prev =>
            prev.map(s => s.barber_id === currentBarberId ? { ...s, state: newState } : s)
          )
        }}
      />
      <div className="flex-1 grid grid-cols-[1fr_400px] gap-6 p-6">
        {/* Left: My Queue */}
        <div className="space-y-4">
          <h2 className="text-secondary-400 text-xs font-medium uppercase tracking-wide">
            My Queue ({myQueue.length + (activeClient ? 1 : 0)})
          </h2>
          {activeClient ? (
            <ActiveClientCard
              client={activeClient}
              assignmentId={activeAssignmentId ?? activeClient.id}
              onDone={fetchData}
              onNoShow={fetchData}
            />
          ) : (
            <div className="bg-secondary-900 border border-secondary-800 border-dashed rounded-xl p-6 text-center">
              <p className="text-secondary-500 text-sm">No active client</p>
            </div>
          )}
          <MyQueuePanel queue={myQueue} />
        </div>
        {/* Right: Shop Queue */}
        <ShopQueuePanel queue={allQueue} currentBarberId={currentBarberId} />
      </div>
    </div>
  )
}
