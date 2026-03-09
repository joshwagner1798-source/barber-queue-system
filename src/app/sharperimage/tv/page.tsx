import { createAdminClient } from '@/lib/supabase/admin'
import { TVDisplayTabs } from '@/app/tv-display/TVDisplayTabs'

export const dynamic = 'force-dynamic'

// Hardcoded — DEFAULT_SHOP_ID env var is unreliable on Vercel (wrong value caused blank TV)
const SHOP_ID = '70467794-c7ce-47f2-8c62-bcb5bb19e31e'

export default async function SharperImageTVPage() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('shop_settings')
    .select('tv_background_url')
    .eq('shop_id', SHOP_ID)
    .maybeSingle()

  const bgUrl =
    (data as { tv_background_url: string | null } | null)?.tv_background_url ??
    undefined

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <TVDisplayTabs shopId={SHOP_ID} backgroundUrl={bgUrl} />
    </main>
  )
}