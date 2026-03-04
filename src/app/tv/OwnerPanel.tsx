'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

const FALLBACK_SHOP_ID = '00000000-0000-0000-0000-000000000001'

type Step = 'pin' | 'settings' | null
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface OwnerSettings {
  layout: string
  theme: string
  font_size: string
}

interface OwnerPanelProps {
  open: boolean
  onClose: () => void
}

const DEFAULT_SETTINGS: OwnerSettings = { layout: 'default', theme: 'dark', font_size: 'medium' }
const LAYOUT_OPTIONS = ['default', 'compact', 'wide']
const THEME_OPTIONS = ['dark', 'light', 'midnight']
const FONT_SIZE_OPTIONS = ['small', 'medium', 'large']

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function OwnerPanel({ open, onClose }: OwnerPanelProps) {
  const shopId = useSearchParams().get('shop_id') ?? FALLBACK_SHOP_ID
  const [step, setStep] = useState<Step>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [settings, setSettings] = useState<OwnerSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const pinInputRef = useRef<HTMLInputElement>(null)

  // Sync external open signal with internal step
  useEffect(() => {
    if (open) {
      setStep('pin')
      setPin('')
      setPinError('')
      setSaveStatus('idle')
    } else {
      setStep(null)
    }
  }, [open])

  // Focus pin input when the PIN modal opens
  useEffect(() => {
    if (step === 'pin') {
      const t = setTimeout(() => pinInputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [step])

  // Fetch current settings when the settings panel opens
  useEffect(() => {
    if (step !== 'settings') return
    setLoading(true)
    fetch(`/api/owner/settings?shop_id=${shopId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Partial<OwnerSettings>) => {
        setSettings({
          layout: data.layout ?? DEFAULT_SETTINGS.layout,
          theme: data.theme ?? DEFAULT_SETTINGS.theme,
          font_size: data.font_size ?? DEFAULT_SETTINGS.font_size,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [step])

  function closeAll() {
    setStep(null)
    setPin('')
    setPinError('')
    setSaveStatus('idle')
    onClose()
  }

  function submitPin() {
    const correctPin = process.env.NEXT_PUBLIC_OWNER_PIN ?? ''
    if (!correctPin) {
      setPinError('Owner PIN is not configured.')
      return
    }
    if (pin === correctPin) {
      setStep('settings')
    } else {
      setPinError('Incorrect PIN.')
      setPin('')
      pinInputRef.current?.focus()
    }
  }

  async function saveSettings() {
    setSaveStatus('saving')
    try {
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, ...settings }),
      })
      if (!res.ok) throw new Error()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }

  if (step === null) return null

  return (
    <>
      {/* PIN modal */}
      {step === 'pin' && (
        <div
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && closeAll()}
        >
          <div className="bg-secondary-900 border border-secondary-700 rounded-xl p-8 w-full max-w-sm shadow-2xl">
            <h2 className="text-white text-xl font-bold mb-1">Owner Access</h2>
            <p className="text-secondary-400 text-sm mb-6">Enter the owner PIN to continue.</p>

            <input
              ref={pinInputRef}
              type="password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value)
                setPinError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && submitPin()}
              placeholder="PIN"
              maxLength={20}
              autoComplete="off"
              className="w-full bg-secondary-800 border border-secondary-600 text-white rounded-lg px-4 py-3 text-lg tracking-widest placeholder:tracking-normal placeholder:text-secondary-500 focus:outline-none focus:border-primary-500 mb-3"
            />

            {pinError && (
              <p className="text-red-400 text-sm mb-3">{pinError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={submitPin}
                className="flex-1 bg-primary-600 hover:bg-primary-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                Enter
              </button>
              <button
                onClick={closeAll}
                className="flex-1 bg-secondary-800 hover:bg-secondary-700 text-secondary-300 font-semibold py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner settings modal */}
      {step === 'settings' && (
        <div
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && closeAll()}
        >
          <div className="bg-secondary-900 border border-secondary-700 rounded-xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-xl font-bold">Owner Settings</h2>
              <button
                onClick={closeAll}
                aria-label="Close"
                className="text-secondary-400 hover:text-white transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-secondary-800"
              >
                ×
              </button>
            </div>

            {loading ? (
              <p className="text-secondary-400 text-center py-10">Loading…</p>
            ) : (
              <div className="space-y-5">
                {/* Layout */}
                <div>
                  <label className="block text-secondary-300 text-sm font-medium mb-2">
                    Layout
                  </label>
                  <select
                    value={settings.layout}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, layout: e.target.value }))
                    }
                    className="w-full bg-secondary-800 border border-secondary-600 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary-500"
                  >
                    {LAYOUT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {capitalize(opt)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Theme */}
                <div>
                  <label className="block text-secondary-300 text-sm font-medium mb-2">
                    Theme
                  </label>
                  <select
                    value={settings.theme}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, theme: e.target.value }))
                    }
                    className="w-full bg-secondary-800 border border-secondary-600 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary-500"
                  >
                    {THEME_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {capitalize(opt)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Font Size */}
                <div>
                  <label className="block text-secondary-300 text-sm font-medium mb-2">
                    Font Size
                  </label>
                  <select
                    value={settings.font_size}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, font_size: e.target.value }))
                    }
                    className="w-full bg-secondary-800 border border-secondary-600 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary-500"
                  >
                    {FONT_SIZE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {capitalize(opt)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={saveSettings}
                    disabled={saveStatus === 'saving'}
                    className="flex-1 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    {saveStatus === 'saving'
                      ? 'Saving…'
                      : saveStatus === 'saved'
                        ? 'Saved!'
                        : 'Save Changes'}
                  </button>
                  <button
                    onClick={closeAll}
                    className="flex-1 bg-secondary-800 hover:bg-secondary-700 text-secondary-300 font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>

                {saveStatus === 'error' && (
                  <p className="text-red-400 text-sm text-center">
                    Failed to save. Please try again.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
