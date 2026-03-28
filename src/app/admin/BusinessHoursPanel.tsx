'use client'

import { useEffect, useState } from 'react'
import { Toggle } from './Toggle'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface DayHours {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

const DEFAULT_HOURS: DayHours[] = DAY_NAMES.map((_, i) => ({
  day_of_week: i,
  open_time: '09:00',
  close_time: '18:00',
  is_closed: false,
}))

interface Props {
  shopId: string
}

export function BusinessHoursPanel({ shopId }: Props) {
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/owner/hours?shop_id=${encodeURIComponent(shopId)}`)
      .then(r => r.json())
      .then((data: DayHours[]) => {
        const merged = DEFAULT_HOURS.map(def => {
          const row = data.find(r => r.day_of_week === def.day_of_week)
          return row ?? def
        })
        setHours(merged)
      })
      .catch(() => {})
  }, [shopId])

  function updateDay(dayOfWeek: number, patch: Partial<DayHours>) {
    setHours(prev => prev.map(h => h.day_of_week === dayOfWeek ? { ...h, ...patch } : h))
  }

  async function saveHours() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch(`/api/owner/hours?shop_id=${encodeURIComponent(shopId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border-t border-secondary-800 px-6 py-5">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-white font-semibold text-sm tracking-wide uppercase">Business Hours</h2>
        {saved && <span className="text-emerald-400 text-xs font-medium">Saved ✓</span>}
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>

      <div className="flex flex-col gap-2">
        {hours.map(day => (
          <div key={day.day_of_week} className="flex items-center gap-3">
            <span className="text-secondary-300 text-sm w-24 flex-shrink-0">{DAY_NAMES[day.day_of_week]}</span>
            <input
              type="text"
              value={day.open_time}
              disabled={day.is_closed || saving}
              onChange={e => updateDay(day.day_of_week, { open_time: e.target.value })}
              placeholder="09:00"
              className="w-20 bg-secondary-800 border border-secondary-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary-400 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-secondary-500 text-sm">–</span>
            <input
              type="text"
              value={day.close_time}
              disabled={day.is_closed || saving}
              onChange={e => updateDay(day.day_of_week, { close_time: e.target.value })}
              placeholder="18:00"
              className="w-20 bg-secondary-800 border border-secondary-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary-400 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-secondary-400 text-xs ml-auto">Closed</span>
            <Toggle
              checked={day.is_closed}
              disabled={saving}
              onChange={v => updateDay(day.day_of_week, { is_closed: v })}
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button
          onClick={saveHours}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save hours'}
        </button>
      </div>
    </section>
  )
}
