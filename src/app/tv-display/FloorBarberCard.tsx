'use client'

interface Props {
  name: string
  initials: string
  avatarUrl: string | null
  status: string
  freeAt: string | null
  nowServingName: string | null
}

export function FloorBarberCard({
  name,
  initials,
  avatarUrl,
  status,
  freeAt,
  nowServingName,
}: Props) {
  let badge = 'OFF'
  let badgeCls = 'bg-secondary-700/60 text-secondary-400'
  let ringCls = 'ring-secondary-700'

  switch (status) {
    case 'FREE':
      badge = 'READY'
      badgeCls = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
      ringCls = 'ring-emerald-500/60'
      break
    case 'BUSY':
      badge = 'BUSY'
      badgeCls = 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
      ringCls = 'ring-amber-500/40'
      break
    case 'UNAVAILABLE':
      badge = 'ON BREAK'
      badgeCls = 'bg-secondary-600/30 text-secondary-400 border border-secondary-500/30'
      ringCls = 'ring-secondary-600/40'
      break
  }

  // "Free at HH:MM" shown when BUSY
  let nextTimeText: string | null = null
  if (freeAt && status === 'BUSY') {
    const d = new Date(freeAt)
    nextTimeText = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="flex flex-col items-center p-5 bg-secondary-800/50 rounded-2xl min-w-[148px] max-w-[164px] border border-secondary-700/40">
      {/* Circular photo / initials */}
      <div
        className={`w-20 h-20 rounded-full ring-2 ${ringCls} overflow-hidden mb-3 flex items-center justify-center bg-secondary-700 flex-shrink-0`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl font-bold text-secondary-300">{initials}</span>
        )}
      </div>

      {/* Name */}
      <h3 className="text-white font-semibold text-center mb-2 text-sm leading-tight">
        {name}
      </h3>

      {/* Status badge */}
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeCls}`}>
        {badge}
      </span>

      {/* Sub-line: serving name OR next-free time */}
      <div className="mt-2 text-center min-h-[2rem] flex flex-col justify-center">
        {nowServingName ? (
          <>
            <p className="text-xs text-secondary-500 uppercase tracking-wider">Serving</p>
            <p className="text-xs text-white font-medium">{nowServingName}</p>
          </>
        ) : nextTimeText ? (
          <>
            <p className="text-xs text-secondary-500 uppercase tracking-wider">Free at</p>
            <p className="text-xs text-amber-300 font-medium">{nextTimeText}</p>
          </>
        ) : status === 'FREE' ? (
          <p className="text-xs text-emerald-400 font-medium">Walk right in</p>
        ) : null}
      </div>
    </div>
  )
}
