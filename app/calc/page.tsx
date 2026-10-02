'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { leggTilbudIOkt } from '@/lib/tilbudsokt'
import { useSession } from 'next-auth/react'
import InputForm from '@/components/InputForm'
import { useFirma } from '@/components/FirmaProvider'
import { TilbudInput } from '@/lib/ai'
import type { Prissatser } from '@/lib/priser'
import Section from '@/components/ui/Section'
import Button from '@/components/ui/Button'

export default function CalcPage() {
  const router = useRouter()
  const { status } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [satser, setSatser] = useState<Prissatser>({})
  const firma = useFirma()

  // Brukerens egne satser. Feiler kallet, regner appen videre med standardene —
  // det er bedre enn en kalkulator som ikke starter.
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/priser')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setSatser(data ?? {}))
      .catch(() => setSatser({}))
  }, [status])

  async function handleSubmit(input: TilbudInput) {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Klarte ikke å beregne tilbud.')
      }

      leggTilbudIOkt({ input, resultat: data })
      router.push('/result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt. Prøv igjen.')
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <Section spacing="none" className="py-16 text-center">
        <p className="text-white/50">Laster...</p>
      </Section>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <Section spacing="none" className="py-16 text-center">
        <h1 className="text-2xl font-black mb-4">Du må logge inn</h1>
        <p className="text-white/70 mb-8">Du må være innlogget for å beregne tilbud.</p>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  return (
    <Section>
      <h1 className="text-3xl md:text-4xl font-black mb-2">Beregn tilbud</h1>
      <p className="text-white/70 mb-4">Fyll inn jobben under, så regner vi ut pris, tid og materialer.</p>
      <p className="text-white/50 text-sm mb-8">
        Stemmer ikke tidsbruken med måten du jobber på?{' '}
        <a href="/innstillinger/priser" className="underline hover:text-white">
          Juster dine egne satser
        </a>
        . Slipper du å taste timeprisen hver gang?{' '}
        <a href="/innstillinger/firma" className="underline hover:text-white">
          Sett en standard
        </a>
        .
      </p>
      <InputForm
        onSubmit={handleSubmit}
        loading={loading}
        error={error}
        satser={satser}
        standard={
          firma
            ? {
                timepris: firma.standard_timepris,
                marginProsent: firma.standard_margin_prosent,
                fag: firma.standard_fag,
              }
            : null
        }
      />
    </Section>
  )
}
