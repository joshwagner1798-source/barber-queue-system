import { FloorDisplay } from './FloorDisplay'

export const metadata = {
  title: 'Floor Display | Sharper Image',
}

export const dynamic = 'force-dynamic'

export default function TVDisplayPage() {
  return (
    <main className="min-h-screen bg-secondary-950 text-white overflow-hidden">
      <FloorDisplay />
    </main>
  )
}
