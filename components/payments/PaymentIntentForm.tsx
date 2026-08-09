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
  invoiceId: string
  onSuccess?: () => void
}

function BetalingsSkjema({ onSuccess }: { onSuccess?: () => void }) {
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
      redirect: 'if_required',
    })

    if (error) {
      setFeil(error.message || 'Betaling feilet. Prøv igjen.')
      setStatus('feil')
      return
    }

    setStatus('idle')
    onSuccess?.()
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

// Bedrift-flyt: Stripe Elements innebygd i appen, for kortbetaling (og
// lagring av betalingsmetode for fremtidig bruk — se setup_future_usage i
// app/api/payments/create-payment-intent/route.ts).
export default function PaymentIntentForm({ invoiceId, onSuccess }: PaymentIntentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const startetRef = useRef(false)

  useEffect(() => {
    // React 18 StrictMode kjører effekter to ganger i dev — uten denne
    // guarden opprettet vi to separate PaymentIntents (og potensielt to
    // Stripe-kunder) per sidevisning.
    if (startetRef.current) return
    startetRef.current = true

    fetch('/api/payments/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Klarte ikke å starte betaling.')
        setClientSecret(data.clientSecret)
      })
      .catch((err) => {
        setFeil(err instanceof Error ? err.message : 'Noe gikk galt.')
      })
  }, [invoiceId])

  if (!stripePromise) {
    return (
      <p className="text-red-600 text-sm">
        Stripe er ikke konfigurert (mangler NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY i .env.local).
      </p>
    )
  }
  if (feil) return <p className="text-red-600 text-sm">{feil}</p>
  if (!clientSecret) return <p className="text-black/50 text-sm">Klargjør betaling...</p>

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <BetalingsSkjema onSuccess={onSuccess} />
    </Elements>
  )
}
