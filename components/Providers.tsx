'use client'

import { SessionProvider } from 'next-auth/react'
import FirmaProvider from '@/components/FirmaProvider'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <FirmaProvider>{children}</FirmaProvider>
    </SessionProvider>
  )
}
