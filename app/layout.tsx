import type { Metadata } from 'next'
import AppLayout from '@/components/ui/AppLayout'
import Providers from '@/components/Providers'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'TilbudsMaskinen',
  description: 'Riktig pris og profesjonelle tilbud på sekunder for norske håndverkere.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body>
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  )
}
