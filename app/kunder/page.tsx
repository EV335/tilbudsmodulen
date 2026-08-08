'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import type { Kunde, KundeType } from '@/lib/payments'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'

const TYPE_OPTIONS = [
  { value: 'privat', label: 'Privat' },
  { value: 'bedrift', label: 'Bedrift' },
]

export default function KunderPage() {
  const { status } = useSession()
  const [kunder, setKunder] = useState<Kunde[] | null>(null)
  const [feil, setFeil] = useState<string | null>(null)

  const [type, setType] = useState<KundeType>('privat')
  const [navn, setNavn] = useState('')
  const [epost, setEpost] = useState('')
  const [telefon, setTelefon] = useState('')
  const [adresse, setAdresse] = useState('')
  const [orgnr, setOrgnr] = useState('')
  const [lagrerStatus, setLagrerStatus] = useState<'idle' | 'lagrer' | 'feil'>('idle')

  useEffect(() => {
    if (status !== 'authenticated') return
    hentKunder()
  }, [status])

  async function hentKunder() {
    try {
      const res = await fetch('/api/customers')
      if (!res.ok) throw new Error('Henting feilet')
      setKunder(await res.json())
    } catch {
      setFeil('Klarte ikke å hente kunder.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLagrerStatus('lagrer')
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, navn, epost, telefon, adresse, orgnr }),
      })
      if (!res.ok) throw new Error('Lagring feilet')
      setNavn('')
      setEpost('')
      setTelefon('')
      setAdresse('')
      setOrgnr('')
      setLagrerStatus('idle')
      hentKunder()
    } catch {
      setLagrerStatus('feil')
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
        <p className="text-white/70 mb-8">Kunderegister krever innlogging.</p>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  return (
    <Section size="lg">
      <h1 className="text-3xl md:text-4xl font-black mb-2">Kunderegister</h1>
      <p className="text-white/70 mb-8">Dine kunder — privatpersoner og bedrifter — brukt til fakturering.</p>

      <Card as="form" onSubmit={handleSubmit} className="space-y-6 mb-10">
        <div className="text-sm font-bold text-black/50 uppercase tracking-wide">Ny kunde</div>
        <Select
          id="kundetype"
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as KundeType)}
          options={TYPE_OPTIONS}
        />
        <Input
          id="navn"
          label={type === 'bedrift' ? 'Firmanavn' : 'Navn'}
          required
          value={navn}
          onChange={(e) => setNavn(e.target.value)}
          placeholder={type === 'bedrift' ? 'f.eks. Ola Nordmann AS' : 'f.eks. Ola Nordmann'}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            id="epost"
            label="E-post"
            type="email"
            value={epost}
            onChange={(e) => setEpost(e.target.value)}
            placeholder="Brukes til fakturautsending"
          />
          <Input
            id="telefon"
            label="Telefon (valgfritt)"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
          />
        </div>
        <Input id="adresse" label="Adresse (valgfritt)" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        {type === 'bedrift' && (
          <Input id="orgnr" label="Org.nr" value={orgnr} onChange={(e) => setOrgnr(e.target.value)} placeholder="f.eks. 923 456 789" />
        )}
        <Button type="submit" disabled={lagrerStatus === 'lagrer'}>
          {lagrerStatus === 'lagrer' ? 'Lagrer...' : 'Legg til kunde'}
        </Button>
        {lagrerStatus === 'feil' && <p className="text-red-700 font-medium">Klarte ikke å lagre kunde.</p>}
      </Card>

      {feil && <p className="text-red-400 mb-6">{feil}</p>}
      {kunder === null && !feil && <p className="text-white/60">Laster kunder...</p>}
      {kunder && kunder.length === 0 && (
        <Card padding="md">
          <p className="text-black/60">Ingen kunder registrert ennå.</p>
        </Card>
      )}

      <div className="space-y-3">
        {kunder?.map((kunde) => (
          <Card key={kunde.id} padding="md" className="flex items-center justify-between">
            <div>
              <div className="font-bold">{kunde.navn}</div>
              <div className="text-sm text-black/50">
                {kunde.type === 'bedrift' ? 'Bedrift' : 'Privat'}
                {kunde.epost ? ` · ${kunde.epost}` : ''}
                {kunde.orgnr ? ` · Org.nr ${kunde.orgnr}` : ''}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}
