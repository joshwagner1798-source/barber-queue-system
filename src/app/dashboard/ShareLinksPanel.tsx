'use client'

import { useState } from 'react'

interface Props {
  shopId: string
  shopSlug: string | null
}

const BASE = 'https://getshopqueue.vercel.app'

export function ShareLinksPanel({ shopId, shopSlug }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  const tvUrl    = `${BASE}/sharperimage/tv`
  const kioskUrl = `${BASE}/sharperimage/kiosk`

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {}
  }

  return (
    <div className="bg-secondary-800 border border-secondary-700 rounded-lg p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Share Links</h3>
      <p className="text-secondary-400 text-xs">
        Open these on any browser in your shop. They update live.
      </p>

      <div className="space-y-3">
        <LinkRow label="TV Display" url={tvUrl} copyKey="tv" copied={copied} onCopy={copyToClipboard} />
        <LinkRow label="Kiosk" url={kioskUrl} copyKey="kiosk" copied={copied} onCopy={copyToClipboard} />
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