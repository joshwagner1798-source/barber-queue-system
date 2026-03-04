import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ barberId: string }> },
) {
  const { barberId } = await params

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const storagePath = `${barberId}.${ext}`
  const mime = file.type || 'image/jpeg'

  const admin = createAdminClient()

  // Upload to storage
  const { error: upErr } = await admin.storage
    .from('barber-photos')
    .upload(storagePath, file, { contentType: mime, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('barber-photos').getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl

  // Update avatar_url
  const { error: updErr } = await admin
    .from('users')
    .update({ avatar_url: publicUrl })
    .eq('id', barberId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ publicUrl })
}
