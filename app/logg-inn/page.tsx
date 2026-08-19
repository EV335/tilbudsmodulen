'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

type Status = 'idle' | 'sender' | 'sendt' | 'feil' | 'avvist' | 'utlopt'

// «Prøv igjen» er feil råd å gi den som ikke står på tilgangslista — den kan
// prøve så mye den vil. Derfor egne meldinger for de to feilene som faktisk
// treffer folk: ikke invitert, og lenke som er brukt opp.
const FEILMELDINGER: Partial<Record<Status, string>> = {
  feil: 'Klarte ikke å sende innloggingslenke. Prøv igjen.',
  avvist:
    'Denne e-postadressen har ikke tilgang. TilbudsMaskinen er foreløpig bare åpen for inviterte.',
  utlopt: 'Innloggingslenken er utløpt eller allerede brukt. Be om en ny under.',
}

function statusFraFeilkode(kode: string | null | undefined): Status {
  if (!kode) return 'idle'
  if (kode === 'AccessDenied') return 'avvist'
  if (kode === 'Verification') return 'utlopt'
  return 'feil'
}

export default function LoggInnPage() {
  const [epost, setEpost] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  // En magic link som blir avvist eller er utløpt sender brukeren hit med
  // ?error=. Leses fra window og ikke med useSearchParams, som ville tvunget
  // hele siden inn i en Suspense-grense for å bygge.
  useEffect(() => {
    setStatus(statusFraFeilkode(new URLSearchParams(window.location.search).get('error')))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sender')
    try {
      const res = await signIn('email', { email: epost, redirect: false, callbackUrl: '/calc' })
      setStatus(res?.error ? statusFraFeilkode(res.error) : 'sendt')
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

          {FEILMELDINGER[status] && (
            <div className="text-red-700 bg-red-100 border-2 border-red-300 rounded-md px-4 py-3 font-medium">
              {FEILMELDINGER[status]}
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
