'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ResultCard from '@/components/ResultCard'
import { TilbudInput, TilbudResult } from '@/lib/ai'
import Section from '@/components/ui/Section'
import Button from '@/components/ui/Button'

interface Lagret {
  id?: string
  input: TilbudInput
  resultat: TilbudResult
}

export default function ResultPage() {
  const [data, setData] = useState<Lagret | null>(null)
  const [klar, setKlar] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('tilbudsmaskinen:resultat')
    if (raw) {
      try {
        setData(JSON.parse(raw))
      } catch {
        // Ødelagt/utdatert innhold i sessionStorage skal ikke gi hvit skjerm.
        sessionStorage.removeItem('tilbudsmaskinen:resultat')
      }
    }
    setKlar(true)
  }, [])

  if (!klar) {
    return null
  }

  if (!data) {
    return (
      <Section spacing="none" className="py-16 text-center">
        <h1 className="text-2xl font-black mb-4">Ingen beregning funnet</h1>
        <p className="text-white/70 mb-8">Du må gjøre en beregning før du kan se resultatet.</p>
        <Button href="/calc" size="md">
          Gå til kalkulator
        </Button>
      </Section>
    )
  }

  return (
    <Section>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl md:text-4xl font-black">Ditt tilbud</h1>
        <Link href="/calc" className="text-white/60 hover:text-white text-sm font-medium">
          Ny beregning
        </Link>
      </div>
      <ResultCard resultat={data.resultat} input={data.input} tilbudId={data.id} />
    </Section>
  )
}
