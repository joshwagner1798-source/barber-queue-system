'use client'

interface NowServingEntry {
  id: string
  displayName: string
  barberName: string
  status: 'CALLED' | 'IN_SERVICE'
}

interface Props {
  entries: NowServingEntry[]
}

export function NowServing({ entries }: Props) {
  if (entries.length === 0) return null

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4">Now Serving</h2>
      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-lg px-5 py-4 flex items-center justify-between ${
              entry.status === 'CALLED'
                ? 'bg-primary-900/50 border border-primary-500/40 animate-pulse'
                : 'bg-emerald-900/40 border border-emerald-500/30'
            }`}
          >
            <div>
              <p className="text-xl font-bold text-white">{entry.displayName}</p>
              <p className="text-sm text-secondary-300">
                {entry.status === 'CALLED' ? 'Called' : 'In service'} with{' '}
                <span className="font-semibold">{entry.barberName}</span>
              </p>
            </div>
            <div
              className={`text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full ${
                entry.status === 'CALLED'
                  ? 'bg-primary-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {entry.status === 'CALLED' ? 'Go Now' : 'In Chair'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
