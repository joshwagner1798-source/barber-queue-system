import { KioskForm } from '@/app/kiosk/KioskForm'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = {
  title: 'ShopQueue | Walk-In Sign Up',
}

export const dynamic = 'force-dynamic'

const SHOP_ID = '70467794-c7ce-47f2-8c62-bcb5bb19e31e'

export default async function Page() {
  const shopId = SHOP_ID

  const admin = createAdminClient()
  const { data } = await admin
    .from('shop_settings')
    .select('kiosk_background_url')
    .eq('shop_id', shopId)
    .maybeSingle()

  const bgUrl =
    (data as { kiosk_background_url: string | null } | null)?.kiosk_background_url ??
    '/images/shop-bg.png'

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
