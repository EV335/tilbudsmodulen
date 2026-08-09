'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface CheckoutButtonProps {
  // Enten invoiceId (innlogget håndverker-visning) eller token
  // (offentlig /betal/[token]-side for sluttkunden) — aldri begge.
  invoiceId?: string
  token?: string
}

// Privat-flyt: redirecter til Stripes hostede Checkout-side. Enklest mulig
// betalingsvei — vi trenger ikke Stripe Elements eller en publishable key
// for denne, siden Stripe selv hoster betalingsskjemaet.
export default function CheckoutButton({ invoiceId, token }: CheckoutButtonProps) {
  const [status, setStatus] = useState<'idle' | 'starter' | 'feil'>('idle')
  const [feil, setFeil] = useState<string | null>(null)

  async function handleClick() {
    setStatus('starter')
    setFeil(null)
    try {
      const url = token ? '/api/public/payments/create-checkout' : '/api/payments/create-checkout'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token } : { invoiceId }),
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
