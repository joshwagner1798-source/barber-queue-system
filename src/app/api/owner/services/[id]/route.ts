import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_FIELDS = new Set(['name', 'duration_minutes', 'price', 'is_active'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing service id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(key)) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if ('name' in patch) {
    if (typeof patch.name !== 'string' || !(patch.name as string).trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    patch.name = (patch.name as string).trim()
  }
  if ('duration_minutes' in patch) {
    const d = patch.duration_minutes
    if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
      return NextResponse.json({ error: 'duration_minutes must be an integer greater than 0' }, { status: 400 })
    }
  }
  if ('price' in patch) {
    const p = patch.price
    if (typeof p !== 'number' || p < 0) {
      return NextResponse.json({ error: 'price must be 0 or greater' }, { status: 400 })
    }
  }
  if ('is_active' in patch) {
    if (typeof patch.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('services')
    .update(patch as never)
    .eq('id', id)
    .select('id, name, duration_minutes, price, is_active, display_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
