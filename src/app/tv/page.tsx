import { TVDisplay } from './TVDisplay'

export const metadata = {
  title: 'Live Queue | Sharper Image',
}

export const dynamic = 'force-dynamic'

export default function TVPage() {
  return (
    <main className="min-h-screen bg-secondary-950 text-white overflow-hidden">
      <TVDisplay />
    </main>
  )
}
