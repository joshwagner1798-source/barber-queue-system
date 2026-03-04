'use client'

import { useState } from 'react'
import { ReassignPopover } from './ReassignPopover'
import type { QueueEntry, BarberInfo } from '@/types/dashboard'

interface LiveQueuePanelProps {
  queue: QueueEntry[]
  availableBarbers: BarberInfo[]
  shopId: string
  onRefresh: () => void
}

export function LiveQueuePanel({ queue, availableBarbers, shopId, onRefresh }: LiveQueuePanelProps) {
  const [reassignTarget, setReassignTarget] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  async function callNext(walkinId: string) {
    setLoadingAction(walkinId)
    try {
      await fetch('/api/walkins/' + walkinId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CALLED' }),
      })
      onRefresh()
    } finally {
      setLoadingAction(null)
    }
  }

  async function reassign(walkinId: string, barberId: string) {
    setLoadingAction(walkinId)
    setReassignTarget(null)
    try {
      await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, walkin_id: walkinId, barber_id: barberId }),
      })
      onRefresh()
    } finally {
      setLoadingAction(null)
    }
  }

  async function remove(walkinId: string) {
    setLoadingAction(walkinId)
    try {
      await fetch('/api/walkins/' + walkinId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REMOVED' }),
      })
      onRefresh()
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="flex flex-col bg-secondary-900 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-secondary-800 flex items-center justify-between">
        <h2 className="text-white font-semibold">Live Queue ({queue.length})</h2>
      </div>
      <div className="overflow-y-auto divide-y divide-secondary-800/50">
        {queue.length === 0 && (
          <p className="text-secondary-500 text-sm text-center py-12">Queue is empty</p>
        )}
        {queue.map((entry) => (
          <div key={entry.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <span className="text-secondary-600 text-sm mt-0.5">#{entry.position}</span>
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{entry.displayName}</p>
                  <p className="text-secondary-500 text-xs">
                    {entry.assignedBarberName ? `→ ${entry.assignedBarberName}` : 'Unassigned'} · {entry.waitMinutes}m
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 relative shrink-0">
                {entry.status === 'WAITING' && (
                  <button
                    onClick={() => callNext(entry.id)}
                    disabled={loadingAction === entry.id}
                    className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Call
                  </button>
                )}
                <button
                  onClick={() => setReassignTarget(reassignTarget === entry.id ? null : entry.id)}
                  disabled={loadingAction === entry.id}
                  className="text-xs bg-secondary-800 hover:bg-secondary-700 text-secondary-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Reassign
                </button>
                <button
                  onClick={() => remove(entry.id)}
                  disabled={loadingAction === entry.id}
                  className="text-xs text-secondary-500 hover:text-red-400 px-2 py-1.5 transition-colors disabled:opacity-50"
                >
                  ✕
                </button>
                {reassignTarget === entry.id && (
                  <ReassignPopover
                    availableBarbers={availableBarbers}
                    onSelect={(barberId) => reassign(entry.id, barberId)}
                    onClose={() => setReassignTarget(null)}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
