import { ReactNode } from 'react'
import { TVDisplayTabs } from './TVDisplayTabs'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <TVDisplayTabs />
      {children}
    </>
  )
}
