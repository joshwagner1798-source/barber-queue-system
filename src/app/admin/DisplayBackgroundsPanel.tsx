'use client'

import { useEffect, useRef, useState } from 'react'

interface Settings {
  tv_background_url:    string | null
  kiosk_background_url: string | null
}

export function DisplayBackgroundsPanel() {
  const [settings, setSettings]   = useState<Settings>({ tv_background_url: null, kiosk_background_url: null })
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [resetting, setResetting] = useState<Record<string, boolean>>({})
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const tvInputRef    = useRef<HTMLInputElement>(null)
  const kioskInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/shop-settings')
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {})
  }, [])

  async function handleUpload(target: 'tv' | 'kiosk', file: File) {
    setUploading(p => ({ ...p, [target]: true }))
    setErrors(p => ({ ...p, [target]: '' }))

    const formData = new FormData()
    formData.append('target', target)
    formData.append('file', file)

    try {
      const res  = await fetch('/api/shop-settings/background', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      const busted = `${data.publicUrl}?t=${Date.now()}`
      setSettings(p => ({ ...p, [`${target}_background_url`]: busted }))
    } catch (err) {
      setErrors(p => ({ ...p, [target]: (err as Error).message }))
    } finally {
      setUploading(p => ({ ...p, [target]: false }))
    }
  }

  async function handleReset(target: 'tv' | 'kiosk') {
    setResetting(p => ({ ...p, [target]: true }))
    setErrors(p => ({ ...p, [target]: '' }))
    try {
      const res = await fetch(`/api/shop-settings/background?target=${target}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Reset failed')
      setSettings(p => ({ ...p, [`${target}_background_url`]: null }))
    } catch (err) {
      setErrors(p => ({ ...p, [target]: (err as Error).message }))
    } finally {
      setResetting(p => ({ ...p, [target]: false }))
    }
  }

  const displays: { key: 'tv' | 'kiosk'; label: string; url: string | null; inputRef: React.RefObject<HTMLInputElement> }[] = [
    { key: 'tv',    label: 'TV Display',    url: settings.tv_background_url,    inputRef: tvInputRef    },
    { key: 'kiosk', label: 'Kiosk Display', url: settings.kiosk_background_url, inputRef: kioskInputRef },
  ]

  return (
    <section className="border-t border-secondary-800 px-6 py-5">
      <h2 className="text-white font-semibold text-sm mb-4 tracking-wide uppercase">
        Display Backgrounds
      </h2>
      <div className="flex flex-wrap gap-6">
        {displays.map(({ key, label, url, inputRef }) => (
          <div key={key} className="flex flex-col gap-2 w-48">
            {/* Preview */}
            <div className="w-full aspect-video rounded-lg overflow-hidden bg-secondary-800 border border-secondary-700 flex items-center justify-center relative">
              {url ? (
                <img src={url} alt={`${label} background`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-secondary-500 text-xs text-center px-2">Default background</span>
              )}
            </div>

            {/* Label */}
            <p className="text-white text-xs font-medium">{label}</p>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading[key]}
                className="flex-1 text-xs px-2 py-1.5 rounded bg-secondary-700 hover:bg-secondary-600 text-secondary-200 hover:text-white transition-colors disabled:opacity-50"
              >
                {uploading[key] ? 'Uploading…' : 'Upload'}
              </button>
              {url && (
                <button
                  onClick={() => handleReset(key)}
                  disabled={resetting[key]}
                  className="text-xs px-2 py-1.5 rounded bg-secondary-800 hover:bg-red-900/40 text-secondary-400 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {resetting[key] ? '…' : 'Reset'}
                </button>
              )}
            </div>

            {/* Error */}
            {errors[key] && (
              <p className="text-red-400 text-xs leading-tight">{errors[key]}</p>
            )}

            {/* Hidden file input */}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleUpload(key, file)
                e.target.value = ''
              }}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
