'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import Section from '@/components/ui/Section'

interface Firma {
  firmanavn: string
  logo_url?: string | null
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [firma, setFirma] = useState<Firma | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') {
      setFirma(null)
      return
    }
    fetch('/api/firma')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFirma(data))
      .catch(() => setFirma(null))
  }, [status])

  return (
    <div className="min-h-screen flex flex-col bg-dark">
      <header className="border-b border-white/10 bg-darker/90 backdrop-blur">
        <Section size="xl" spacing="none" className="py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-xl font-bold tracking-wide text-white">
            {firma?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firma.logo_url} alt={firma.firmanavn} className="h-8 object-contain" />
            ) : null}
            {firma?.firmanavn ? (
              <span>{firma.firmanavn}</span>
            ) : (
              <span>
                TILBUDS<span className="text-gold">MASKINEN</span>
              </span>
            )}
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-white/70">
            <Link href="/" className="transition-colors hover:text-white">
              Hjem
            </Link>
            {status === 'authenticated' && (
              <>
                <Link href="/calc" className="transition-colors hover:text-white">
                  Nytt tilbud
                </Link>
                <Link href="/historikk" className="transition-colors hover:text-white">
                  Mine tilbud
                </Link>
                <Link href="/innstillinger" className="transition-colors hover:text-white">
                  Mitt firma
                </Link>
                <span className="text-white/40">{session.user?.email}</span>
                <button onClick={() => signOut({ callbackUrl: '/' })} className="transition-colors hover:text-white">
                  Logg ut
                </button>
              </>
            )}
            {status === 'unauthenticated' && (
              <Link href="/logg-inn" className="transition-colors hover:text-white">
                Logg inn
              </Link>
            )}
          </nav>
        </Section>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-white/10 bg-darker/70">
        <Section size="xl" spacing="none" className="py-6 text-sm text-white/40">
          TilbudsMaskinen — riktig pris, hver gang.
        </Section>
      </footer>
    </div>
  )
}
