'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { LagretTilbud } from '@/lib/historikk'
import { avvikProsent, sumEstimerteTimer, type Etterkalkyle } from '@/lib/etterkalkyle'
import { formatKr, formatDatoTid } from '@/lib/format'
import { omfangTekst } from '@/lib/priser'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function HistorikkPage() {
  const router = useRouter()
  const { status } = useSession()
  const [liste, setListe] = useState<LagretTilbud[] | null>(null)
  const [etterkalkyler, setEtterkalkyler] = useState<Record<string, Etterkalkyle>>({})
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
      return
    }

    // Egen henting, og bevisst uten å velte lista hvis den feiler: etterkalkylen
    // er et tillegg. Er migrasjonen ikke kjørt ennå, skal historikken fortsatt
    // vises — bare uten avviksmerkene.
    try {
      const res = await fetch('/api/etterkalkyle')
      if (!res.ok) return
      const rader: Etterkalkyle[] = await res.json()
      setEtterkalkyler(Object.fromEntries(rader.map((r) => [r.tilbudId, r])))
    } catch {
      /* uten merker er lista fortsatt brukbar */
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
      setEtterkalkyler((prev) => {
        const ny = { ...prev }
        delete ny[id]
        return ny
      })
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
              <Avviksmerke tilbud={tilbud} etterkalkyle={etterkalkyler[tilbud.id]} />
            </button>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-xl font-black text-blue">{formatKr(tilbud.resultat.pris)}</div>
              <Link
                href={`/historikk/etterkalkyle/${tilbud.id}`}
                className="text-sm font-medium text-blue hover:underline"
              >
                {etterkalkyler[tilbud.id] ? 'Timer' : 'Før timer'}
              </Link>
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

/**
 * Viser hvordan estimatet slo ut for jobber der timene er ført.
 *
 * Merket står inne i raden og ikke bak et klikk, fordi det er hele poenget med
 * etterkalkylen: at bommen er synlig uten at noen leter etter den.
 */
function Avviksmerke({
  tilbud,
  etterkalkyle,
}: {
  tilbud: LagretTilbud
  etterkalkyle?: Etterkalkyle
}) {
  if (!etterkalkyle) return null

  // Måles mot øyeblikksbildet som ble lagret med timene, ikke mot tilbudet slik
  // det ser ut i dag. Redigeres tilbudet etterpå, ville merket ellers vist et
  // annet avvik enn det satsforslaget faktisk bygger på — to tall om samme jobb,
  // som ikke stemmer overens. Gamle tilbud uten linjer har tomt øyeblikksbilde
  // og faller tilbake på estimatet.
  const estimert = sumEstimerteTimer(etterkalkyle.linjer) || tilbud.resultat.tidsbrukTimer
  const avvik = avvikProsent(etterkalkyle.faktiskeTimer, estimert)
  if (avvik === null) return null

  const farge =
    Math.abs(avvik) < 10
      ? 'bg-green-100 text-green-900'
      : avvik > 0
        ? 'bg-amber-100 text-amber-900'
        : 'bg-blue-100 text-blue-900'

  return (
    <div className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-bold ${farge}`}>
      {etterkalkyle.faktiskeTimer.toLocaleString('nb-NO')} t brukt
      {avvik === 0 ? ' · traff estimatet' : ` · ${avvik > 0 ? '+' : ''}${avvik} % mot estimat`}
    </div>
  )
}
