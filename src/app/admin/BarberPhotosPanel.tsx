'use client'

import { applyDragDelta } from '@/lib/photo/focusPoint'
import { useEffect, useRef, useState } from 'react'

interface Barber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  photo_x: number | null
  photo_y: number | null
}

export function BarberPhotosPanel() {
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [photoPos, setPhotoPos] = useState<Record<string, { x: number; y: number }>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [saveError, setSaveError] = useState<Record<string, string>>({})
  const dragState = useRef<{
    barberId: string
    startCursor: { x: number; y: number }
    startPos: { x: number; y: number }
    containerSize: { w: number; h: number }
  } | null>(null)
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    fetch('/api/barbers')
      .then(r => r.json())
      .then((data: Barber[]) => {
        setBarbers(data)
        const initial: Record<string, { x: number; y: number }> = {}
        for (const b of data) {
          initial[b.id] = { x: b.photo_x ?? 50, y: b.photo_y ?? 50 }
        }
        setPhotoPos(initial)
      })
      .catch(() => {})
  }, [])

  async function handleFileChange(barberId: string, file: File) {
    setUploading(p => ({ ...p, [barberId]: true }))
    setErrors(p => ({ ...p, [barberId]: '' }))

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/barber-photos/${barberId}`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      // Add cache-bust so the browser re-fetches the new image
      const busted = `${data.publicUrl}?t=${Date.now()}`
      setBarbers(prev =>
        prev.map(b => b.id === barberId ? { ...b, avatar_url: busted } : b)
      )
    } catch (err) {
      setErrors(p => ({ ...p, [barberId]: (err as Error).message }))
    } finally {
      setUploading(p => ({ ...p, [barberId]: false }))
    }
  }

  function handleDragStart(
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    barberId: string,
    containerEl: HTMLDivElement,
  ) {
    e.preventDefault()
    const rect = containerEl.getBoundingClientRect()
    const cursor =
      'touches' in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY }
    dragState.current = {
      barberId,
      startCursor: cursor,
      startPos: photoPos[barberId] ?? { x: 50, y: 50 },
      containerSize: { w: rect.width, h: rect.height },
    }
  }

  function handleDragMove(
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) {
    if (!dragState.current) return
    const { barberId, startCursor, startPos, containerSize } = dragState.current
    const cursor =
      'touches' in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY }
    const delta = { dx: cursor.x - startCursor.x, dy: cursor.y - startCursor.y }
    const newPos = applyDragDelta(startPos, delta, containerSize)
    setPhotoPos(prev => ({ ...prev, [barberId]: newPos }))
  }

  async function handleDragEnd(barberId: string) {
    if (!dragState.current || dragState.current.barberId !== barberId) return
    dragState.current = null
    const pos = photoPos[barberId]
    if (!pos) return
    setSaving(p => ({ ...p, [barberId]: true }))
    setSaveError(p => ({ ...p, [barberId]: '' }))
    try {
      const res = await fetch(`/api/owner/barbers/${barberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_x: pos.x, photo_y: pos.y }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      setSaving(p => ({ ...p, [barberId]: false }))
      setSaved(p => ({ ...p, [barberId]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [barberId]: false })), 2000)
    } catch (err) {
      setSaveError(p => ({ ...p, [barberId]: (err as Error).message }))
      setSaving(p => ({ ...p, [barberId]: false }))
    }
  }

  if (barbers.length === 0) return null

  return (
    <section className="border-t border-secondary-800 px-6 py-5">
      <h2 className="text-white font-semibold text-sm mb-4 tracking-wide uppercase">
        Barber Photos
      </h2>
      <div className="flex flex-wrap gap-4">
        {barbers.map(barber => {
          const initials = `${barber.first_name.charAt(0)}${barber.last_name.charAt(0)}`
          const isUploading = uploading[barber.id]

          return (
            <div key={barber.id} className="flex flex-col items-center gap-2 w-20">
              {/* Photo or initials */}
              <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary-700 flex items-center justify-center flex-shrink-0">
                {barber.avatar_url ? (
                  <img
                    src={barber.avatar_url}
                    alt={`${barber.first_name} ${barber.last_name}`}
                    className="w-full h-full object-cover"
                    style={{
                      objectPosition: `${photoPos[barber.id]?.x ?? 50}% ${photoPos[barber.id]?.y ?? 50}%`,
                    }}
                  />
                ) : (
                  <span className="text-secondary-300 text-lg font-bold select-none">
                    {initials}
                  </span>
                )}
              </div>

              {/* Name */}
              <p className="text-white text-xs font-medium text-center leading-tight">
                {barber.first_name} {barber.last_name.charAt(0)}.
              </p>

              {/* Upload button */}
              <button
                onClick={() => inputRefs.current[barber.id]?.click()}
                disabled={isUploading}
                className="text-xs px-2 py-1 rounded bg-secondary-700 hover:bg-secondary-600 text-secondary-200 hover:text-white transition-colors disabled:opacity-50 w-full text-center"
              >
                {isUploading ? 'Uploading…' : 'Upload'}
              </button>

              {/* Error */}
              {errors[barber.id] && (
                <p className="text-red-400 text-xs text-center leading-tight">
                  {errors[barber.id]}
                </p>
              )}

              {/* Focus point editor — only when photo exists */}
              {barber.avatar_url && (
                <div className="flex flex-col items-center gap-1 mt-1 w-full">
                  <p className="text-secondary-400 text-xs text-center leading-tight">
                    Drag to adjust
                  </p>
                  {/* Circular drag viewport */}
                  <div
                    ref={el => { containerRefs.current[barber.id] = el }}
                    className="w-20 h-20 rounded-full overflow-hidden bg-secondary-700 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
                    onMouseDown={e => {
                      const el = containerRefs.current[barber.id]
                      if (el) handleDragStart(e, barber.id, el)
                    }}
                    onMouseMove={handleDragMove}
                    onMouseUp={() => handleDragEnd(barber.id)}
                    onMouseLeave={() => handleDragEnd(barber.id)}
                    onTouchStart={e => {
                      const el = containerRefs.current[barber.id]
                      if (el) handleDragStart(e, barber.id, el)
                    }}
                    onTouchMove={handleDragMove}
                    onTouchEnd={() => handleDragEnd(barber.id)}
                  >
                    <img
                      src={barber.avatar_url}
                      alt=""
                      draggable={false}
                      className="w-full h-full object-cover pointer-events-none"
                      style={{
                        objectPosition: `${photoPos[barber.id]?.x ?? 50}% ${photoPos[barber.id]?.y ?? 50}%`,
                      }}
                    />
                  </div>
                  {/* Save feedback */}
                  {saving[barber.id] && (
                    <p className="text-secondary-400 text-xs">Saving…</p>
                  )}
                  {saved[barber.id] && (
                    <p className="text-emerald-400 text-xs">Saved</p>
                  )}
                  {saveError[barber.id] && (
                    <p className="text-red-400 text-xs text-center leading-tight">
                      {saveError[barber.id]}
                    </p>
                  )}
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={el => { inputRefs.current[barber.id] = el }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFileChange(barber.id, file)
                  e.target.value = ''
                }}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
