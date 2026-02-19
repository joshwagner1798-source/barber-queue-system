'use client'

import type { BarberInfo } from '@/types/dashboard'

interface ReassignPopoverProps {
  availableBarbers: BarberInfo[] // pre-filtered to AVAILABLE only
  onSelect: (barberId: string) => void
  onClose: () => void
}

export function ReassignPopover({ availableBarbers, onSelect, onClose }: ReassignPopoverProps) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 bg-secondary-800 border border-secondary-700 rounded-lg shadow-xl z-20 p-2 min-w-[180px]">
        <p className="text-secondary-400 text-xs px-2 pb-2 font-medium">Reassign to</p>
        {availableBarbers.length === 0 && (
          <p className="text-secondary-500 text-sm px-3 py-2">No available barbers</p>
        )}
        {availableBarbers.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-secondary-300 hover:bg-secondary-700 hover:text-white transition-colors"
          >
            {b.displayName}
          </button>
        ))}
      </div>
    </>
  )
}
