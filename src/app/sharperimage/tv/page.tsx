import { TVDisplayTabs } from '@/app/tv-display/TVDisplayTabs'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{ shop_id?: string }>
}

export default async function SharperImageTVPage({ searchParams }: Props) {
  const params = await searchParams
  const shopId = params.shop_id ?? process.env.DEFAULT_SHOP_ID ?? ''

  const admin = createAdminClient()
  const { data } = await admin
    .from('shop_settings')
    .select('tv_background_url')
    .eq('shop_id', shopId)
    .maybeSingle()

  const bgUrl =
    (data as { tv_background_url: string | null } | null)?.tv_background_url ??
    undefined

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <TVDisplayTabs shopId={shopId} backgroundUrl={bgUrl} />
    </main>
  )
}