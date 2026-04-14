'use client'

// ---------------------------------------------------------------------------
// SchedulePanel
//
// Shows the barber's appointments for today + the next 7 days.
// Grouped into "Today" and "Upcoming" sections.
// Polls every 60s; no realtime subscription needed (appointments rarely change mid-day).
// ---------------------------------------------------------------------------

import { useEffect, useState, useCallback } from 'react'

interface Appointment {
  id: string
  source: 'provider' | 'native'
  start_at: string
  end_at: string
  client_name: string | null
  service_name: string | null
  status: string
  notes: string | null
}

interface SchedulePanelProps {
  barberId: string
  shopId: string
}

// ── Formatters ──────────────────────────────────────────────────────────────

const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function durationMins(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)
}

// ── Status badge ─────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const s = status.toUpperCase()
  if (s === 'ACTIVE' || s === 'CONFIRMED')
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 uppercase tracking-wide">Confirmed</span>
  if (s === 'PENDING')
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 uppercase tracking-wide">Pending</span>
  if (s === 'COMPLETED')
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary-700 text-secondary-400 uppercase tracking-wide">Done</span>
  return null
}

// ── Appointment card ──────────────────────────────────────────────────────────

function ApptCard({ appt }: { appt: Appointment }) {
  const mins = durationMins(appt.start_at, appt.end_at)
  const isPast = new Date(appt.end_at) < new Date()

  return (
    <div
      className={`bg-secondary-900 rounded-xl px-4 py-3.5 flex items-start justify-between gap-3 ${
        isPast ? 'opacity-50' : ''
      }`}
    >
      {/* Left: time block */}
      <div className="flex-shrink-0 text-right min-w-[60px]">
        <p className="text-white font-semibold text-sm tabular-nums">{formatTime(appt.start_at)}</p>
        <p className="text-secondary-500 text-xs tabular-nums">{mins}m</p>
      </div>

      {/* Divider */}
      <div className="flex-shrink-0 w-px self-stretch bg-secondary-800 mx-1" />

      {/* Right: client + service */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white font-semibold text-sm leading-snug">
            {appt.client_name ?? 'Client'}
          </p>
          {statusBadge(appt.status)}
        </div>
        {appt.service_name && (
          <p className="text-secondary-400 text-xs mt-0.5">{appt.service_name}</p>
        )}
        {appt.notes && (
          <p className="text-secondary-500 text-xs mt-1 italic truncate">{appt.notes}</p>
        )}
      </div>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <p className="text-secondary-400 text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      {count > 0 && (
        <span className="px-1.5 py-0.5 rounded bg-secondary-800 text-secondary-400 text-[10px] font-bold tabular-nums">
          {count}
        </span>
      )}
    </div>
  )
}

// ── Day group (upcoming) ───────────────────────────────────────────────────────

function DayGroup({ date, appts }: { date: string; appts: Appointment[] }) {
  return (
    <div>
      <p className="text-secondary-500 text-xs font-medium mb-2">{formatDate(appts[0].start_at)}</p>
      <div className="space-y-2">
        {appts.map(a => <ApptCard key={a.id} appt={a} />)}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SchedulePanel({ barberId, shopId }: SchedulePanelProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSchedule = useCallback(async () => {
    try {
      const params = new URLSearchParams({ barber_id: barberId, shop_id: shopId })
      const res = await fetch(`/api/barber/schedule?${params}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to load schedule.')
        return
      }
      const data = await res.json()
      setAppointments(data.appointments ?? [])
      setError(null)
    } catch {
      setError('Could not load schedule.')
    } finally {
      setLoading(false)
    }
  }, [barberId, shopId])

  useEffect(() => { fetchSchedule() }, [fetchSchedule])

  // Poll every 60s — appointments rarely change mid-session, but this catches
  // any new bookings or Acuity sync updates.
  useEffect(() => {
    const id = setInterval(fetchSchedule, 60_000)
    return () => clearInterval(id)
  }, [fetchSchedule])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-4 border-secondary-700 border-t-secondary-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-secondary-900 rounded-xl p-6 text-center">
        <p className="text-secondary-400 text-sm">{error}</p>
        <button
          onClick={fetchSchedule}
          className="mt-3 text-primary-400 text-sm hover:text-primary-300 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const todayAppts    = appointments.filter(a => isToday(a.start_at))
  const upcomingAppts = appointments.filter(a => !isToday(a.start_at))

  // Group upcoming by date string
  const upcomingByDate = upcomingAppts.reduce<Record<string, Appointment[]>>((acc, a) => {
    const dateKey = new Date(a.start_at).toLocaleDateString('en-CA') // YYYY-MM-DD local
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(a)
    return acc
  }, {})

  const hasAny = appointments.length > 0

  return (
    <div className="space-y-6">
      {/* Today */}
      <div>
        <SectionHeader label="Today" count={todayAppts.length} />
        {todayAppts.length === 0 ? (
          <div className="bg-secondary-900 border border-secondary-800 border-dashed rounded-xl p-6 text-center">
            <p className="text-secondary-500 text-sm">No appointments today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayAppts.map(a => <ApptCard key={a.id} appt={a} />)}
          </div>
        )}
      </div>

      {/* Upcoming */}
      {upcomingAppts.length > 0 && (
        <div>
          <SectionHeader label="Upcoming" count={upcomingAppts.length} />
          <div className="space-y-5">
            {Object.entries(upcomingByDate).map(([date, appts]) => (
              <DayGroup key={date} date={date} appts={appts} />
            ))}
          </div>
        </div>
      )}

      {!hasAny && (
        <div className="bg-secondary-900 border border-secondary-800 border-dashed rounded-xl p-8 text-center">
          <p className="text-secondary-400 text-sm font-medium">No upcoming appointments</p>
          <p className="text-secondary-600 text-xs mt-1">
            Your scheduled appointments will appear here.
          </p>
        </div>
      )}
    </div>
  )
}
