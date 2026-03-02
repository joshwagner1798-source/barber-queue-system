'use client'

import { useEffect, useRef, useState } from 'react'

interface Barber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  is_active: boolean
  walkin_enabled: boolean
  display_order: number
}

interface Props {
  shopId: string
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        checked ? 'bg-primary-500' : 'bg-secondary-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export function BarberManagementPanel({ shopId }: Props) {
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editingName, setEditingName] = useState<Record<string, { first: string; last: string } | null>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    fetch(`/api/owner/barbers?shop_id=${encodeURIComponent(shopId)}`)
      .then((r) => r.json())
      .then((data) => setBarbers(data as Barber[]))
      .catch(() => {})
  }, [shopId])

  async function patchBarber(barberId: string, patch: Partial<Barber>) {
    setSaving((p) => ({ ...p, [barberId]: true }))
    setErrors((p) => ({ ...p, [barberId]: '' }))
    try {
      const res = await fetch(`/api/owner/barbers/${barberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setBarbers((prev) => prev.map((b) => (b.id === barberId ? { ...b, ...data } : b)))
    } catch (err) {
      setErrors((p) => ({ ...p, [barberId]: (err as Error).message }))
    } finally {
      setSaving((p) => ({ ...p, [barberId]: false }))
    }
  }

  async function handleFileChange(barberId: string, file: File) {
    setUploading((p) => ({ ...p, [barberId]: true }))
    setErrors((p) => ({ ...p, [barberId]: '' }))
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`/api/barber-photos/${barberId}`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      const busted = `${data.publicUrl}?t=${Date.now()}`
      setBarbers((prev) => prev.map((b) => (b.id === barberId ? { ...b, avatar_url: busted } : b)))
    } catch (err) {
      setErrors((p) => ({ ...p, [barberId]: (err as Error).message }))
    } finally {
      setUploading((p) => ({ ...p, [barberId]: false }))
    }
  }

  function startEditing(barber: Barber) {
    setEditingName((p) => ({ ...p, [barber.id]: { first: barber.first_name, last: barber.last_name } }))
  }

  async function commitNameEdit(barberId: string) {
    const edit = editingName[barberId]
    if (!edit) return
    const barber = barbers.find((b) => b.id === barberId)
    if (
      barber &&
      edit.first.trim() === barber.first_name &&
      edit.last.trim() === barber.last_name
    ) {
      setEditingName((p) => ({ ...p, [barberId]: null }))
      return
    }
    await patchBarber(barberId, { first_name: edit.first.trim(), last_name: edit.last.trim() })
    setEditingName((p) => ({ ...p, [barberId]: null }))
  }

  if (barbers.length === 0) return null

  return (
    <section className="border-t border-secondary-800 px-6 py-5">
      <h2 className="text-white font-semibold text-sm mb-4 tracking-wide uppercase">
        Barber Management
      </h2>
      <div className="flex flex-wrap gap-4">
        {barbers.map((barber) => {
          const initials = `${barber.first_name.charAt(0)}${barber.last_name.charAt(0)}`
          const isUploading = uploading[barber.id]
          const isSaving = saving[barber.id]
          const editState = editingName[barber.id]

          return (
            <div
              key={barber.id}
              className={`flex flex-col items-center gap-2 w-28 p-3 rounded-xl border transition-colors ${
                barber.is_active
                  ? 'bg-secondary-800 border-secondary-700'
                  : 'bg-secondary-900 border-secondary-800 opacity-60'
              }`}
            >
              {/* Avatar */}
              <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary-700 flex items-center justify-center flex-shrink-0">
                {barber.avatar_url ? (
                  <img
                    src={barber.avatar_url}
                    alt={`${barber.first_name} ${barber.last_name}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-secondary-300 text-lg font-bold select-none">{initials}</span>
                )}
              </div>

              {/* Name (click to edit) */}
              {editState ? (
                <div className="flex flex-col gap-1 w-full">
                  <input
                    autoFocus
                    value={editState.first}
                    onChange={(e) =>
                      setEditingName((p) => ({ ...p, [barber.id]: { ...p[barber.id]!, first: e.target.value } }))
                    }
                    onBlur={() => commitNameEdit(barber.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitNameEdit(barber.id) }}
                    className="w-full bg-secondary-700 border border-secondary-600 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-primary-400"
                    placeholder="First"
                  />
                  <input
                    value={editState.last}
                    onChange={(e) =>
                      setEditingName((p) => ({ ...p, [barber.id]: { ...p[barber.id]!, last: e.target.value } }))
                    }
                    onBlur={() => commitNameEdit(barber.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitNameEdit(barber.id) }}
                    className="w-full bg-secondary-700 border border-secondary-600 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-primary-400"
                    placeholder="Last"
                  />
                </div>
              ) : (
                <button
                  onClick={() => startEditing(barber)}
                  className="text-white text-xs font-medium text-center leading-tight hover:text-primary-300 transition-colors"
                  title="Click to edit name"
                >
                  {barber.first_name} {barber.last_name}
                </button>
              )}

              {/* Upload button */}
              <button
                onClick={() => inputRefs.current[barber.id]?.click()}
                disabled={isUploading}
                className="text-xs px-2 py-1 rounded bg-secondary-700 hover:bg-secondary-600 text-secondary-200 hover:text-white transition-colors disabled:opacity-50 w-full text-center"
              >
                {isUploading ? 'Uploading…' : 'Photo'}
              </button>

              {/* Toggles */}
              <div className="flex flex-col gap-1.5 w-full">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-secondary-400 text-xs">Show on TV</span>
                  <Toggle
                    checked={barber.is_active}
                    disabled={isSaving}
                    onChange={(v) => patchBarber(barber.id, { is_active: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-secondary-400 text-xs">Walk-ins</span>
                  <Toggle
                    checked={barber.walkin_enabled}
                    disabled={isSaving}
                    onChange={(v) => patchBarber(barber.id, { walkin_enabled: v })}
                  />
                </div>
              </div>

              {/* Error */}
              {errors[barber.id] && (
                <p className="text-red-400 text-xs text-center leading-tight">{errors[barber.id]}</p>
              )}

              {/* Hidden file input */}
              <input
                ref={(el) => { inputRefs.current[barber.id] = el }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
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
