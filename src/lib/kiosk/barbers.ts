// KioskBarber type shared between the API route and client components.
// Data loading moved to /api/kiosk/barbers (GET) to avoid 'use server'
// module context where process.env resolution is unreliable.

export interface KioskBarber {
  id: string
  firstName: string
  lastName: string
  displayName: string
}

export async function getActiveBarbers(): Promise<KioskBarber[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('public_barbers')
    .select('id, first_name, last_name, display_name')
    .eq('shop_id', SHOP_ID)
    .order('display_order', { ascending: true })

  if (error) throw new Error(`Failed to load barbers: ${error.message}`)

  type Row = { id: string; first_name: string; last_name: string; display_name: string }
  return ((data ?? []) as unknown as Row[]).map((b) => ({
    id: b.id,
    firstName: b.first_name,
    lastName: b.last_name,
    displayName: b.display_name,
  }))
}
