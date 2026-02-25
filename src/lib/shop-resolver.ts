import type { NextRequest } from 'next/server'

/**
 * Resolve the active shop_id from a request.
 *
 * Priority:
 *   1. ?shop_id query param
 *   2. DEFAULT_SHOP_ID environment variable (server-only)
 *
 * Returns null if neither is available — callers should respond 400.
 */
export function resolveShopId(req: NextRequest): string | null {
  const fromParam = req.nextUrl.searchParams.get('shop_id')
  if (fromParam) return fromParam
  return process.env.DEFAULT_SHOP_ID ?? null
}

/**
 * Require a shop_id, returning an error object if it can't be resolved.
 * Convenience wrapper so API routes can do a single check.
 *
 * Usage:
 *   const { shopId, error } = requireShopId(req)
 *   if (error) return NextResponse.json(error, { status: 400 })
 */
export function requireShopId(
  req: NextRequest,
): { shopId: string; error: null } | { shopId: null; error: { error: string } } {
  const shopId = resolveShopId(req)
  if (!shopId) {
    return {
      shopId: null,
      error: {
        error:
          'shop_id query param is required (or set DEFAULT_SHOP_ID on the server).',
      },
    }
  }
  return { shopId, error: null }
}

/**
 * Validate that required server-only environment variables are present.
 * Returns an error object suitable for NextResponse.json if any are missing.
 */
export function checkRequiredEnv(
  vars: string[],
): { missing: string[] } | null {
  const missing = vars.filter((v) => !process.env[v])
  return missing.length > 0 ? { missing } : null
}
