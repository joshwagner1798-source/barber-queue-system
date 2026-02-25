import { TVDisplay } from './TVDisplay'

export const metadata = {
  title: 'Live Queue | Sharper Image',
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ shop_id?: string }>
}

export default async function TVPage({ searchParams }: Props) {
  const params = await searchParams
  const shopId = params.shop_id ?? process.env.DEFAULT_SHOP_ID ?? ''

  return (
    <main className="min-h-screen bg-secondary-950 text-white overflow-hidden">
      <TVDisplay shopId={shopId} />
    </main>
  )
}
