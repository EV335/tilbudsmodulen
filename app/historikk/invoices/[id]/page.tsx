'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { Faktura } from '@/lib/payments'
import Section from '@/components/ui/Section'
import Button from '@/components/ui/Button'
import InvoiceView from '@/components/invoice/InvoiceView'

export default function FakturaDetaljPage() {
  const { status: sessionStatus } = useSession()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const [faktura, setFaktura] = useState<Faktura | null>(null)
  const [feil, setFeil] = useState<string | null>(null)

  const betalt = searchParams.get('betalt') === '1'
  const avbrutt = searchParams.get('avbrutt') === '1'

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return

    let aktiv = true
    fetch(`/api/invoices/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Fant ikke faktura')
        return res.json()
      })
      .then((data) => {
        if (aktiv) setFaktura(data)
      })
      .catch(() => {
        if (aktiv) setFeil('Fant ikke fakturaen, eller den tilhører ikke deg.')
      })
    return () => {
      aktiv = false
    }
  }, [sessionStatus, params.id])

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
      <InvoiceView faktura={faktura} />
    </Section>
  )
}
