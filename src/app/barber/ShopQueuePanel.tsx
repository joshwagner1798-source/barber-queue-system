import type { QueueEntry } from '@/types/dashboard'

interface ShopQueuePanelProps {
  queue: QueueEntry[]
  currentBarberId: string
}

export function ShopQueuePanel({ queue, currentBarberId }: ShopQueuePanelProps) {
  return (
    <div className="bg-secondary-900 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-secondary-800">
        <h3 className="text-secondary-400 text-xs font-medium uppercase tracking-wide">
          Shop Queue ({queue.length})
        </h3>
      </div>
      <div className="divide-y divide-secondary-800/50 overflow-y-auto max-h-[calc(100vh-220px)]">
        {queue.length === 0 && (
          <p className="text-secondary-500 text-sm text-center py-8">Queue is empty</p>
        )}
        {queue.map((entry) => {
          const isMine = entry.assignedBarberId === currentBarberId
          return (
            <div
              key={entry.id}
              className={`px-4 py-3 flex items-center justify-between ${
                isMine ? 'bg-primary-600/5 border-l-2 border-primary-500' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-secondary-600 text-xs w-5">#{entry.position}</span>
                <div>
                  <p className={`text-sm font-medium ${isMine ? 'text-white' : 'text-secondary-300'}`}>
                    {entry.displayName}
                  </p>
                  {entry.assignedBarberName && (
                    <p className="text-secondary-500 text-xs">→ {entry.assignedBarberName}</p>
                  )}
                </div>
              </div>
              <span className="text-secondary-600 text-xs">{entry.waitMinutes}m</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
