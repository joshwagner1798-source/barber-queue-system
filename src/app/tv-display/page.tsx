import { FloorDisplay } from './FloorDisplay'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = {
  title: 'Floor Display | Sharper Image',
}

export const dynamic = 'force-dynamic'

const SHOP_ID = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'

export default async function TVDisplayPage() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('shop_settings')
    .select('tv_background_url')
    .eq('shop_id', SHOP_ID)
    .maybeSingle()

  const bgUrl = (data as { tv_background_url: string | null } | null)?.tv_background_url ?? undefined

  return (
    <main className="h-screen bg-zinc-950 text-white overflow-hidden">
      <FloorDisplay backgroundUrl={bgUrl} />
    </main>
  )
}
