import { createAdminClient } from '@/lib/supabase/admin'
import { TVDisplayTabs } from '@/app/tv-display/TVDisplayTabs'

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

  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    'NO_VERCEL_SHA'

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="bg-red-600 text-white font-bold px-4 py-2 text-center">
        DEPLOY CHECK SHA: {sha}
      </div>

      <TVDisplayTabs shopId={shopId} backgroundUrl={bgUrl} />
    </main>
  )
}