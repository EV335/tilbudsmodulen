'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { Faktura } from '@/lib/payments'
import Section from '@/components/ui/Section'
import Button from '@/components/ui/Button'
import InvoiceView from '@/components/invoice/InvoiceView'

// Webhooken lander typisk på under et sekund; vi gir den rikelig margin før
// betalingsknappen slippes fram igjen.
const MAKS_BEKREFTELSESFORSOK = 10
const BEKREFTELSESINTERVALL_MS = 2000

export default function FakturaDetaljPage() {
  const { status: sessionStatus } = useSession()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const [faktura, setFaktura] = useState<Faktura | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [bekreftelseUtlopt, setBekreftelseUtlopt] = useState(false)

  const betalt = searchParams.get('betalt') === '1'
  const avbrutt = searchParams.get('avbrutt') === '1'

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return

    let aktiv = true
    let forsok = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    async function hent() {
      try {
        const res = await fetch(`/api/invoices/${params.id}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Fant ikke faktura')
        const data: Faktura = await res.json()
        if (!aktiv) return
        setFaktura(data)

        // Betalingen er nettopp gjennomført, men det er Stripe-webhooken som
        // markerer fakturaen betalt. Poller til den har landet, ellers ville
        // siden vist "Venter på betaling" med betalingsknappen intakt rett
        // etter at kunden betalte.
        if (betalt && data.status !== 'paid') {
          if (forsok < MAKS_BEKREFTELSESFORSOK) {
            forsok++
            timer = setTimeout(hent, BEKREFTELSESINTERVALL_MS)
          } else {
            setBekreftelseUtlopt(true)
          }
        }
      } catch {
        if (aktiv) setFeil('Fant ikke fakturaen, eller den tilhører ikke deg.')
      }
    }

    hent()
    return () => {
      aktiv = false
      if (timer) clearTimeout(timer)
    }
  }, [sessionStatus, params.id, betalt])

  if (sessionStatus === 'loading') {
    return (
      <Section spacing="none" className="py-16 text-center">
        <p className="text-white/50">Laster...</p>
      </Section>
    )
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <Section spacing="none" className="py-16 text-center">
        <h1 className="text-2xl font-black mb-4">Du må logge inn</h1>
        <p className="text-white/70 mb-8">Fakturaer krever innlogging.</p>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  if (feil) {
    return (
      <Section spacing="none" className="py-16 text-center">
        <h1 className="text-2xl font-black mb-4">Fant ikke fakturaen</h1>
        <p className="text-white/70 mb-8">{feil}</p>
        <Button href="/historikk/invoices" size="md">
          Til fakturaoversikten
        </Button>
      </Section>
    )
  }

  if (!faktura) {
    return (
      <Section spacing="none" className="py-16 text-center">
        <p className="text-white/50">Laster faktura...</p>
      </Section>
    )
  }

  return (
    <Section>
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-black mb-2">Faktura {faktura.invoice_number}</h1>
        {betalt && (
          <p className="text-green-400 font-medium">
            Betaling gjennomført. Statusen kan ta noen sekunder å oppdatere seg via Stripe-webhooken.
          </p>
        )}
        {avbrutt && <p className="text-red-400 font-medium">Betaling avbrutt. Ingenting er trukket.</p>}
      </div>
      <InvoiceView
        faktura={faktura}
        ventPaBekreftelse={betalt && faktura.status !== 'paid' && !bekreftelseUtlopt}
      />
    </Section>
  )
}
