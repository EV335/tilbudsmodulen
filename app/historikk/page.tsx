'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { LagretTilbud } from '@/lib/historikk'
import { formatKr, formatDatoTid } from '@/lib/format'
import { omfangTekst } from '@/lib/priser'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function HistorikkPage() {
  const router = useRouter()
  const { status } = useSession()
  const [liste, setListe] = useState<LagretTilbud[] | null>(null)
  const [feil, setFeil] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated') {
      hentListe()
    }
  }, [status])

  async function hentListe() {
    try {
      const res = await fetch('/api/tilbud')
      if (!res.ok) throw new Error('Henting feilet')
      const data = await res.json()
      setListe(data)
    } catch {
      setFeil('Klarte ikke å hente historikk.')
    }
  }

  function visTilbud(tilbud: LagretTilbud) {
    sessionStorage.setItem(
      'tilbudsmaskinen:resultat',
      JSON.stringify({ id: tilbud.id, input: tilbud.input, resultat: tilbud.resultat })
    )
    router.push('/result')
  }

  async function slett(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Slette dette tilbudet? Dette kan ikke angres.')) return

    setFeil(null)
    try {
      const res = await fetch(`/api/tilbud/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Sletting feilet')
      setListe((prev) => prev?.filter((t) => t.id !== id) ?? null)
    } catch {
      setFeil('Klarte ikke å slette tilbudet. Prøv igjen.')
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
        <p className="text-white/70 mb-8">Historikk krever innlogging.</p>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  return (
    <Section size="lg">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black mb-2">Historikk</h1>
          <p className="text-white/70">Tidligere lagrede tilbud.</p>
        </div>
        <Link href="/historikk/invoices" className="text-white/60 hover:text-white text-sm font-medium self-center">
          Se fakturaer →
        </Link>
      </div>

      {feil && <p className="text-red-400 mb-6">{feil}</p>}

      {liste === null && !feil && <p className="text-white/60">Laster historikk...</p>}

      {liste && liste.length === 0 && (
        <Card padding="md">
          <p className="text-black/60">Ingen lagrede tilbud ennå. Lagre et tilbud fra resultatsiden.</p>
        </Card>
      )}

      <div className="space-y-3">
        {liste?.map((tilbud) => (
          <Card key={tilbud.id} padding="md" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            {/* Var tidligere et klikkbart <div> rundt hele kortet: umulig å nå
                med tastatur, og med en lenke og en knapp nøstet inni. Nå er
                selve tilbudet en knapp som fyller raden — like stort trykkmål,
                men fokuserbart — og handlingene ligger ved siden av. */}
            <button
              type="button"
              onClick={() => visTilbud(tilbud)}
              className="flex-1 min-w-0 text-left hover:opacity-70 transition-opacity"
            >
              <div className="font-bold text-lg break-words">
                {tilbud.input.jobbType}
                {tilbud.input.kundenavn ? ` · ${tilbud.input.kundenavn}` : ''}
              </div>
              <div className="text-sm text-black/50">
                {omfangTekst(tilbud.input.jobbType, tilbud.input.linjer, tilbud.input.romstorrelseM2)} ·{' '}
                {formatDatoTid(tilbud.opprettet)}
              </div>
            </button>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-xl font-black text-blue">{formatKr(tilbud.resultat.pris)}</div>
              <Link
                href={`/historikk/invoices/ny?tilbudId=${tilbud.id}`}
                className="text-sm font-medium text-blue hover:underline"
              >
                Fakturér
              </Link>
              <button onClick={(e) => slett(tilbud.id, e)} className="text-sm font-medium text-red-600 hover:underline">
                Slett
              </button>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}
