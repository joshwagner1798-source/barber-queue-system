import { TVDisplayTabs } from '@/app/tv-display/TVDisplayTabs'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const shopId = process.env.DEFAULT_SHOP_ID ?? '70467794-c7ce-47f2-8c62-bcb5bb19e31e'

  const admin = createAdminClient()
  const { data } = await admin
    .from('shop_settings')
    .select('tv_background_url')
    .eq('shop_id', shopId)
    .maybeSingle()

  const bgUrl =
    (data as { tv_background_url: string | null } | null)?.tv_background_url ?? undefined

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <TVDisplayTabs shopId={shopId} backgroundUrl={bgUrl} />
    </main>
  )
}