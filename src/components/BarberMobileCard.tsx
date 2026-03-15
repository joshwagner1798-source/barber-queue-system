'use client'

import Image from 'next/image'
import { getBarberStatusText, getBarberStatusColor } from '@/lib/mobile-queue/status'

interface Props {
  firstName: string
  lastName: string
  avatarUrl: string | null
  status: string
  busyReason?: string | null
  freeAt?: string | null
  blockedUntil?: string | null
  offLabel?: string | null
  onClick: () => void
}

const colorClasses: Record<string, string> = {
  emerald: 'text-emerald-400',
  amber:   'text-amber-400',
  red:     'text-red-400',
  zinc:    'text-zinc-400',
}

export function BarberMobileCard({
  firstName,
  lastName,
  avatarUrl,
  status,
  busyReason,
  freeAt,
  blockedUntil,
  offLabel,
  onClick,
}: Props) {
  const initials   = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const statusText = getBarberStatusText({ status, busy_reason: busyReason, free_at: freeAt, blocked_until: blockedUntil, off_label: offLabel })
  const color      = getBarberStatusColor(status)

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-left active:scale-95 transition-transform"
    >
      {/* Photo / initials */}
      <div className="relative flex-shrink-0 w-16 h-16 rounded-full overflow-hidden bg-zinc-700 flex items-center justify-center">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${firstName} ${lastName}`}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <span className="text-lg font-bold text-zinc-300">{initials}</span>
        )}
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white truncate">{firstName} {lastName}</p>
        <p className={`text-sm ${colorClasses[color] ?? 'text-zinc-400'}`}>{statusText}</p>
      </div>

      {/* Chevron */}
      <svg className="w-5 h-5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
