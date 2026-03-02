import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'
import type { OwnerSettings } from '@/types/database'

const DEFAULTS: Omit<OwnerSettings, 'shop_id' | 'updated_at'> = {
  layout: 'compact',
  theme: 'dark',
  font_size: 'md',
}

const ALLOWED_LAYOUTS = new Set(['compact', 'large'])
const ALLOWED_THEMES  = new Set(['dark', 'light'])
const ALLOWED_FONTS   = new Set(['sm', 'md', 'lg'])

export async function GET(req: NextRequest) {
  const { shopId, error } = requireShopId(req)
  if (error) return NextResponse.json(error, { status: 400 })

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('owner_settings')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  if (data) return NextResponse.json(data as unknown as OwnerSettings)

  // Row doesn't exist yet — upsert defaults and return them
  const row = { shop_id: shopId, ...DEFAULTS, updated_at: new Date().toISOString() }
  const { data: upserted, error: upsertError } = await admin
    .from('owner_settings')
    .upsert(row, { onConflict: 'shop_id' })
    .select('*')
    .single()

  if (upsertError) {
    // Return defaults even if upsert fails (table may not exist yet)
    return NextResponse.json({ shop_id: shopId, ...DEFAULTS, updated_at: row.updated_at })
  }

  return NextResponse.json(upserted as unknown as OwnerSettings)
}

export async function PATCH(req: NextRequest) {
  const { shopId, error } = requireShopId(req)
  if (error) return NextResponse.json(error, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { shop_id: shopId, updated_at: new Date().toISOString() }

  if ('layout' in body) {
    if (!ALLOWED_LAYOUTS.has(body.layout as string))
      return NextResponse.json({ error: 'Invalid layout value' }, { status: 400 })
    patch.layout = body.layout
  }
  if ('theme' in body) {
    if (!ALLOWED_THEMES.has(body.theme as string))
      return NextResponse.json({ error: 'Invalid theme value' }, { status: 400 })
    patch.theme = body.theme
  }
  if ('font_size' in body) {
    if (!ALLOWED_FONTS.has(body.font_size as string))
      return NextResponse.json({ error: 'Invalid font_size value' }, { status: 400 })
    patch.font_size = body.font_size
  }

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('owner_settings')
    .upsert(patch, { onConflict: 'shop_id' })
    .select('*')
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data as unknown as OwnerSettings)
}
