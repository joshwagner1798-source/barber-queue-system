// POST /api/shop-settings/background
//   FormData: { target: "tv"|"kiosk", file: File }
//   Uploads to ui-backgrounds bucket, upserts shop_settings, returns { publicUrl }
//
// DELETE /api/shop-settings/background?target=tv|kiosk
//   Sets that column to null

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const target = formData.get('target') as string | null
  const file   = formData.get('file')   as File | null

  if (target !== 'tv' && target !== 'kiosk') {
    return NextResponse.json({ error: 'target must be "tv" or "kiosk"' }, { status: 400 })
  }
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mime = file.type || 'image/jpeg'
  const key  = `${target}-${SHOP_ID}.${ext}`

  const admin = createAdminClient()

  const { error: upErr } = await admin.storage
    .from('ui-backgrounds')
    .upload(key, file, { contentType: mime, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('ui-backgrounds').getPublicUrl(key)
  const publicUrl = urlData.publicUrl

  const col = target === 'tv' ? 'tv_background_url' : 'kiosk_background_url'
  const { error: upsErr } = await admin
    .from('shop_settings')
    .upsert({ shop_id: SHOP_ID, [col]: publicUrl, updated_at: new Date().toISOString() } as never, {
      onConflict: 'shop_id',
    })
  if (upsErr) return NextResponse.json({ error: upsErr.message }, { status: 500 })

  return NextResponse.json({ publicUrl })
}

export async function DELETE(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('target')
  if (target !== 'tv' && target !== 'kiosk') {
    return NextResponse.json({ error: 'target must be "tv" or "kiosk"' }, { status: 400 })
  }

  const col = target === 'tv' ? 'tv_background_url' : 'kiosk_background_url'
  const admin = createAdminClient()

  const { error } = await admin
    .from('shop_settings')
    .upsert({ shop_id: SHOP_ID, [col]: null, updated_at: new Date().toISOString() } as never, {
      onConflict: 'shop_id',
    })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
