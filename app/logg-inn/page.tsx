'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function LoggInnPage() {
  const [epost, setEpost] = useState('')
  const [status, setStatus] = useState<'idle' | 'sender' | 'sendt' | 'feil'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sender')
    try {
      const res = await signIn('email', { email: epost, redirect: false, callbackUrl: '/calc' })
      setStatus(res?.error ? 'feil' : 'sendt')
    } catch {
      setStatus('feil')
    }
  }

  return (
    <Section size="sm" spacing="roomy">
      <h1 className="text-3xl md:text-4xl font-black mb-2">Logg inn</h1>
      <p className="text-white/70 mb-8">
        Skriv inn e-posten din, så sender vi deg en innloggingslenke.
      </p>

      {status === 'sendt' ? (
        <Card>
          <p className="font-bold text-lg mb-2">Magic-link sendt! Sjekk e-posten.</p>
          <p className="text-black/70">
            Vi har sendt en innloggingslenke til <span className="font-medium">{epost}</span>.
          </p>
        </Card>
      ) : (
        <Card as="form" onSubmit={handleSubmit} className="space-y-6">
          <Input
            id="epost"
            label="E-post"
            type="email"
            required
            value={epost}
            onChange={(e) => setEpost(e.target.value)}
            placeholder="deg@firma.no"
          />

          {status === 'feil' && (
            <div className="text-red-700 bg-red-100 border-2 border-red-300 rounded-md px-4 py-3 font-medium">
              Klarte ikke å sende innloggingslenke. Prøv igjen.
            </div>
          )}

          <Button type="submit" fullWidth disabled={status === 'sender'}>
            {status === 'sender' ? 'Sender...' : 'Send innloggingslenke'}
          </Button>
        </Card>
      )}
    </Section>
  )
}
