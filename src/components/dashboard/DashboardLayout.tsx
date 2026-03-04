import type { ReactNode } from 'react'

interface DashboardLayoutProps {
  title: string
  subtitle?: string
  headerRight?: ReactNode
  children: ReactNode
}

export function DashboardLayout({ title, subtitle, headerRight, children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-secondary-950 flex flex-col">
      <header className="bg-secondary-900 border-b border-secondary-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {subtitle && <p className="text-secondary-400 text-sm">{subtitle}</p>}
        </div>
        {headerRight && <div>{headerRight}</div>}
      </header>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  )
}
