'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useMotionEnabled } from '@/hooks/useMotionEnabled'

interface WaitingEntry {
  id: string
  position: number
  displayName: string
  preferenceType: string
  preferredBarberName: string | null
}

interface Props {
  entries: WaitingEntry[]
}

export function WaitingList({ entries }: Props) {
  const motionEnabled = useMotionEnabled()

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Waiting</h2>
        <span className="text-lg text-secondary-400">
          {entries.length} walk-in{entries.length !== 1 ? 's' : ''} waiting
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-secondary-500 text-lg">No one waiting right now.</p>
      ) : (
        <ol className="space-y-2">
          <AnimatePresence initial={false}>
            {entries.map((entry, idx) => {
              const content = (
                <>
                  <span className="text-2xl font-bold text-primary-400 w-8 text-center">
                    {idx + 1}
                  </span>
                  <span className="text-xl text-white font-medium flex-1">
                    {entry.displayName}
                  </span>
                  {entry.preferenceType === 'PREFERRED' && entry.preferredBarberName && (
                    <span className="text-sm text-secondary-400 italic">
                      Waiting for {entry.preferredBarberName}
                    </span>
                  )}
                </>
              )

              return motionEnabled ? (
                <motion.li
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } }}
                  className="flex items-center gap-4 bg-secondary-800/50 rounded-lg px-4 py-3"
                >
                  {content}
                </motion.li>
              ) : (
                <li
                  key={entry.id}
                  className="flex items-center gap-4 bg-secondary-800/50 rounded-lg px-4 py-3"
                >
                  {content}
                </li>
              )
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  )
}
