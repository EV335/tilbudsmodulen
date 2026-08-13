'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FAG, FAGNAVN, ENHETSTEKST, gjeldendeSats, beregnLinje, type Prissatser } from '@/lib/priser'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

// Timeprisen brukes bare til å vise hva satsen betyr i kroner per enhet, slik at
// håndverkeren kan sammenligne med markedsbåndet mens han justerer.
const VIS_TIMEPRIS = 750

export default function PriserPage() {
  const { status } = useSession()
  const [satser, setSatser] = useState<Prissatser>({})
  const [lagrer, setLagrer] = useState<string | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [laster, setLaster] = useState(true)

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/priser')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setSatser(data ?? {}))
      .catch(() => setFeil('Klarte ikke å hente satsene dine.'))
      .finally(() => setLaster(false))
  }, [status])

  async function lagre(operasjonId: string, timerPerEnhet: number | null, materialPerEnhet: number | null) {
    setLagrer(operasjonId)
    setFeil(null)
    try {
      const res = await fetch('/api/priser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operasjonId, timerPerEnhet, materialPerEnhet }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Lagring feilet.')
      }
      setSatser((forrige) => {
        const ny = { ...forrige }
        if (timerPerEnhet === null && materialPerEnhet === null) {
          delete ny[operasjonId]
        } else {
          ny[operasjonId] = {
            timerPerEnhet: timerPerEnhet ?? undefined,
            materialPerEnhet: materialPerEnhet ?? undefined,
          }
        }
        return ny
      })
    } catch (err) {
      setFeil(err instanceof Error ? err.message : 'Noe gikk galt.')
    } finally {
      setLagrer(null)
    }
  }

  if (status === 'unauthenticated') {
    return (
      <Section spacing="none" className="py-16 text-center">
        <h1 className="text-2xl font-black mb-4">Du må logge inn</h1>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  return (
    <Section>
      <h1 className="text-3xl md:text-4xl font-black mb-2">Dine satser</h1>
      <p className="text-white/70 mb-2">
        Hvor lang tid <strong>du</strong> bruker per enhet, og hva materialene koster deg. Prisen regnes ut
        fra dette og din egen timepris — så tallene blir dine, ikke et gjennomsnitt fra nettet.
      </p>
      <p className="text-white/50 text-sm mb-8">
        Tomt felt betyr «bruk standarden». Da får du også med deg oppdaterte markedstall senere.
        Kolonnen til høyre viser hva satsen gir per enhet ved {VIS_TIMEPRIS} kr timen, målt mot markedet.
      </p>

      {feil && (
        <div className="mb-6 text-red-700 bg-red-100 border-2 border-red-300 rounded-md px-4 py-3 font-medium">
          {feil}
        </div>
      )}

      {laster ? (
        <p className="text-white/50">Laster satser...</p>
      ) : (
        <div className="space-y-8">
          {FAGNAVN.map((fagNavn) => (
            <div key={fagNavn}>
              <h2 className="text-xl font-black mb-4">{FAG[fagNavn].navn}</h2>
              <div className="space-y-4">
                {FAG[fagNavn].operasjoner.map((op) => (
                  <OperasjonRad
                    key={op.id}
                    fagNavn={fagNavn}
                    op={op}
                    satser={satser}
                    lagrer={lagrer === op.id}
                    onLagre={lagre}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function OperasjonRad({
  fagNavn,
  op,
  satser,
  lagrer,
  onLagre,
}: {
  fagNavn: string
  op: (typeof FAG)[string]['operasjoner'][number]
  satser: Prissatser
  lagrer: boolean
  onLagre: (id: string, timer: number | null, material: number | null) => void
}) {
  const sats = gjeldendeSats(op, satser)
  const [timer, setTimer] = useState(String(sats.timerPerEnhet))
  const [material, setMaterial] = useState(String(sats.materialPerEnhet))

  // Viser hva satsen faktisk gir per enhet, med samme funksjon som kalkulatoren.
  const proeve = beregnLinje(
    fagNavn,
    { operasjonId: op.id, antall: 10, timerPerEnhet: Number(timer), materialPerEnhet: Number(material) },
    VIS_TIMEPRIS,
    FAG[fagNavn].marginProsent
  )

  const endret = timer !== String(sats.timerPerEnhet) || material !== String(sats.materialPerEnhet)

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-bold">
            {op.navn}
            {sats.erEndret && <span className="ml-2 text-sm font-normal text-gold">din sats</span>}
          </div>
          <div className="text-sm text-black/50">
            per {ENHETSTEKST[op.enhet]}
            {op.kilde === 'anslag' && ' · ikke markedsverifisert'}
          </div>
        </div>

        {proeve && (
          <div className="text-right text-sm shrink-0">
            <div className="font-bold">{proeve.prisPerEnhet.toLocaleString('nb-NO')} kr per enhet</div>
            <div className="text-black/50">
              {op.markedLav && op.markedHoy
                ? `marked ${op.markedLav.toLocaleString('nb-NO')}–${op.markedHoy.toLocaleString('nb-NO')}`
                : 'ingen markedsdata'}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <Input
          id={`timer-${op.id}`}
          label="Timer per enhet"
          type="number"
          min="0"
          max="500"
          step="any"
          value={timer}
          onChange={(e) => setTimer(e.target.value)}
        />
        <Input
          id={`material-${op.id}`}
          label="Materialer per enhet (kr)"
          type="number"
          min="0"
          step="any"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
        />
      </div>

      {proeve?.advarsel && (
        <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2">
          {proeve.advarsel}
        </p>
      )}

      <div className="flex items-center gap-4 mt-4">
        <Button
          type="button"
          size="md"
          disabled={!endret || lagrer}
          onClick={() => onLagre(op.id, Number(timer), Number(material))}
        >
          {lagrer ? 'Lagrer...' : 'Lagre'}
        </Button>

        {sats.erEndret && (
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setTimer(String(op.timerPerEnhet))
              setMaterial(String(op.materialPerEnhet))
              onLagre(op.id, null, null)
            }}
          >
            Tilbake til standard ({op.timerPerEnhet} t / {op.materialPerEnhet} kr)
          </Button>
        )}
      </div>
    </Card>
  )
}
