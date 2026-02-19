'use client'

import { useState, useEffect } from 'react'
import type { QueueEntry } from '@/types/dashboard'

interface ActiveClientCardProps {
  client: QueueEntry
  assignmentId: string
  onDone: () => void
  onNoShow: () => void
}

function useElapsedTime(startIso: string) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(startIso).getTime()
      const mins = Math.floor(ms / 60000)
      const secs = Math.floor((ms % 60000) / 1000)
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startIso])

  return elapsed
}

export function ActiveClientCard({ client, assignmentId, onDone, onNoShow }: ActiveClientCardProps) {
  const [loading, setLoading] = useState<'done' | 'noshow' | null>(null)
  const elapsed = useElapsedTime(client.calledAt ?? client.createdAt)

  async function handleDone() {
    setLoading('done')
    try {
      await fetch(`/api/assignments/${assignmentId}`, { method: 'PATCH' })
      onDone()
    } finally {
      setLoading(null)
    }
  }

  async function handleNoShow() {
    setLoading('noshow')
    try {
      await fetch(`/api/walkins/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'NO_SHOW' }),
      })
      onNoShow()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-primary-600/10 border border-primary-600/30 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
        <span className="text-primary-400 text-xs font-medium uppercase tracking-wide">Active</span>
      </div>
      <p className="text-white text-2xl font-bold mb-1">{client.displayName}</p>
      <p className="text-secondary-400 text-sm mb-5">In chair · {elapsed}</p>
      <div className="flex gap-3">
        <button
          onClick={handleDone}
          disabled={loading !== null}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
        >
          {loading === 'done' ? 'Saving…' : '✓ Done'}
        </button>
        <button
          onClick={handleNoShow}
          disabled={loading !== null}
          className="flex-1 bg-secondary-800 hover:bg-red-900/50 text-secondary-300 hover:text-red-400 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
        >
          {loading === 'noshow' ? 'Saving…' : '✗ No-Show'}
        </button>
      </div>
    </div>
  )
}
