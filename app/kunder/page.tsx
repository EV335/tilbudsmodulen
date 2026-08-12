'use client'

import { useCallback, useEffect, useState } from 'react'
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

interface KundeSkjema {
  type: KundeType
  navn: string
  epost: string
  telefon: string
  adresse: string
  orgnr: string
}

const TOMT_SKJEMA: KundeSkjema = {
  type: 'privat',
  navn: '',
  epost: '',
  telefon: '',
  adresse: '',
  orgnr: '',
}

function kundeTilSkjema(kunde: Kunde): KundeSkjema {
  return {
    type: kunde.type,
    navn: kunde.navn,
    epost: kunde.epost ?? '',
    telefon: kunde.telefon ?? '',
    adresse: kunde.adresse ?? '',
    orgnr: kunde.orgnr ?? '',
  }
}

// Samme feltoppsett brukes både for "ny kunde" og for redigering av en
// eksisterende — to nesten like skjemaer ville uunngåelig kommet i utakt.
function KundeFelter({
  skjema,
  onChange,
  idPrefiks,
}: {
  skjema: KundeSkjema
  onChange: (endring: Partial<KundeSkjema>) => void
  idPrefiks: string
}) {
  return (
    <>
      <Select
        id={`${idPrefiks}-type`}
        label="Type"
        value={skjema.type}
        onChange={(e) => onChange({ type: e.target.value as KundeType })}
        options={TYPE_OPTIONS}
      />
      <Input
        id={`${idPrefiks}-navn`}
        label={skjema.type === 'bedrift' ? 'Firmanavn' : 'Navn'}
        required
        value={skjema.navn}
        onChange={(e) => onChange({ navn: e.target.value })}
        placeholder={skjema.type === 'bedrift' ? 'f.eks. Ola Nordmann AS' : 'f.eks. Ola Nordmann'}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          id={`${idPrefiks}-epost`}
          label="E-post"
          type="email"
          value={skjema.epost}
          onChange={(e) => onChange({ epost: e.target.value })}
          placeholder="Brukes til fakturautsending"
        />
        <Input
          id={`${idPrefiks}-telefon`}
          label="Telefon (valgfritt)"
          value={skjema.telefon}
          onChange={(e) => onChange({ telefon: e.target.value })}
        />
      </div>
      <Input
        id={`${idPrefiks}-adresse`}
        label="Adresse (valgfritt)"
        value={skjema.adresse}
        onChange={(e) => onChange({ adresse: e.target.value })}
      />
      {skjema.type === 'bedrift' && (
        <Input
          id={`${idPrefiks}-orgnr`}
          label="Org.nr"
          value={skjema.orgnr}
          onChange={(e) => onChange({ orgnr: e.target.value })}
          placeholder="f.eks. 923 456 789"
        />
      )}
    </>
  )
}

