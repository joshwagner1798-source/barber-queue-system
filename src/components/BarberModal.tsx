'use client'

import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { getBarberStatusText, getBarberStatusColor } from '@/lib/mobile-queue/status'

interface Props {
  isOpen: boolean
  onClose: () => void
  onQueue: () => void
  firstName: string
  lastName: string
  avatarUrl: string | null
  status: string
  busyReason?: string | null
  freeAt?: string | null
  blockedUntil?: string | null
  offLabel?: string | null
  walkinEligible: boolean
  directBookingUrl: string | null
  shopBookingUrl: string | null
}

const statusColorClasses: Record<string, string> = {
  emerald: 'text-emerald-400 bg-emerald-400/10',
  amber:   'text-amber-400 bg-amber-400/10',
  red:     'text-red-400 bg-red-400/10',
  zinc:    'text-zinc-400 bg-zinc-400/10',
}

export function BarberModal({
  isOpen,
  onClose,
  onQueue,
  firstName,
  lastName,
  avatarUrl,
  status,
  busyReason,
  freeAt,
  blockedUntil,
  offLabel,
  walkinEligible,
  directBookingUrl,
  shopBookingUrl,
}: Props) {
  const initials    = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const statusText  = getBarberStatusText({ status, busy_reason: busyReason, free_at: freeAt, blocked_until: blockedUntil, off_label: offLabel })
  const color       = getBarberStatusColor(status)
  const resolvedUrl = directBookingUrl ?? shopBookingUrl

  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const nextOpening = (status === 'BUSY' && freeAt)
    ? `Next opening: ${timeFmt.format(new Date(freeAt))}`
    : null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900/95 rounded-t-3xl shadow-2xl border-t border-zinc-800 pb-safe"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-zinc-700" />
            </div>

            <div className="flex flex-col items-center px-6 pb-8 pt-4 gap-4">
              {/* Photo — 120px per spec */}
              <div className="relative w-[120px] h-[120px] rounded-full overflow-hidden bg-zinc-700 flex items-center justify-center flex-shrink-0">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={`${firstName} ${lastName}`}
                    fill
                    className="object-cover"
                    sizes="120px"
                  />
                ) : (
                  <span className="text-3xl font-bold text-zinc-300">{initials}</span>
                )}
              </div>

              {/* Name */}
              <h2 className="text-2xl font-bold text-white">{firstName} {lastName}</h2>

              {/* Status badge */}
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${statusColorClasses[color] ?? statusColorClasses.zinc}`}>
                {statusText}
              </span>

              {/* Next opening */}
              {nextOpening && (
                <p className="text-sm text-zinc-400">{nextOpening}</p>
              )}

              <hr className="w-full border-zinc-800" />

              {/* Book a Time */}
              {resolvedUrl && (
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg py-4 rounded-xl text-center transition-colors block"
                >
                  Book a Time
                </a>
              )}

              {/* Hop in Queue */}
              <div className="w-full">
                <button
                  onClick={walkinEligible ? onQueue : undefined}
                  disabled={!walkinEligible}
                  className={`w-full border-2 font-semibold text-lg py-4 rounded-xl transition-colors ${
                    walkinEligible
                      ? 'border-white text-white hover:bg-white/10'
                      : 'border-zinc-700 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  Hop in Queue
                </button>
                {!walkinEligible && (
                  <p className="text-center text-xs text-zinc-500 mt-2">Walk-ins unavailable</p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
