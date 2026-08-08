'use client'

import { useEffect } from 'react'
import Section from '@/components/ui/Section'
import Button from '@/components/ui/Button'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Section spacing="none" className="py-16 text-center">
      <h1 className="text-2xl font-black mb-4">Noe gikk galt</h1>
      <p className="text-white/70 mb-8">Det oppstod en uventet feil. Prøv igjen, eller gå tilbake til forsiden.</p>
      <div className="flex items-center justify-center gap-4">
        <Button size="md" onClick={reset}>
          Prøv igjen
        </Button>
        <Button href="/" variant="secondary" size="md">
          Gå til forsiden
        </Button>
      </div>
    </Section>
  )
}
