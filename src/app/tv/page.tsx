import { TVDisplayTabs } from '../tv-display/TVDisplayTabs'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{ shop_id?: string }>
}

export default async function TVPage({ searchParams }: Props) {
  const params = await searchParams
  const shopId = params.shop_id ?? process.env.DEFAULT_SHOP_ID ?? ''
  return <TVDisplayTabs shopId={shopId} />
}