export default function KunderPage() {
  const { status } = useSession()
  const [kunder, setKunder] = useState<Kunde[] | null>(null)
  const [feil, setFeil] = useState<string | null>(null)

  const [nyKunde, setNyKunde] = useState<KundeSkjema>(TOMT_SKJEMA)
  const [lagrerStatus, setLagrerStatus] = useState<'idle' | 'lagrer' | 'feil'>('idle')

  const [redigererId, setRedigererId] = useState<string | null>(null)
  const [redigering, setRedigering] = useState<KundeSkjema>(TOMT_SKJEMA)
  const [radStatus, setRadStatus] = useState<'idle' | 'lagrer' | 'sletter'>('idle')
  const [radFeil, setRadFeil] = useState<string | null>(null)

  const hentKunder = useCallback(async () => {
    try {
      const res = await fetch('/api/customers')
      if (!res.ok) throw new Error('Henting feilet')
      setKunder(await res.json())
    } catch {
      setFeil('Klarte ikke å hente kunder.')
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    hentKunder()
  }, [status, hentKunder])

  async function handleOpprett(e: React.FormEvent) {
    e.preventDefault()
    setLagrerStatus('lagrer')
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nyKunde),
      })
      if (!res.ok) throw new Error('Lagring feilet')
      setNyKunde(TOMT_SKJEMA)
      setLagrerStatus('idle')
      hentKunder()
    } catch {
      setLagrerStatus('feil')
    }
  }

  function startRedigering(kunde: Kunde) {
    setRedigererId(kunde.id)
    setRedigering(kundeTilSkjema(kunde))
    setRadFeil(null)
  }

  async function lagreRedigering(e: React.FormEvent) {
    e.preventDefault()
    if (!redigererId) return
    setRadStatus('lagrer')
    setRadFeil(null)
    try {
      const res = await fetch(`/api/customers/${redigererId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(redigering),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Klarte ikke å lagre.')
      setKunder((prev) => prev?.map((k) => (k.id === redigererId ? data : k)) ?? null)
      setRedigererId(null)
    } catch (err) {
      setRadFeil(err instanceof Error ? err.message : 'Noe gikk galt.')
    } finally {
      setRadStatus('idle')
    }
  }

  async function slett(kunde: Kunde) {
    if (!window.confirm(`Slette ${kunde.navn}? Dette kan ikke angres.`)) return
    setRadStatus('sletter')
    setRadFeil(null)
    try {
      const res = await fetch(`/api/customers/${kunde.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Klarte ikke å slette.')
      setKunder((prev) => prev?.filter((k) => k.id !== kunde.id) ?? null)
    } catch (err) {
      setRadFeil(err instanceof Error ? err.message : 'Noe gikk galt.')
    } finally {
      setRadStatus('idle')
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

      <Card as="form" onSubmit={handleOpprett} className="space-y-6 mb-10">
        <div className="text-sm font-bold text-black/50 uppercase tracking-wide">Ny kunde</div>
        <KundeFelter
          idPrefiks="ny"
          skjema={nyKunde}
          onChange={(endring) => setNyKunde((s) => ({ ...s, ...endring }))}
        />
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
        {kunder?.map((kunde) =>
          redigererId === kunde.id ? (
            <Card key={kunde.id} as="form" onSubmit={lagreRedigering} padding="md" className="space-y-6">
              <div className="text-sm font-bold text-black/50 uppercase tracking-wide">Rediger kunde</div>
              <KundeFelter
                idPrefiks={`rediger-${kunde.id}`}
                skjema={redigering}
                onChange={(endring) => setRedigering((s) => ({ ...s, ...endring }))}
              />
              {radFeil && <p className="text-red-700 font-medium">{radFeil}</p>}
              <div className="flex flex-wrap gap-4">
                <Button type="submit" size="md" disabled={radStatus === 'lagrer'}>
                  {radStatus === 'lagrer' ? 'Lagrer...' : 'Lagre'}
                </Button>
                <Button type="button" variant="secondary" size="md" onClick={() => setRedigererId(null)}>
                  Avbryt
                </Button>
              </div>
            </Card>
          ) : (
            <Card
              key={kunde.id}
              padding="md"
              className="flex flex-wrap items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-bold">{kunde.navn}</div>
                <div className="text-sm text-black/50 break-words">
                  {kunde.type === 'bedrift' ? 'Bedrift' : 'Privat'}
                  {kunde.epost ? ` · ${kunde.epost}` : ''}
                  {kunde.orgnr ? ` · Org.nr ${kunde.orgnr}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <button
                  type="button"
                  onClick={() => startRedigering(kunde)}
                  className="text-sm font-medium text-blue hover:underline"
                >
                  Rediger
                </button>
                <button
                  type="button"
                  onClick={() => slett(kunde)}
                  disabled={radStatus === 'sletter'}
                  className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  Slett
                </button>
              </div>
            </Card>
          )
        )}
      </div>

      {radFeil && redigererId === null && <p className="text-red-400 mt-4">{radFeil}</p>}
    </Section>
  )
}
