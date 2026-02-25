import { TVDisplayTabs } from './TVDisplayTabs'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Floor Display | Sharper Image',
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ shop_id?: string; noRedirect?: string }>
}

export default async function TVDisplayPage({ searchParams }: Props) {
  const params = await searchParams

  // ✅ If someone hits the old TV link with shop_id, send them to the new clean URL.
  // ✅ But allow bypass for admin/owner settings by adding ?noRedirect=1
  if (params.shop_id && params.noRedirect !== '1') {
    redirect('/sharperimage/queue/tv')
  }

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
