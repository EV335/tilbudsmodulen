'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import type { OffentligFaktura } from '@/lib/payments'
import { FAKTURA_STATUS_LABEL, FAKTURA_STATUS_FARGE, kanBetales } from '@/lib/fakturaStatus'
import { formatKr, formatDato } from '@/lib/format'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import CheckoutButton from '@/components/payments/CheckoutButton'
import PaymentIntentForm from '@/components/payments/PaymentIntentForm'

// Webhooken fra Stripe lander typisk på under et sekund, men vi gir den
// rikelig margin før vi lar kunden se betalingsknappen igjen.
const MAKS_BEKREFTELSESFORSOK = 10
const BEKREFTELSESINTERVALL_MS = 2000

// Offentlig, uinnlogget betalingsside for sluttkunden — nås via en delt
// lenke (e-post eller PDF), autentisert kun av det uggjettbare tokenet i
// URL-en. Ingen håndverker-handlinger her (ingen "send på nytt" e.l.), kun
// visning av faktura + betaling.
export default function OffentligBetalingsSide() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const [faktura, setFaktura] = useState<OffentligFaktura | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [bekreftelseUtlopt, setBekreftelseUtlopt] = useState(false)

  const betalt = searchParams.get('betalt') === '1'
  const avbrutt = searchParams.get('avbrutt') === '1'

  useEffect(() => {
    let aktiv = true
    let forsok = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    async function hent() {
      try {
        const res = await fetch(`/api/public/invoices/${params.token}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Fant ikke faktura')
        const data: OffentligFaktura = await res.json()
        if (!aktiv) return
        setFaktura(data)

        // Kunden er nettopp sendt hit fra Stripe, men det er webhooken som
        // markerer fakturaen betalt — og den bruker gjerne et par sekunder.
        // Uten denne pollingen ville kunden sett "Venter på betaling" rett
        // etter at de faktisk betalte.
        if (betalt && data.status !== 'paid') {
          if (forsok < MAKS_BEKREFTELSESFORSOK) {
            forsok++
            timer = setTimeout(hent, BEKREFTELSESINTERVALL_MS)
          } else {
            // Gir vi aldri opp, står en gammel bokmerket ?betalt=1-lenke uten
            // betalingsmulighet for alltid.
            setBekreftelseUtlopt(true)
          }
        }
      } catch {
        if (aktiv) setFeil('Fant ikke fakturaen. Sjekk at du har hele lenken.')
      }
    }

    hent()
    return () => {
      aktiv = false
      if (timer) clearTimeout(timer)
    }
  }, [params.token, betalt])

  if (feil) {
    return (
      <Section spacing="none" className="py-16 text-center">
        <h1 className="text-2xl font-black mb-4">Fant ikke fakturaen</h1>
        <p className="text-white/70">{feil}</p>
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

  const venterPaBekreftelse = betalt && faktura.status !== 'paid' && !bekreftelseUtlopt
  const kanBetale = kanBetales(faktura.status) && !venterPaBekreftelse

  return (
    <Section size="sm" spacing="roomy">
      <div className="mb-8 text-center">
        {faktura.firmanavn && <p className="text-white/60 mb-2">{faktura.firmanavn}</p>}
        <h1 className="text-3xl md:text-4xl font-black mb-2">Faktura {faktura.invoice_number}</h1>
        {betalt && (
          <p className="text-green-400 font-medium">
            Betaling gjennomført. Statusen kan ta noen sekunder å oppdatere seg.
          </p>
        )}
        {avbrutt && <p className="text-red-400 font-medium">Betaling avbrutt. Ingenting er trukket.</p>}
      </div>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <div className={`text-lg font-black ${FAKTURA_STATUS_FARGE[faktura.status]}`}>
              {FAKTURA_STATUS_LABEL[faktura.status]}
            </div>
            <div className="text-3xl font-black text-blue">{formatKr(faktura.amount)}</div>
          </div>
          <div className="text-black/70 border-t border-black/10 pt-4">
            <div className="text-sm text-black/50">Opprettet {formatDato(faktura.created_at)}</div>
            {faktura.due_date && <div className="text-sm text-black/50">Forfall {formatDato(faktura.due_date)}</div>}
            {faktura.paid_at && <div className="text-sm text-green-700 mt-1">Betalt {formatDato(faktura.paid_at)}</div>}
          </div>
        </Card>

        {faktura.pdf_url && (
          <Card padding="md" className="flex items-center justify-between gap-4">
            <span className="font-medium">Faktura-PDF</span>
            <Button href={faktura.pdf_url} variant="secondary" size="md">
              Last ned PDF
            </Button>
          </Card>
        )}

        {venterPaBekreftelse && (
          <Card padding="md">
            <p className="text-black/70">Bekrefter betalingen hos Stripe...</p>
          </Card>
        )}

        {kanBetale && (
          <Card>
            <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-4">Betaling</div>
            {faktura.kundetype === 'bedrift' ? (
              <PaymentIntentForm token={params.token} />
            ) : (
              <CheckoutButton token={params.token} />
            )}
          </Card>
        )}
      </div>
    </Section>
  )
}
