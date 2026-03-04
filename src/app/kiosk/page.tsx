import { KioskForm } from './KioskForm'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = {
  title: 'ShopQueue | Walk-In Sign Up',
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ shop_id?: string }>
}

export default async function KioskPage({ searchParams }: Props) {
  const params = await searchParams
  const shopId = params.shop_id ?? process.env.DEFAULT_SHOP_ID ?? ''

  const admin = createAdminClient()
  const { data } = await admin
    .from('shop_settings')
    .select('kiosk_background_url')
    .eq('shop_id', shopId)
    .maybeSingle()

  const bgUrl = (data as { kiosk_background_url: string | null } | null)?.kiosk_background_url
    ?? '/images/shop-bg.png'

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        backgroundImage: `url('${bgUrl}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0c0a09',
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] pointer-events-none" />
      <div className="relative z-10 w-full">
        <KioskForm shopId={shopId} />
      </div>
    </main>
  )
}
