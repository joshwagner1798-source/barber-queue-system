// Public kiosk walk-in submission — no auth required.
// Uses service-role (createAdminClient) to bypass RLS, as designed in
// supabase/migrations/00005_walkin_kiosk_layer.sql line 140.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNextQueuePosition } from '@/lib/walkin/helpers'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { firstName, lastInitial, phone, shopId, preferenceType, preferredBarberId } = body as {
      firstName?: string
      lastInitial?: string
      phone?: string
      shopId?: string
      preferenceType?: string
      preferredBarberId?: string | null
    }

    if (!firstName || !lastInitial || !phone || !shopId) {
      return NextResponse.json(
        { success: false, error: 'First name, last initial, phone, and shopId are required' },
        { status: 400 },
      )
    }

    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      return NextResponse.json(
        { success: false, error: 'Phone number must be 10 digits' },
        { status: 400 },
      )
    }

    const adminClient = createAdminClient()
    const displayName = `${firstName.trim()} ${lastInitial.trim().toUpperCase()}.`

    // Upsert client record — dedup by (shop_id, phone)
    const { data: client, error: clientErr } = await adminClient
      .from('clients')
      .upsert(
        {
          shop_id: shopId,
          first_name: firstName.trim(),
          last_initial: lastInitial.trim().toUpperCase(),
          phone: digits,
          display_name: displayName,
        } as never,
        { onConflict: 'shop_id,phone' },
      )
      .select('id, display_name')
      .single()

    // Resolve client record — upsert may fail if policy disallows UPDATE;
    // fall back to a plain SELECT in that case.
    let clientRecord: { id: string; display_name: string } | null =
      client as unknown as { id: string; display_name: string } | null

    if (clientErr || !clientRecord) {
      const { data: existing, error: selErr } = await adminClient
        .from('clients')
        .select('id, display_name')
        .eq('shop_id', shopId)
        .eq('phone', digits)
        .maybeSingle()

      if (selErr || !existing) {
        return NextResponse.json(
          { success: false, error: clientErr?.message ?? 'Could not create customer record' },
          { status: 500 },
        )
      }
      clientRecord = existing as unknown as { id: string; display_name: string }
    }

    // Check for an existing active walk-in for this client
    const { data: activeWalkin } = await adminClient
      .from('walkins')
      .select('id, status, position, assigned_barber_id, display_name')
      .eq('shop_id', shopId)
      .eq('client_id', clientRecord.id)
      .in('status', ['WAITING', 'CALLED', 'IN_SERVICE'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (activeWalkin) {
      const aw = activeWalkin as unknown as {
        id: string
        status: string
        position: number
        assigned_barber_id: string | null
        display_name: string | null
      }

      let assignedBarberName: string | null = null
      if (aw.assigned_barber_id) {
        const { data: barber } = await adminClient
          .from('users')
          .select('first_name, last_name')
          .eq('id', aw.assigned_barber_id)
          .maybeSingle()
        if (barber) {
          const b = barber as unknown as { first_name: string; last_name: string }
          assignedBarberName = `${b.first_name} ${b.last_name}`
        }
      }

      return NextResponse.json({
        success: true,
        walkinId: aw.id,
        displayName: aw.display_name ?? clientRecord.display_name,
        existingStatus: aw.status,
        existingPosition: aw.position,
        assignedBarberName,
      })
    }

    // No active walk-in — create a new one
    const position = await getNextQueuePosition(adminClient, shopId)

    const { data: walkin, error: walkinErr } = await adminClient
      .from('walkins')
      .insert({
        shop_id: shopId,
        client_id: clientRecord.id,
        display_name: displayName,
        service_type: 'cut',
        preference_type: preferenceType ?? 'ANY',
        preferred_barber_id: preferredBarberId ?? null,
        position,
      } as never)
      .select('id, position, display_name')
      .single()

    if (walkinErr || !walkin) {
      return NextResponse.json(
        { success: false, error: walkinErr?.message ?? 'Failed to add to queue' },
        { status: 500 },
      )
    }

    const w = walkin as unknown as { id: string; position: number; display_name: string }

    return NextResponse.json(
      { success: true, walkinId: w.id, displayName: w.display_name ?? displayName, position: w.position },
      { status: 201 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
