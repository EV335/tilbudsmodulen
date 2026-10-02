'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Section from '@/components/ui/Section'
import { useFirma, useManglerFirma } from '@/components/FirmaProvider'

const NAV_LENKER = [
  { href: '/oversikt', label: 'Oversikt' },
  { href: '/calc', label: 'Nytt tilbud' },
  { href: '/historikk', label: 'Mine tilbud' },
  { href: '/historikk/invoices', label: 'Fakturaer' },
  { href: '/kunder', label: 'Kunder' },
  { href: '/innstillinger/priser', label: 'Mine satser' },
  { href: '/innstillinger/firma', label: 'Mitt firma' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const firma = useFirma()
  const manglerFirma = useManglerFirma()
  const pathname = usePathname()
  const [menyApen, setMenyApen] = useState(false)

  // Lukk mobilmenyen når man navigerer — ellers blir den stående åpen oppå
  // den nye siden.
  useEffect(() => {
    setMenyApen(false)
  }, [pathname])

  // /betal/[token] er sluttkundens side. De har ingen konto her, så
  // håndverkerens meny ("Nytt tilbud", "Kunder", "Mitt firma") er både
  // ubrukelig og forvirrende for dem — og "Logg inn" inviterer til en blindvei.
  // Kunden skal se én ting: fakturaen sin og hvordan den betales.
  const erKundeside = pathname?.startsWith('/betal')
  if (erKundeside) {
    return <div className="min-h-screen bg-dark">{children}</div>
  }

  const innlogget = status === 'authenticated'

  return (
    <div className="min-h-screen flex flex-col bg-dark">
      <header className="border-b border-white/10 bg-darker/90 backdrop-blur">
        <Section size="xl" spacing="none" className="py-4 flex items-center justify-between gap-4">
          {/* Logoen er appens «hjem»-knapp. For en innlogget bruker er hjem
              oversikten, ikke salgssiden — den sender ham til «Start beregning
              → Logg inn», en runde han allerede har tatt. */}
          <Link
            href={innlogget ? '/oversikt' : '/'}
            className="flex items-center gap-3 text-lg sm:text-xl font-bold tracking-wide text-white min-w-0"
          >
            {firma?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firma.logo_url} alt="" className="h-8 object-contain shrink-0" />
            ) : null}
            <span className="truncate">
              {firma?.firmanavn ?? (
                <>
                  TILBUDS<span className="text-gold">MASKINEN</span>
                </>
              )}
            </span>
          </Link>

          {/* Desktop: full meny. Under md er det ikke plass — headeren trengte
              865 px med alle lenkene og e-postadressen synlig. */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-white/70">
            {/* «Hjem» er salgssiden, og den er bare et sted å gå for den som
                ikke har konto ennå. Innlogget står «Oversikt» først i stedet —
                to lenker som begge het hjem, til to ulike sider, er en meny
                brukeren må gjette i. */}
            {!innlogget && (
              <Link href="/" className="transition-colors hover:text-white">
                Hjem
              </Link>
            )}
            {innlogget && (
              <>
                {NAV_LENKER.map((lenke) => (
                  <Link key={lenke.href} href={lenke.href} className="transition-colors hover:text-white">
                    {lenke.label}
                  </Link>
                ))}
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

          {/* Mobil */}
          {innlogget ? (
            <button
              type="button"
              onClick={() => setMenyApen((a) => !a)}
              aria-expanded={menyApen}
              aria-controls="mobilmeny"
              aria-label={menyApen ? 'Lukk meny' : 'Åpne meny'}
              className="md:hidden shrink-0 p-2 -mr-2 text-white"
            >
              <span aria-hidden className="block w-6 space-y-1.5">
                <span className={`block h-0.5 bg-current transition-transform ${menyApen ? 'translate-y-2 rotate-45' : ''}`} />
                <span className={`block h-0.5 bg-current transition-opacity ${menyApen ? 'opacity-0' : ''}`} />
                <span className={`block h-0.5 bg-current transition-transform ${menyApen ? '-translate-y-2 -rotate-45' : ''}`} />
              </span>
            </button>
          ) : (
            status === 'unauthenticated' && (
              <Link href="/logg-inn" className="md:hidden shrink-0 text-sm font-medium text-white/70">
                Logg inn
              </Link>
            )
          )}
        </Section>

        {menyApen && innlogget && (
          <nav id="mobilmeny" className="md:hidden border-t border-white/10">
            <Section size="xl" spacing="none" className="py-2 flex flex-col">
              {NAV_LENKER.map((lenke) => (
                <Link key={lenke.href} href={lenke.href} className="py-3 text-white/80 border-b border-white/5">
                  {lenke.label}
                </Link>
              ))}
              <div className="pt-3 pb-1 text-sm text-white/40 truncate">{session?.user?.email}</div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="py-3 text-left text-white/80"
              >
                Logg ut
              </button>
            </Section>
          </nav>
        )}
      </header>

      {innlogget && manglerFirma && !pathname?.startsWith('/innstillinger') && (
        <div className="bg-gold/15 border-b border-gold/30">
          <Section size="xl" spacing="none" className="py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/80">
              Fyll inn firmaopplysningene dine — uten dem går fakturaene ut med
              «TilbudsMaskinen» som avsender i stedet for ditt eget firmanavn.
            </p>
            <Link href="/innstillinger/firma" className="text-sm font-bold text-gold hover:underline shrink-0">
              Sett opp firma →
            </Link>
          </Section>
        </div>
      )}

      <main className="flex-1">{children}</main>

      <footer className="border-t border-white/10 bg-darker/70">
        <Section size="xl" spacing="none" className="py-6 text-sm text-white/40">
          TilbudsMaskinen — riktig pris, hver gang.
        </Section>
      </footer>
    </div>
  )
}
