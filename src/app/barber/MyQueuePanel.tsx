import type { QueueEntry } from '@/types/dashboard'

interface MyQueuePanelProps {
  queue: QueueEntry[] // already filtered to this barber's WAITING entries
}

export function MyQueuePanel({ queue }: MyQueuePanelProps) {
  if (queue.length === 0) {
    return (
      <div className="bg-secondary-900 rounded-xl p-5 text-center">
        <p className="text-secondary-500 text-sm">No one waiting for you</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {queue.map((entry) => (
        <div key={entry.id} className="bg-secondary-900 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-medium">{entry.displayName}</p>
            <p className="text-secondary-500 text-sm">Waiting · {entry.waitMinutes} min</p>
          </div>
          <span className="text-secondary-600 text-sm">#{entry.position}</span>
        </div>
      ))}
    </div>
  )
}
