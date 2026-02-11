'use client'

interface Props {
  barberName: string
  status: string
  statusDetail: string | null
  freeAt: string | null
  nowServingName: string | null
}

export function BarberStatusCard({
  barberName,
  status,
  statusDetail,
  freeAt,
  nowServingName,
}: Props) {
  let bgColor = 'bg-secondary-800'
  let statusLabel = 'OFF'
  let statusColor = 'text-secondary-400'
  let freeInText: string | null = null

  switch (status) {
    case 'FREE':
      bgColor = 'bg-emerald-900/60 border border-emerald-500/40'
      statusLabel = 'FREE NOW'
      statusColor = 'text-emerald-400'
      break
    case 'BUSY':
      bgColor = 'bg-amber-900/40 border border-amber-500/30'
      statusLabel = 'BUSY'
      statusColor = 'text-amber-400'
      if (freeAt) {
        const diffMs = new Date(freeAt).getTime() - Date.now()
        const mins = Math.max(0, Math.ceil(diffMs / 60_000))
        freeInText = `Free in ${mins}m`
      }
      break
    case 'UNAVAILABLE':
      bgColor = 'bg-secondary-800/80 border border-secondary-600/30'
      statusLabel = 'UNAVAILABLE'
      statusColor = 'text-secondary-400'
      break
    default:
      break
  }

  return (
    <div className={`rounded-xl p-5 ${bgColor} flex flex-col justify-between min-h-[160px]`}>
      <div>
        <h3 className="text-2xl font-bold text-white mb-1">{barberName}</h3>
        <p className={`text-lg font-semibold ${statusColor}`}>{statusLabel}</p>
        {freeInText && (
          <p className="text-sm text-amber-300/80 mt-1">{freeInText}</p>
        )}
        {status === 'UNAVAILABLE' && statusDetail && (
          <p className="text-sm text-secondary-400 mt-1 italic">{statusDetail}</p>
        )}
      </div>

      {nowServingName && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-xs text-secondary-400 uppercase tracking-wider">Now Serving</p>
          <p className="text-lg font-semibold text-white">{nowServingName}</p>
        </div>
      )}
    </div>
  )
}
