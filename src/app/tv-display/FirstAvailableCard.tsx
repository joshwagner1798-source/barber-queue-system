'use client'

import { useState } from 'react'

interface Props {
  shopBookingUrl: string | null
  onQueue: () => void
}

export function FirstAvailableCard({ shopBookingUrl, onQueue }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl overflow-hidden">
      {/* Card header — always visible, tappable */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left active:scale-95 transition-transform"
      >
        {/* Icon circle */}
        <div className="flex-shrink-0 w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-2xl">
          ✂️
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white">First Available</p>
          <p className="text-sm text-zinc-400">Whoever&apos;s ready for you</p>
        </div>

        <svg
          className={`w-5 h-5 text-zinc-500 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Expanded CTAs */}
      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {shopBookingUrl && (
            <a
              href={shopBookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-base py-3 rounded-xl text-center transition-colors block"
            >
              Book a Time
            </a>
          )}
          <button
            onClick={onQueue}
            className="w-full border-2 border-white text-white font-semibold text-base py-3 rounded-xl hover:bg-white/10 transition-colors"
          >
            Hop in Queue
          </button>
        </div>
      )}
    </div>
  )
}
