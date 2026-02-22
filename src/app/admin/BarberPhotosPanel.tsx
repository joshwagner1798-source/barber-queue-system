'use client'

import { useEffect, useRef, useState } from 'react'

interface Barber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
}

export function BarberPhotosPanel() {
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    fetch('/api/barbers')
      .then(r => r.json())
      .then(setBarbers)
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
