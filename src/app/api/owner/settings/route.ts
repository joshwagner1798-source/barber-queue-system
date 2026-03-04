import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const ALLOWED_LAYOUTS = ['default', 'compact', 'wide']
const ALLOWED_THEMES = ['dark', 'light', 'midnight']
const ALLOWED_FONT_SIZES = ['small', 'medium', 'large']

export async function GET(req: NextRequest) {
  const shop_id = req.nextUrl.searchParams.get('shop_id')
  if (!shop_id) {
    return NextResponse.json({ error: 'shop_id required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('owner_settings')
    .select('layout, theme, font_size')
    .eq('shop_id', shop_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    data ?? { layout: 'default', theme: 'dark', font_size: 'medium' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { shop_id, layout, theme, font_size } = body as {
    shop_id?: string
    layout?: string
    theme?: string
    font_size?: string
  }

  if (!shop_id) {
    return NextResponse.json({ error: 'shop_id required' }, { status: 400 })
  }
  if (layout && !ALLOWED_LAYOUTS.includes(layout)) {
    return NextResponse.json({ error: 'Invalid layout' }, { status: 400 })
  }
  if (theme && !ALLOWED_THEMES.includes(theme)) {
    return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
  }
  if (font_size && !ALLOWED_FONT_SIZES.includes(font_size)) {
    return NextResponse.json({ error: 'Invalid font_size' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('owner_settings')
    .upsert({ shop_id, layout, theme, font_size }, { onConflict: 'shop_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
