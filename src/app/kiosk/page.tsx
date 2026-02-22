import { KioskForm } from './KioskForm'

export const metadata = {
  title: 'Walk-In Sign Up | Sharper Image',
}

export const dynamic = 'force-dynamic'

export default function KioskPage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        backgroundImage: "url('/images/shop-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0c0a09',
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] pointer-events-none" />
      <div className="relative z-10 w-full">
        <KioskForm />
      </div>
    </main>
  )
}
