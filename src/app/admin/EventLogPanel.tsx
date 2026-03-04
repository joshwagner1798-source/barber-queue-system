import type { EventEntry } from '@/types/dashboard'

interface EventLogPanelProps {
  events: EventEntry[]
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 3600000) {
    return `${Math.floor(diffMs / 60000)}m ago`
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatEventType(type: string) {
  return type.replace(/_/g, ' ').toLowerCase()
}

export function EventLogPanel({ events }: EventLogPanelProps) {
  return (
    <div className="flex flex-col bg-secondary-900 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-secondary-800">
        <h2 className="text-white font-semibold">Event Log</h2>
      </div>
      <div className="overflow-y-auto divide-y divide-secondary-800/50 flex-1">
        {events.length === 0 && (
          <p className="text-secondary-500 text-sm text-center py-12">No events yet</p>
        )}
        {events.map((event) => (
          <div key={event.id} className="px-5 py-3 flex items-start gap-3">
            <span className="text-secondary-600 text-xs mt-0.5 whitespace-nowrap">
              {formatTime(event.createdAt)}
            </span>
            <p className="text-secondary-300 text-sm">{formatEventType(event.type)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
