'use client'

import { useEffect, useState } from 'react'
import type { OwnerSettings } from '@/types/database'

interface Props {
  shopId: string
}

type Layout   = OwnerSettings['layout']
type Theme    = OwnerSettings['theme']
type FontSize = OwnerSettings['font_size']

const DEFAULTS: Omit<OwnerSettings, 'shop_id' | 'updated_at'> = {
  layout: 'compact',
  theme: 'dark',
  font_size: 'md',
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onSelect,
  saving,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onSelect: (v: T) => void
  saving: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-secondary-400 text-xs font-semibold uppercase tracking-wide">{label}</p>
      <div className="flex gap-2 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.value}
            disabled={saving}
            onClick={() => onSelect(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              value === opt.value
                ? 'bg-primary-500 text-white'
                : 'bg-secondary-700 text-secondary-300 hover:bg-secondary-600 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function UISettingsPanel({ shopId }: Props) {
  const [settings, setSettings] = useState<Omit<OwnerSettings, 'shop_id' | 'updated_at'>>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/owner/settings?shop_id=${encodeURIComponent(shopId)}`)
      .then((r) => r.json())
      .then((data: OwnerSettings) => {
        setSettings({ layout: data.layout, theme: data.theme, font_size: data.font_size })
      })
      .catch(() => {})
  }, [shopId])

  async function update(patch: Partial<Omit<OwnerSettings, 'shop_id' | 'updated_at'>>) {
    const next = { ...settings, ...patch }
    setSettings(next) // optimistic
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch(`/api/owner/settings?shop_id=${encodeURIComponent(shopId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError((err as Error).message)
      setSettings(settings) // revert on error
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border-t border-secondary-800 px-6 py-5">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-white font-semibold text-sm tracking-wide uppercase">TV Display Settings</h2>
        {saved && <span className="text-emerald-400 text-xs font-medium">Saved ✓</span>}
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>
      <div className="flex flex-col gap-4">
        <OptionGroup<Layout>
          label="Layout"
          value={settings.layout}
          saving={saving}
          onSelect={(v) => update({ layout: v })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'large',   label: 'Large' },
          ]}
        />
        <OptionGroup<Theme>
          label="Theme"
          value={settings.theme}
          saving={saving}
          onSelect={(v) => update({ theme: v })}
          options={[
            { value: 'dark',  label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
        <OptionGroup<FontSize>
          label="Font Size"
          value={settings.font_size}
          saving={saving}
          onSelect={(v) => update({ font_size: v })}
          options={[
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' },
          ]}
        />
      </div>
    </section>
  )
}
