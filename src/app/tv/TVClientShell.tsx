'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { OwnerPanel } from './OwnerPanel'

function NavTab({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-secondary-800 text-white'
          : 'text-secondary-400 hover:text-white hover:bg-secondary-800'
      }`}
    >
      {children}
    </Link>
  )
}

export function TVClientShell({ children }: { children: React.ReactNode }) {
  const [ownerOpen, setOwnerOpen] = useState(false)
  const pathname = usePathname()

  // pathname is always /:shopSlug/tv (or /:shopSlug/kiosk) in this layout.
  // Split on "/" → ["", shopSlug, "tv"] and take index 1.
  const shopSlug = pathname.split('/')[1] ?? ''
  const tvHref = `/${shopSlug}/tv`
  const kioskHref = `/${shopSlug}/kiosk`

  return (
    <>
      {/* Top navigation bar */}
      <nav className="bg-secondary-900 border-b border-secondary-800 flex items-center gap-1 px-4 h-11">
        <NavTab href={tvHref} active={pathname.endsWith('/tv')}>
          TV Display
        </NavTab>
        <NavTab href={kioskHref} active={pathname.endsWith('/kiosk')}>
          Kiosk
        </NavTab>
        <button
          onClick={() => setOwnerOpen(true)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            ownerOpen
              ? 'bg-secondary-800 text-white'
              : 'text-secondary-400 hover:text-white hover:bg-secondary-800'
          }`}
        >
          Owner
        </button>
      </nav>

      {/* Page content */}
      {children}

      {/* Owner overlay — controlled by ownerOpen */}
      <OwnerPanel open={ownerOpen} onClose={() => setOwnerOpen(false)} />
    </>
  )
}
