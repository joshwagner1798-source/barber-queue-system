'use client'

import { useEffect, useState } from 'react'
import { Toggle } from './Toggle'

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
  is_active: boolean
  display_order: number
}

interface Props {
  shopId: string
}

export function ServicesPanel({ shopId }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editingName, setEditingName] = useState<Record<string, string | null>>({})
  const [editingDuration, setEditingDuration] = useState<Record<string, string | null>>({})
  const [editingPrice, setEditingPrice] = useState<Record<string, string | null>>({})
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', duration: '', price: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    fetch(`/api/owner/services?shop_id=${encodeURIComponent(shopId)}`)
      .then(r => r.json())
      .then(data => setServices(data as Service[]))
      .catch(() => {})
  }, [shopId])

  async function patchService(id: string, patch: Partial<Service>) {
    setSaving(p => ({ ...p, [id]: true }))
    setErrors(p => ({ ...p, [id]: '' }))
    try {
      const res = await fetch(`/api/owner/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Save failed')
      setServices(prev => prev.map(s => s.id === id ? { ...s, ...(data as Service) } : s))
    } catch (err) {
      setErrors(p => ({ ...p, [id]: (err as Error).message }))
    } finally {
      setSaving(p => ({ ...p, [id]: false }))
    }
  }

  async function commitName(id: string) {
    const val = editingName[id]
    if (val == null) return
    setEditingName(p => ({ ...p, [id]: null }))
    if (!val.trim()) return
    const current = services.find(s => s.id === id)
    if (current && val.trim() === current.name) return
    await patchService(id, { name: val.trim() })
  }

  async function commitDuration(id: string) {
    const val = editingDuration[id]
    if (val == null) return
    setEditingDuration(p => ({ ...p, [id]: null }))
    const num = parseInt(val, 10)
    if (isNaN(num) || num <= 0) return
    const current = services.find(s => s.id === id)
    if (current && num === current.duration_minutes) return
    await patchService(id, { duration_minutes: num })
  }

  async function commitPrice(id: string) {
    const val = editingPrice[id]
    if (val == null) return
    setEditingPrice(p => ({ ...p, [id]: null }))
    const num = parseFloat(val)
    if (isNaN(num) || num < 0) return
    const current = services.find(s => s.id === id)
    if (current && num === current.price) return
    await patchService(id, { price: num })
  }

  async function submitAdd() {
    const name = addForm.name.trim()
    const duration = parseInt(addForm.duration, 10)
    const price = parseFloat(addForm.price)
    if (!name) { setAddError('Name is required'); return }
    if (isNaN(duration) || duration <= 0) { setAddError('Duration must be greater than 0'); return }
    if (isNaN(price) || price < 0) { setAddError('Price must be 0 or greater'); return }

    setAddSaving(true)
    setAddError('')
    try {
      const res = await fetch(`/api/owner/services?shop_id=${encodeURIComponent(shopId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, duration_minutes: duration, price }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to add service')
      setServices(prev => [...prev, data as Service])
      setAdding(false)
      setAddForm({ name: '', duration: '', price: '' })
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setAddSaving(false)
    }
  }

  return (
    <section className="border-t border-secondary-800 px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-sm tracking-wide uppercase">Services</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary-700 hover:bg-secondary-600 text-secondary-200 hover:text-white transition-colors"
          >
            + Add service
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {services.map(service => {
          const isSaving = saving[service.id]
          const error = errors[service.id]

          return (
            <div key={service.id} className="flex flex-col gap-1">
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                  service.is_active
                    ? 'bg-secondary-800 border-secondary-700'
                    : 'bg-secondary-900 border-secondary-800 opacity-50'
                }`}
              >
                {/* Name */}
                <div className="flex-1 min-w-0">
                  {editingName[service.id] != null ? (
                    <input
                      autoFocus
                      value={editingName[service.id] ?? ''}
                      onChange={e => setEditingName(p => ({ ...p, [service.id]: e.target.value }))}
                      onBlur={() => commitName(service.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitName(service.id) }}
                      className="w-full bg-secondary-700 border border-secondary-600 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-primary-400"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingName(p => ({ ...p, [service.id]: service.name }))}
                      className="text-white text-sm text-left truncate hover:text-primary-300 transition-colors w-full"
                    >
                      {service.name}
                    </button>
                  )}
                </div>

                {/* Duration */}
                <div className="w-20 flex-shrink-0">
                  {editingDuration[service.id] != null ? (
                    <input
                      autoFocus
                      type="number"
                      value={editingDuration[service.id] ?? ''}
                      onChange={e => setEditingDuration(p => ({ ...p, [service.id]: e.target.value }))}
                      onBlur={() => commitDuration(service.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitDuration(service.id) }}
                      className="w-full bg-secondary-700 border border-secondary-600 rounded px-2 py-0.5 text-white text-sm text-right focus:outline-none focus:border-primary-400"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingDuration(p => ({ ...p, [service.id]: String(service.duration_minutes) }))}
                      className="text-secondary-300 text-sm hover:text-white transition-colors w-full text-right"
                    >
                      {service.duration_minutes}m
                    </button>
                  )}
                </div>

                {/* Price */}
                <div className="w-20 flex-shrink-0">
                  {editingPrice[service.id] != null ? (
                    <input
                      autoFocus
                      type="number"
                      step="0.01"
                      value={editingPrice[service.id] ?? ''}
                      onChange={e => setEditingPrice(p => ({ ...p, [service.id]: e.target.value }))}
                      onBlur={() => commitPrice(service.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitPrice(service.id) }}
                      className="w-full bg-secondary-700 border border-secondary-600 rounded px-2 py-0.5 text-white text-sm text-right focus:outline-none focus:border-primary-400"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingPrice(p => ({ ...p, [service.id]: String(service.price) }))}
                      className="text-secondary-300 text-sm hover:text-white transition-colors w-full text-right"
                    >
                      ${service.price.toFixed(2)}
                    </button>
                  )}
                </div>

                {/* Active toggle */}
                <Toggle
                  checked={service.is_active}
                  disabled={isSaving}
                  onChange={v => patchService(service.id, { is_active: v })}
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs px-3">{error}</p>
              )}
            </div>
          )
        })}

        {/* Add form */}
        {adding && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-secondary-800 border-secondary-600">
              <input
                autoFocus
                placeholder="Name"
                value={addForm.name}
                onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                className="flex-1 bg-secondary-700 border border-secondary-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary-400"
              />
              <input
                type="number"
                placeholder="Min"
                value={addForm.duration}
                onChange={e => setAddForm(p => ({ ...p, duration: e.target.value }))}
                className="w-16 bg-secondary-700 border border-secondary-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-primary-400"
              />
              <input
                type="number"
                step="0.01"
                placeholder="$"
                value={addForm.price}
                onChange={e => setAddForm(p => ({ ...p, price: e.target.value }))}
                className="w-20 bg-secondary-700 border border-secondary-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-primary-400"
              />
              <button
                onClick={submitAdd}
                disabled={addSaving}
                className="px-3 py-1 rounded-lg bg-primary-500 hover:bg-primary-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {addSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setAdding(false)
                  setAddForm({ name: '', duration: '', price: '' })
                  setAddError('')
                }}
                className="px-3 py-1 rounded-lg bg-secondary-700 hover:bg-secondary-600 text-secondary-300 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
            {addError && <p className="text-red-400 text-xs px-3">{addError}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
