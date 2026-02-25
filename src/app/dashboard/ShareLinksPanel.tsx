'use client'

import { useState, useEffect } from 'react'

interface Props {
  shopId: string
  shopSlug: string | null
}

function buildLink(base: string, path: string, shopId: string, shopSlug: string | null): string {
  const identifier = shopSlug ?? shopId
  const isSlug = shopSlug !== null
  // Prefer slug-based path if slug exists; otherwise use ?shop_id= param
  if (isSlug) {
    // Future-proof: /tv/<slug> and /kiosk/<slug> could be implemented later.
    // For now, use query param with slug value as shop_id still uses uuid.
    return `${base}${path}?shop_id=${encodeURIComponent(shopId)}`
  }
  return `${base}${path}?shop_id=${encodeURIComponent(shopId)}`
}

export function ShareLinksPanel({ shopId, shopSlug }: Props) {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const tvUrl     = origin ? buildLink(origin, '/tv-display', shopId, shopSlug) : ''
  const kioskUrl  = origin ? buildLink(origin, '/kiosk',      shopId, shopSlug) : ''

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard API may fail in non-secure contexts; fall back silently
    }
  }

  if (!origin) return null

  return (
    <div className="bg-secondary-800 border border-secondary-700 rounded-lg p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Share Links</h3>
      <p className="text-secondary-400 text-xs">
        Open these on any browser in your shop. They update live.
        {shopSlug && (
          <span className="ml-1 text-secondary-500">(Shop slug: <code className="font-mono">{shopSlug}</code>)</span>
        )}
      </p>

      <div className="space-y-3">
        <LinkRow label="TV Display" url={tvUrl} copyKey="tv" copied={copied} onCopy={copyToClipboard} />
        <LinkRow label="Kiosk"      url={kioskUrl} copyKey="kiosk" copied={copied} onCopy={copyToClipboard} />
      </div>
    </div>
  )
}

function LinkRow({
  label,
  url,
  copyKey,
  copied,
  onCopy,
}: {
  label: string
  url: string
  copyKey: string
  copied: string | null
  onCopy: (text: string, key: string) => void
}) {
  return (
    <div>
      <p className="text-xs text-secondary-400 mb-1 font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-xs font-mono text-primary-400 hover:text-primary-300 bg-secondary-900 rounded px-3 py-2 truncate border border-secondary-700 hover:border-secondary-500 transition-colors"
        >
          {url}
        </a>
        <button
          onClick={() => onCopy(url, copyKey)}
          className="shrink-0 px-3 py-2 text-xs font-medium rounded bg-secondary-700 hover:bg-secondary-600 text-white transition-colors border border-secondary-600"
        >
          {copied === copyKey ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
