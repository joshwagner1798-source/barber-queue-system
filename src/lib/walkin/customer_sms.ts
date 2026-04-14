// ---------------------------------------------------------------------------
// Customer queue notification
//
// Sends "You're up next at <shop>" SMS when a walk-in transitions WAITING → CALLED.
// Fire-and-forget safe — swallows all errors so it never blocks an assignment.
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms, toE164 } from '@/lib/sms/twilio'

/**
 * Sends an SMS to the walk-in customer telling them they've been called.
 * Resolves silently on any error (missing phone, Twilio failure, etc).
 */
export async function notifyCustomerCalled(
  walkinId: string,
  shopId: string,
): Promise<void> {
  try {
    const admin = createAdminClient()

    // 1. Fetch walkin to get client_id
    const { data: walkinData } = await admin
      .from('walkins')
      .select('client_id')
      .eq('id', walkinId)
      .maybeSingle()

    type WalkinRow = { client_id: string | null }
    const walkin = walkinData as unknown as WalkinRow | null
    if (!walkin?.client_id) return

    // 2. Fetch client phone
    const { data: clientData } = await admin
      .from('clients')
      .select('phone')
      .eq('id', walkin.client_id)
      .maybeSingle()

    type ClientRow = { phone: string }
    const client = clientData as unknown as ClientRow | null
    if (!client?.phone) return

    // 3. Fetch shop name
    const { data: shopData } = await admin
      .from('shops')
      .select('name')
      .eq('id', shopId)
      .maybeSingle()

    type ShopRow = { name: string }
    const shop = shopData as unknown as ShopRow | null
    const shopName = shop?.name ?? 'the shop'

    // 4. Send SMS — phone stored as 10-digit; toE164 converts to +1XXXXXXXXXX
    const to = toE164(client.phone)
    const body = `You're up next at ${shopName}. Head back now.`
    await sendSms(to, body)
  } catch {
    // Best-effort — never surface errors to caller
  }
}
