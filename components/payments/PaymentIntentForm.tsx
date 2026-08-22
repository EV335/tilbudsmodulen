'use client'

import { useEffect, useRef, useState } from 'react'
import { loadStripe, Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import Button from '@/components/ui/Button'

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
let stripePromise: Promise<Stripe | null> | null = null
if (publishableKey) {
  stripePromise = loadStripe(publishableKey)
}

interface PaymentIntentFormProps {
  // Enten invoiceId (innlogget håndverker-visning) eller token
  // (offentlig /betal/[token]-side for sluttkunden) — aldri begge.
  invoiceId?: string
  token?: string
  onSuccess?: () => void
}

function BetalingsSkjema({ returUrl, onSuccess }: { returUrl: string; onSuccess?: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [status, setStatus] = useState<'idle' | 'betaler' | 'feil'>('idle')
  const [feil, setFeil] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setStatus('betaler')
    setFeil(null)

    const { error } = await stripe.confirmPayment({
      elements,
      // return_url er påkrevd av Stripe.js for enhver betalingsmetode som må
      // innom en ekstern side (3D Secure, Klarna, iDEAL m.fl.). PaymentIntenten
      // opprettes med automatic_payment_methods, så slike metoder KAN dukke opp
      // — uten denne feiler confirmPayment med en generisk melding.
      confirmParams: { return_url: returUrl },
      // Kortbetalinger som går rett gjennom slipper redirect og returnerer her.
      redirect: 'if_required',
    })

    if (error) {
      // Stripes error.message er ofte generisk ("A processing error occurred.").
      // Logg type/code i tillegg, ellers er feilen umulig å diagnostisere.
      console.error('Stripe confirmPayment feilet:', {
        type: error.type,
        code: error.code,
        decline_code: (error as { decline_code?: string }).decline_code,
        message: error.message,
      })
      const detaljer = [error.code, (error as { decline_code?: string }).decline_code]
        .filter(Boolean)
        .join(' / ')
      setFeil(
        (error.message || 'Betaling feilet. Prøv igjen.') + (detaljer ? ` (${detaljer})` : '')
      )
      setStatus('feil')
      return
    }

    // Betalingen gikk gjennom uten redirect. Uten dette sto skjemaet igjen
    // uendret og kunden fikk ingen bekreftelse — og kunne betalt på nytt.
    if (onSuccess) {
      setStatus('idle')
      onSuccess()
      return
    }
    window.location.href = returUrl
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {feil && (
        <div className="text-red-700 bg-red-100 border-2 border-red-300 rounded-md px-4 py-3 font-medium">
          {feil}
        </div>
      )}
      <Button type="submit" fullWidth disabled={!stripe || status === 'betaler'}>
        {status === 'betaler' ? 'Behandler betaling...' : 'Betal'}
      </Button>
    </form>
  )
}

// Bedrift-flyt: Stripe Elements innebygd i appen, for kortbetaling.
// Kortet lagres IKKE for senere bruk — se klargjorPaymentIntent i
// lib/payments.ts.
export default function PaymentIntentForm({ invoiceId, token, onSuccess }: PaymentIntentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [returUrl, setReturUrl] = useState<string | null>(null)
  const startetRef = useRef(false)

  // Absolutt URL — Stripe krever det, og window finnes ikke under SSR.
  useEffect(() => {
    const sti = token ? `/betal/${token}` : `/historikk/invoices/${invoiceId}`
    setReturUrl(`${window.location.origin}${sti}?betalt=1`)
  }, [invoiceId, token])

  useEffect(() => {
    // React 18 StrictMode kjører effekter to ganger i dev — uten denne
    // guarden opprettet vi to separate PaymentIntents (og potensielt to
    // Stripe-kunder) per sidevisning.
    if (startetRef.current) return
    startetRef.current = true

    const url = token ? '/api/public/payments/create-payment-intent' : '/api/payments/create-payment-intent'
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token ? { token } : { invoiceId }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Klarte ikke å starte betaling.')
        setClientSecret(data.clientSecret)
      })
      .catch((err) => {
        setFeil(err instanceof Error ? err.message : 'Noe gikk galt.')
      })
  }, [invoiceId, token])

  if (!stripePromise) {
    return (
      <p className="text-red-600 text-sm">
        Stripe er ikke konfigurert (mangler NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY i .env.local).
      </p>
    )
  }
  if (feil) return <p className="text-red-600 text-sm">{feil}</p>
  if (!clientSecret || !returUrl) return <p className="text-black/50 text-sm">Klargjør betaling...</p>

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <BetalingsSkjema returUrl={returUrl} onSuccess={onSuccess} />
    </Elements>
  )
}
