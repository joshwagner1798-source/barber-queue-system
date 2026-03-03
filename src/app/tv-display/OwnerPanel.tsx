'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type OwnerSettings = {
  layout: 'compact' | 'large'
  theme: 'dark' | 'light'
  font_size: 'sm' | 'md' | 'lg'
}

const DEFAULTS: OwnerSettings = { layout: 'compact', theme: 'dark', font_size: 'md' }

export function OwnerPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const searchParams = useSearchParams()

  const shopId = useMemo(() => {
    return (
      searchParams.get('shop_id') ||
      process.env.NEXT_PUBLIC_FALLBACK_SHOP_ID ||
      process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID ||
      ''
    )
  }, [searchParams])

  const expectedPin = process.env.NEXT_PUBLIC_OWNER_PIN

  const [step, setStep] = useState<'pin' | 'settings'>('pin')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  const [settings, setSettings] = useState<OwnerSettings>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Reset when opening
  useEffect(() => {
    if (!open) return
    setStep('pin')
    setPin('')
    setPinError(null)
    setSaveStatus('idle')
  }, [open])

  // Load settings when entering settings step
  useEffect(() => {
    if (!open) return
    if (step !== 'settings') return

    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const url = shopId
          ? `/api/owner/settings?shop_id=${encodeURIComponent(shopId)}`
          : '/api/owner/settings'
        const res = await fetch(url)
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
        if (cancelled) return
        setSettings({
          layout: data.layout ?? DEFAULTS.layout,
          theme: data.theme ?? DEFAULTS.theme,
          font_size: data.font_size ?? DEFAULTS.font_size,
        })
      } catch {
        if (!cancelled) setSettings(DEFAULTS)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, step, shopId])

  if (!open) return null

  const closeAll = () => {
    onClose()
  }

  const submitPin = () => {
    if (!expectedPin) {
      setPinError('Owner PIN is not configured.')
      return
    }
    if (pin !== expectedPin) {
      setPinError('Incorrect PIN.')
      setPin('')
      return
    }
    setPinError(null)
    setStep('settings')
  }

  const save = async () => {
    try {
      setSaveStatus('saving')
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId || null, ...settings }),
      })
      if (!res.ok) throw new Error('save failed')
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1200)
    } catch {
      setSaveStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeAll}
      />

      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-xl border border-white/10 bg-secondary-950 text-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="font-semibold">Owner Settings</div>
            <button
              onClick={closeAll}
              className="text-white/70 hover:text-white text-sm"
            >
              Close
            </button>
          </div>

          <div className="p-5">
            {step === 'pin' && (
              <>
                <div className="text-sm text-white/70 mb-3">
                  Enter owner PIN to continue.
                </div>

                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitPin()
                  }}
                  placeholder="PIN"
                  className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
                />

                {pinError && (
                  <div className="text-red-400 text-sm mt-2">{pinError}</div>
                )}

                <button
                  onClick={submitPin}
                  className="mt-4 w-full rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-semibold py-2"
                >
                  Continue
                </button>

                <div className="text-xs text-white/40 mt-3">
                  shop_id: {shopId || '(none)'}
                </div>
              </>
            )}

            {step === 'settings' && (
              <>
                {loading ? (
                  <div className="text-white/70 text-sm">Loading…</div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Layout</label>
                      <select
                        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                        value={settings.layout}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, layout: e.target.value as any }))
                        }
                      >
                        <option value="compact">compact</option>
                        <option value="large">large</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">Theme</label>
                      <select
                        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                        value={settings.theme}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, theme: e.target.value as any }))
                        }
                      >
                        <option value="dark">dark</option>
                        <option value="light">light</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">Font size</label>
                      <select
                        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                        value={settings.font_size}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, font_size: e.target.value as any }))
                        }
                      >
                        <option value="sm">sm</option>
                        <option value="md">md</option>
                        <option value="lg">lg</option>
                      </select>
                    </div>

                    <button
                      onClick={save}
                      className="w-full rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-semibold py-2"
                    >
                      {saveStatus === 'saving' ? 'Saving…' : 'Save'}
                    </button>

                    {saveStatus === 'saved' && (
                      <div className="text-emerald-400 text-sm">Saved!</div>
                    )}
                    {saveStatus === 'error' && (
                      <div className="text-red-400 text-sm">Save failed.</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}