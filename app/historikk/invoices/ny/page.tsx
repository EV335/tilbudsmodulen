'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { Kunde } from '@/lib/payments'
import type { LagretTilbud } from '@/lib/historikk'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

function formatKr(beløp: number) {
  return `kr ${Math.round(beløp).toLocaleString('nb-NO')},-`
}

export default function NyFakturaPage() {
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tilbudId = searchParams.get('tilbudId')

  const [kunder, setKunder] = useState<Kunde[] | null>(null)
  const [tilbud, setTilbud] = useState<LagretTilbud | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [manueltBelop, setManueltBelop] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status2, setStatus2] = useState<'idle' | 'oppretter' | 'feil'>('idle')
  const [feilmelding, setFeilmelding] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return

    fetch('/api/customers')
      .then((res) => res.json())
      .then((data: Kunde[]) => {
        setKunder(data)
        if (data.length > 0) setCustomerId(data[0].id)
      })
      .catch(() => setKunder([]))

    if (tilbudId) {
      fetch('/api/tilbud')
        .then((res) => res.json())
        .then((data: LagretTilbud[]) => {
          setTilbud(data.find((t) => t.id === tilbudId) ?? null)
        })
        .catch(() => setTilbud(null))
    }
  }, [status, tilbudId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) {
      setFeilmelding('Velg en kunde (eller opprett en først i kunderegisteret).')
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
          amount: tilbudId ? undefined : Number(manueltBelop),
          dueDate: dueDate || undefined,
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
          <Input
            id="belop"
            label="Beløp (kr)"
            type="number"
            min="1"
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
