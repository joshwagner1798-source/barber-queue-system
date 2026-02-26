// Public kiosk check-in — no auth required (service-role client).
// Only allows CHECK_IN action (CALLED → IN_SERVICE transition).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body as { action?: string }

    if (action !== 'CHECK_IN') {
      return NextResponse.json({ success: false, error: 'action must be CHECK_IN' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: walkin, error: fetchErr } = await adminClient
      .from('walkins')
      .select('id, status')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr || !walkin) {
      return NextResponse.json({ success: false, error: 'Walk-in not found' }, { status: 404 })
    }

    const w = walkin as unknown as { id: string; status: string }

    if (w.status !== 'CALLED') {
      return NextResponse.json(
        { success: false, error: `Cannot check in — current status is ${w.status}` },
        { status: 400 },
      )
    }

    const { error: updateErr } = await adminClient
      .from('walkins')
      .update({ status: 'IN_SERVICE' } as never)
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
