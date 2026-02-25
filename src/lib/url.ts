import type { NextRequest } from 'next/server'

/**
 * Derive the public base URL from incoming request headers.
 * Works correctly behind Vercel's reverse proxy.
 *
 * Priority:
 *   1. x-forwarded-proto + x-forwarded-host  (Vercel / reverse proxy)
 *   2. host header                            (direct / dev)
 *   3. NEXT_PUBLIC_SITE_URL env var           (fallback)
 *   4. http://localhost:3000                  (dev-only last resort)
 */
export function getBaseUrlFromRequest(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (host) return `${proto}://${host}`
  return getPublicBaseUrl()
}

/**
 * Get the public base URL for server-side use outside of a request context
 * (e.g. building webhook URLs, share links at build time, etc.).
 *
 * Returns NEXT_PUBLIC_SITE_URL (stripped of trailing slash) if set,
 * otherwise http://localhost:3000 for local dev.
 *
 * NOTE: In production, NEXT_PUBLIC_SITE_URL must be set to
 * https://<your-vercel-domain> — see docs/DEPLOYMENT.md.
 */
export function getPublicBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env) return env.replace(/\/$/, '')
  return 'http://localhost:3000'
}
