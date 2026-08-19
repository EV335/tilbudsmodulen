'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FAG, FAGNAVN, ENHETSTEKST, gjeldendeSats, beregnLinje, type Prissatser } from '@/lib/priser'
import {
  harForslag,
  harMaterialforslag,
  samleErfaring,
  MIN_JOBBER_FOR_FORSLAG,
  type Erfaring,
  type Etterkalkyle,
} from '@/lib/etterkalkyle'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { formatKr } from '@/lib/format'

// Timeprisen brukes bare til å vise hva satsen betyr i kroner per enhet, slik at
// håndverkeren kan sammenligne med markedsbåndet mens han justerer.
const VIS_TIMEPRIS = 750

export default function PriserPage() {
  const { status } = useSession()
  const [satser, setSatser] = useState<Prissatser>({})
  const [etterkalkyler, setEtterkalkyler] = useState<Etterkalkyle[]>([])
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

    // Egen henting: feiler den, skal satsene fortsatt kunne redigeres. Uten
    // registrerte timer er dette bare en tom liste, og siden ser ut som før.
    fetch('/api/etterkalkyle')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setEtterkalkyler(data ?? []))
      .catch(() => setEtterkalkyler([]))
  }, [status])

  // Regnes av de samme funksjonene som serveren og testene bruker.
  const erfaringer = samleErfaring(etterkalkyler, satser)
  const erfaringPerOperasjon = new Map(erfaringer.map((e) => [e.operasjonId, e]))
  const antallForslag = erfaringer.filter((e) => harForslag(e) || harMaterialforslag(e)).length

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

      {antallForslag > 0 && (
        <div className="mb-8 rounded-md border-2 border-gold bg-gold/10 px-4 py-3">
          <p className="font-bold text-white">
            {antallForslag === 1
              ? 'Én sats ser ut til å bomme mot timene du har ført.'
              : `${antallForslag} satser ser ut til å bomme mot timene du har ført.`}
          </p>
          <p className="text-white/70 text-sm mt-1">
            Forslagene står ved operasjonene under. De bygger på jobbene dine, ikke på markedstall.
          </p>
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
                    erfaring={erfaringPerOperasjon.get(op.id)}
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
  erfaring,
  lagrer,
  onLagre,
}: {
  fagNavn: string
  op: (typeof FAG)[string]['operasjoner'][number]
  satser: Prissatser
  erfaring?: Erfaring
  lagrer: boolean
  onLagre: (id: string, timer: number | null, material: number | null) => void
}) {
  const sats = gjeldendeSats(op, satser)
  const [timer, setTimer] = useState(String(sats.timerPerEnhet))
  const [material, setMaterial] = useState(String(sats.materialPerEnhet))

  // Et tomt felt betyr «bruk standarden», ikke null timer. Uten dette ga
  // Number('') = 0: tømte du feltet og lagret, fikk operasjonen satsen 0 —
  // altså null arbeid i alle framtidige tilbud, uten at noe så galt ut.
  const tallEllerNull = (s: string): number | null => (s.trim() === '' ? null : Number(s))

  // Viser hva satsen faktisk gir per enhet, med samme funksjon som kalkulatoren.
  // Samme tolkning som ved lagring, slik at forhåndsvisningen viser det som
  // faktisk blir lagret.
  const proeve = beregnLinje(
    fagNavn,
    {
      operasjonId: op.id,
      antall: 10,
      timerPerEnhet: tallEllerNull(timer) ?? op.timerPerEnhet,
      materialPerEnhet: tallEllerNull(material) ?? op.materialPerEnhet,
    },
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

      {erfaring && (
        <Erfaringsboks
          erfaring={erfaring}
          onBruk={(nyTimersats) => {
            // Feltet må settes i tillegg til lagringen: verdien i inputen er
            // lokal state satt ved montering, og ville ellers stått igjen med
            // den gamle satsen mens databasen hadde den nye.
            setTimer(String(nyTimersats))
            onLagre(op.id, nyTimersats, tallEllerNull(material))
          }}
          onBrukMaterial={(nyMaterialsats) => {
            setMaterial(String(nyMaterialsats))
            onLagre(op.id, tallEllerNull(timer), nyMaterialsats)
          }}
        />
      )}

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
          onClick={() => onLagre(op.id, tallEllerNull(timer), tallEllerNull(material))}
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

/**
 * Det etterkalkylen har lært om denne operasjonen.
 *
 * Vises også når avviket er for lite til å foreslå noe. Å se «ført på 4 jobber,
 * treffer innenfor 10 %» er den eneste bekreftelsen håndverkeren får på at
 * satsen faktisk stemmer — og uten den ville siden bare snakket når noe var galt.
 */
function Erfaringsboks({
  erfaring,
  onBruk,
  onBrukMaterial,
}: {
  erfaring: Erfaring
  onBruk: (timer: number) => void
  onBrukMaterial: (kr: number) => void
}) {
  const forslag = harForslag(erfaring)
  const materialforslag = harMaterialforslag(erfaring)
  const jobbtekst = `${erfaring.jobber} ${erfaring.jobber === 1 ? 'jobb' : 'jobber'}`
  const rentekst =
    erfaring.reneJobber < erfaring.jobber
      ? `${erfaring.reneJobber} av dem hadde bare denne operasjonen`
      : 'alle med bare denne operasjonen'

  return (
    <div
      className={`mt-4 rounded-md border-2 px-4 py-3 ${
        forslag || materialforslag ? 'border-gold bg-gold/10' : 'border-black/10 bg-black/[0.03]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-bold">
            Timene dine sier {erfaring.observertTimerPerEnhet.toLocaleString('nb-NO')} t per enhet
          </span>
          <span className="text-black/60">
            {' '}
            — {erfaring.avvikProsent > 0 ? '+' : ''}
            {erfaring.avvikProsent} % mot satsen din på{' '}
            {erfaring.gjeldendeTimerPerEnhet.toLocaleString('nb-NO')}
          </span>
          <div className="text-black/50 mt-0.5">
            {jobbtekst} · {rentekst} · {erfaring.sumAntall.toLocaleString('nb-NO')} enheter til sammen
          </div>
        </div>

        {forslag && (
          <Button
            type="button"
            size="md"
            variant="gold"
            onClick={() => onBruk(erfaring.observertTimerPerEnhet)}
          >
            Bruk {erfaring.observertTimerPerEnhet.toLocaleString('nb-NO')}
          </Button>
        )}
      </div>

      {erfaring.material && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-black/10">
          <div className="text-sm">
            <span className="font-bold">
              Materialene kostet {erfaring.material.observertPerEnhet.toLocaleString('nb-NO')} kr per enhet
            </span>
            <span className="text-black/60">
              {' '}
              — {erfaring.material.avvikProsent > 0 ? '+' : ''}
              {erfaring.material.avvikProsent} % mot {erfaring.material.gjeldendePerEnhet.toLocaleString('nb-NO')}
            </span>
            <div className="text-black/50 mt-0.5">
              {erfaring.material.jobber} {erfaring.material.jobber === 1 ? 'jobb' : 'jobber'} med ført
              materialkostnad · {formatKr(erfaring.material.sumFaktiskKr)} til sammen
            </div>
          </div>

          {materialforslag && (
            <Button
              type="button"
              size="md"
              variant="gold"
              onClick={() => onBrukMaterial(erfaring.material!.observertPerEnhet)}
            >
              Bruk {erfaring.material.observertPerEnhet.toLocaleString('nb-NO')} kr
            </Button>
          )}
        </div>
      )}

      {!forslag && !materialforslag && erfaring.jobber < MIN_JOBBER_FOR_FORSLAG && (
        <p className="text-xs text-black/50 mt-2">
          Ingen justering foreslås før {MIN_JOBBER_FOR_FORSLAG} jobber er ført — under det er det
          like gjerne en tilfeldig treg dag som et mønster.
        </p>
      )}
    </div>
  )
}
