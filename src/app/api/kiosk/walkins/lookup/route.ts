// Public kiosk phone lookup — no auth required (service-role client).
// Returns active walk-in status for a customer by phone + shop_id.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phone')
    const shopId = searchParams.get('shop_id')

    if (!phone || !shopId) {
      return NextResponse.json(
        { found: false, error: 'phone and shop_id are required' },
        { status: 400 },
      )
    }

    const digits = phone.replace(/\D/g, '')
    const adminClient = createAdminClient()

    // Find client by phone
    const { data: client } = await adminClient
      .from('clients')
      .select('id, display_name')
      .eq('shop_id', shopId)
      .eq('phone', digits)
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ found: false })
    }

    const c = client as unknown as { id: string; display_name: string }

    // Find active walk-in
    const { data: walkin } = await adminClient
      .from('walkins')
      .select('id, status, position, assigned_barber_id, display_name')
      .eq('shop_id', shopId)
      .eq('client_id', c.id)
      .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!walkin) {
      return NextResponse.json({ found: false })
    }

    const w = walkin as unknown as {
      id: string
      status: string
      position: number
      assigned_barber_id: string | null
      display_name: string | null
    }

    let assignedBarberName: string | null = null
    if (w.assigned_barber_id) {
      const { data: barber } = await adminClient
        .from('users')
        .select('first_name, last_name')
        .eq('id', w.assigned_barber_id)
        .maybeSingle()
      if (barber) {
        const b = barber as unknown as { first_name: string; last_name: string }
        assignedBarberName = `${b.first_name} ${b.last_name}`
      }
    }

    return NextResponse.json({
      found: true,
      walkin: {
        id: w.id,
        status: w.status,
        position: w.position,
        displayName: w.display_name ?? c.display_name,
        assignedBarberName,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ found: false, error: message }, { status: 500 })
  }
}
