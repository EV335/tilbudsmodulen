'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface CheckoutButtonProps {
  invoiceId: string
}

// Privat-flyt: redirecter til Stripes hostede Checkout-side. Enklest mulig
// betalingsvei — vi trenger ikke Stripe Elements eller en publishable key
// for denne, siden Stripe selv hoster betalingsskjemaet.
export default function CheckoutButton({ invoiceId }: CheckoutButtonProps) {
  const [status, setStatus] = useState<'idle' | 'starter' | 'feil'>('idle')
  const [feil, setFeil] = useState<string | null>(null)

  async function handleClick() {
    setStatus('starter')
    setFeil(null)
    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Klarte ikke å starte betaling.')
      window.location.href = data.url
    } catch (err) {
      setFeil(err instanceof Error ? err.message : 'Noe gikk galt.')
      setStatus('feil')
    }
  }

  return (
    <div>
      <Button onClick={handleClick} disabled={status === 'starter'} fullWidth>
        {status === 'starter' ? 'Starter betaling...' : 'Betal nå'}
      </Button>
      {feil && <p className="text-red-600 text-sm mt-2">{feil}</p>}
    </div>
  )
}
