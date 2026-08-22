'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { Kunde } from '@/lib/payments'
import type { LagretTilbud } from '@/lib/historikk'
import { formatKr } from '@/lib/format'
import { tilTall } from '@/lib/tall'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import TallInput from '@/components/ui/TallInput'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'

// useSearchParams() krever en Suspense-grense for at Next.js skal kunne
// prerendere ruten (ellers feiler `next build` med
// "useSearchParams() should be wrapped in a suspense boundary").
export default function NyFakturaPage() {
  return (
    <Suspense
      fallback={
        <Section spacing="none" className="py-16 text-center">
          <p className="text-white/50">Laster...</p>
        </Section>
      }
    >
      <NyFakturaInnhold />
    </Suspense>
  )
}

function NyFakturaInnhold() {
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tilbudId = searchParams.get('tilbudId')

  const [kunder, setKunder] = useState<Kunde[] | null>(null)
  const [tilbud, setTilbud] = useState<LagretTilbud | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [manueltBelop, setManueltBelop] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [mvaSats, setMvaSats] = useState(0)
  const [mvaInkludert, setMvaInkludert] = useState(false)
  const [status2, setStatus2] = useState<'idle' | 'oppretter' | 'feil'>('idle')
  const [feilmelding, setFeilmelding] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return

    // Firmaets mva-oppsett styrer om avkrysningen i det hele tatt vises.
    fetch('/api/firma')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setMvaSats(Number(data?.mva_sats ?? 0))
        setMvaInkludert(Boolean(data?.mva_inkludert_standard))
      })
      .catch(() => setMvaSats(0))

    fetch('/api/customers')
      .then((res) => res.json())
      .then((data: Kunde[]) => {
        setKunder(data)
        if (data.length > 0) setCustomerId(data[0].id)
      })
      .catch(() => setKunder([]))

    if (tilbudId) {
      // Hentet tidligere HELE tilbudshistorikken og fant ett element med
      // .find() på klienten — all annen data ble lastet ned til ingen nytte.
      fetch(`/api/tilbud/${tilbudId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: LagretTilbud | null) => setTilbud(data))
        .catch(() => setTilbud(null))
    }
  }, [status, tilbudId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) {
      setFeilmelding('Velg en kunde (eller opprett en først i kunderegisteret).')
      return
    }

    // Beloepet vaktes her og ikke av nettleseren. Feltet hadde min="1", men
    // det var HTML-validering som fulgte type="number" — og den er borte naa
    // som feltet tar imot norsk komma (se lib/tall.ts). Serveren avviser
    // fortsatt tullbeloep, men en 400 er darligere enn a si fra med en gang.
    const belop = tilbudId ? undefined : tilTall(manueltBelop)
    if (belop !== undefined && (belop === null || belop <= 0)) {
      setFeilmelding('Skriv inn et beløp større enn null.')
      return
    }

    setStatus2('oppretter')
    setFeilmelding(null)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          tilbudId: tilbudId || undefined,
          amount: belop ?? undefined,
          dueDate: dueDate || undefined,
          mvaInkludert,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Klarte ikke å opprette faktura.')
      router.push(`/historikk/invoices/${data.id}`)
    } catch (err) {
      setFeilmelding(err instanceof Error ? err.message : 'Noe gikk galt.')
      setStatus2('feil')
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
        <p className="text-white/70 mb-8">Fakturering krever innlogging.</p>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  return (
    <Section size="sm" spacing="roomy">
      <h1 className="text-3xl md:text-4xl font-black mb-2">Ny faktura</h1>
      <p className="text-white/70 mb-8">
        {tilbudId ? 'Oppretter faktura fra et lagret tilbud.' : 'Opprett en fristående faktura.'}
      </p>

      {kunder && kunder.length === 0 && (
        <Card padding="md" className="mb-6">
          <p className="text-black/70 mb-4">Du har ingen kunder registrert ennå.</p>
          <Button href="/kunder" size="md">
            Legg til kunde
          </Button>
        </Card>
      )}

      <Card as="form" onSubmit={handleSubmit} className="space-y-6">
        {tilbud && (
          <div className="bg-black/5 rounded-md p-4">
            <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-1">Fra tilbud</div>
            <div className="font-medium">
              {tilbud.input.jobbType} · {formatKr(tilbud.resultat.pris)}
            </div>
          </div>
        )}

        <Select
          id="kunde"
          label="Kunde"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          options={(kunder ?? []).map((k) => ({ value: k.id, label: `${k.navn} (${k.type === 'bedrift' ? 'Bedrift' : 'Privat'})` }))}
        />

        {!tilbudId && (
          <TallInput
            id="belop"
            label="Beløp (kr)"
            required
            value={manueltBelop}
            onChange={(e) => setManueltBelop(e.target.value)}
            placeholder="f.eks. 5000"
          />
        )}

        <Input
          id="forfallsdato"
          label="Forfallsdato (valgfritt)"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

        {mvaSats > 0 && (
          <Checkbox
            id="mva-inkludert"
            label={`Beløpet over inkluderer ${mvaSats} % mva`}
            checked={mvaInkludert}
            onChange={(e) => setMvaInkludert(e.target.checked)}
            hint={
              mvaInkludert
                ? 'Kunden betaler beløpet som står. Mva bakes ut og spesifiseres på fakturaen.'
                : `Mva legges på toppen — kunden betaler beløpet pluss ${mvaSats} %.`
            }
          />
        )}

        {feilmelding && (
          <div className="text-red-700 bg-red-100 border-2 border-red-300 rounded-md px-4 py-3 font-medium">
            {feilmelding}
          </div>
        )}

        <Button type="submit" fullWidth disabled={status2 === 'oppretter' || !kunder || kunder.length === 0}>
          {status2 === 'oppretter' ? 'Oppretter...' : 'Opprett faktura'}
        </Button>
      </Card>
    </Section>
  )
}
