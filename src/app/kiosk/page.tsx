import { KioskForm } from './KioskForm'

export const metadata = {
  title: 'Walk-In Sign Up | Sharper Image',
}

export const dynamic = 'force-dynamic'

export default function KioskPage() {
  return (
    <main className="min-h-screen bg-secondary-950 flex items-center justify-center p-4">
      <KioskForm />
    </main>
  )
}
