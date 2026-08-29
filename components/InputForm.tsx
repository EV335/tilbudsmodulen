'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { TilbudInput } from '@/lib/ai'
import {
  FAG,
  FAGNAVN,
  hentFag,
  hentOperasjon,
  beregnTilbud,
  marginSomPaaslag,
  gjeldendeSats,
  grupperteOperasjoner,
  jobbmalerFor,
  finnJobbmal,
  enhetEntallFor,
  enhetFlertallFor,
  type Prissatser,
} from '@/lib/priser'
import {
  maalOpp,
  komplette,
  mengdeFor,
  kommerFraRom,
  fagBrukerRom,
  utregning,
  sjekkSamsvar,
  flatenTil,
  udekkedeFlater,
  standardFlateFor,
  FLATE_VALG,
  type Flate,
  type Rom,
} from '@/lib/mengde'
import { tilTall, tilFeltTekst } from '@/lib/tall'
import { formatTall } from '@/lib/format'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import TallInput from '@/components/ui/TallInput'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'

const JOBBTYPE_OPTIONS = FAGNAVN.map((navn) => ({ value: navn, label: FAG[navn].navn }))

interface RomSkjema {
  id: number
  navn: string
  lengde: string
  bredde: string
  hoyde: string
  dorer: string
  vinduer: string
}

interface LinjeSkjema {
  /** Stabil nøkkel for React. Uten den arver en linje inputfeltene til den som
   *  ble slettet over den — indeks som key gjenbruker DOM-noden. */
  id: number
  operasjonId: string
  /** Kun i bruk når linja er manuell. Kommer tallet fra rommet, står det her tomt. */
  antall: string
  materialPerEnhet: string
  /** Hentes mengden fra rommålene, eller skriver håndverkeren den selv? */
  fraRom: boolean
  /** Kun for `m2_flate`, som er tvetydig: flis kan ligge på både gulv og vegg. */
  flate: Flate
}

let teller = 0

/** Standardverdier fra firmaet, slik at timeprisen ikke skrives inn på nytt hver gang. */
export interface Standardverdier {
  timepris?: number | null
  marginProsent?: number | null
  fag?: string | null
}

interface InputFormProps {
  onSubmit: (input: TilbudInput) => void
  loading: boolean
  error?: string | null
  /** Brukerens egne satser. Tom for den som ikke har endret noe. */
  satser?: Prissatser
  /** Firmaets standardverdier. Undefined mens de hentes. */
  standard?: Standardverdier | null
}

function nyttRom(navn = ''): RomSkjema {
  return { id: ++teller, navn, lengde: '', bredde: '', hoyde: '', dorer: '', vinduer: '' }
}

function nyLinje(
  jobbType: string,
  satser?: Prissatser,
  operasjonId?: string,
  antall?: number
): LinjeSkjema {
  const fag = hentFag(jobbType)
  const op = operasjonId ? hentOperasjon(jobbType, operasjonId) : fag.operasjoner[0]
  const valgt = op ?? fag.operasjoner[0]
  const sats = gjeldendeSats(valgt, satser)
  return {
    id: ++teller,
    operasjonId: valgt.id,
    antall: antall !== undefined ? tilFeltTekst(antall) : '',
    materialPerEnhet: tilFeltTekst(sats.materialPerEnhet),
    // En jobbmal med fast antall (ett bad, ett sikringsskap) skal ikke få
    // mengden sin overstyrt av et rom.
    fraRom: antall === undefined && kommerFraRom(valgt.enhet),
    flate: standardFlateFor(valgt.id),
  }
}

export default function InputForm({ onSubmit, loading, error, satser, standard }: InputFormProps) {
  const [jobbType, setJobbType] = useState('Maler')
  const [timepris, setTimepris] = useState('')
  const [margin, setMargin] = useState(tilFeltTekst(FAG.Maler.marginProsent))
  const [rom, setRom] = useState<RomSkjema[]>([nyttRom()])
  const [linjer, setLinjer] = useState<LinjeSkjema[]>([nyLinje('Maler', satser)])
  const [beskrivelse, setBeskrivelse] = useState('')
  const [kundenavn, setKundenavn] = useState('')

  // Standardverdiene kommer fra et nettverkskall og lander etter første render.
  // De skal fylle et tomt skjema, aldri overskrive noe brukeren har begynt på —
  // og bare én gang, ellers ville et nytt svar fra serveren dratt feltene
  // tilbake mens han skriver.
  const standardBrukt = useRef(false)
  useEffect(() => {
    if (!standard || standardBrukt.current) return
    standardBrukt.current = true

    const uroert = timepris === '' && rom.every((r) => r.lengde === '' && r.bredde === '')
    if (!uroert) return

    const nyttFag = standard.fag && FAG[standard.fag] ? standard.fag : jobbType
    if (nyttFag !== jobbType) {
      setJobbType(nyttFag)
      setLinjer([nyLinje(nyttFag, satser)])
    }
    if (standard.timepris && standard.timepris > 0) setTimepris(tilFeltTekst(standard.timepris))
    setMargin(
      tilFeltTekst(
        standard.marginProsent !== null && standard.marginProsent !== undefined
          ? standard.marginProsent
          : hentFag(nyttFag).marginProsent
      )
    )
    // rom/timepris leses kun for å avgjøre om skjemaet er urørt; de skal ikke
    // fyre effekten på nytt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standard])

  const fag = hentFag(jobbType)
  const visRom = fagBrukerRom(fag.operasjoner.map((o) => o.enhet))
  const operasjonsGrupper = grupperteOperasjoner(jobbType).map((gruppe) => ({
    label: gruppe.navn,
    options: gruppe.operasjoner.map((o) => ({
      value: o.id,
      label: `${o.navn} (per ${enhetEntallFor(o)})`,
    })),
  }))
  const jobbmaler = jobbmalerFor(jobbType)

  // Feltekstene tolkes ETT sted. Rommene brukes bade til utregningen og til det
  // som lagres med tilbudet, og to tolkninger av de samme feltene er nettopp
  // den typen par som kommer i utakt.
  const romVerdier = useMemo(
    () =>
      rom.map(
        (r): Rom => ({
          navn: r.navn,
          lengde: tilTall(r.lengde) ?? undefined,
          bredde: tilTall(r.bredde) ?? undefined,
          hoyde: tilTall(r.hoyde) ?? undefined,
          dorer: tilTall(r.dorer) ?? undefined,
          vinduer: tilTall(r.vinduer) ?? undefined,
        })
      ),
    [rom]
  )

  const maal = useMemo(() => maalOpp(romVerdier), [romVerdier])

  /**
   * Mengden linja skal regnes med.
   *
   * ÉN vei til tallet, brukt av både forhåndsvisningen og innsendingen. Da kan
   * ikke det håndverkeren ser på skjermen være et annet tall enn det som blir
   * sendt inn — som er nettopp den typen par som kommer i utakt.
   */
  function mengden(linje: LinjeSkjema): number {
    const op = hentOperasjon(jobbType, linje.operasjonId)
    if (linje.fraRom && op && maal) {
      return mengdeFor(op.enhet, maal, linje.flate) ?? 0
    }
    return tilTall(linje.antall) ?? 0
  }

  // Satsen sendes med hver linje som et øyeblikksbilde, slik at tilbudet kan
  // etterregnes senere selv om brukeren endrer satsene sine i mellomtiden.
  function satsFor(operasjonId: string): number | undefined {
    const op = hentOperasjon(jobbType, operasjonId)
    return op ? gjeldendeSats(op, satser).timerPerEnhet : undefined
  }

  function gyldigeLinjer() {
    return linjer
      .map((l) => ({
        operasjonId: l.operasjonId,
        antall: mengden(l),
        timerPerEnhet: satsFor(l.operasjonId),
        materialPerEnhet: tilTall(l.materialPerEnhet) ?? undefined,
      }))
      .filter((l) => l.antall > 0)
  }

  function harArbeid(): boolean {
    return linjer.some((l) => mengden(l) > 0)
  }

  function byttFag(nyttFag: string) {
    // Operasjonene tilhører hvert sitt fag, så linjene kan ikke følge med over —
    // de må nullstilles. Men et feilklikk i nedtrekkslista slettet tidligere en
    // ferdig utfylt jobb uten et eneste ord. Vi spør bare når det faktisk står
    // arbeid der; er alt tomt, er det ingenting å advare om.
    //
    // Rommålene beholdes: et rom er 4,2 × 3,1 m enten det skal males eller
    // flislegges, og å slette dem ville tvunget fram en ny runde med tommestokk
    // for noe appen allerede vet.
    if (
      harArbeid() &&
      !window.confirm(
        `Bytter du til ${hentFag(nyttFag).navn}, må du velge arbeidet på nytt. ` +
          'Rommålene beholdes. Fortsette?'
      )
    ) {
      return
    }
    setJobbType(nyttFag)
    setMargin(tilFeltTekst(hentFag(nyttFag).marginProsent))
    setLinjer([nyLinje(nyttFag, satser)])
  }

  /**
   * Legger inn en ferdig jobbmal.
   *
   * Erstatter linjene i stedet for å legge til: en mal er «slik ser denne
   * jobben ut», ikke «i tillegg til det som står der». Å legge til ville gitt
   * dobbel veggflate den dagen noen trykker to ganger.
   */
  function brukJobbmal(malId: string) {
    const mal = finnJobbmal(jobbType, malId)
    if (!mal) return
    if (harArbeid() && !window.confirm(`«${mal.navn}» erstatter linjene du har nå. Fortsette?`)) {
      return
    }
    setLinjer(mal.linjer.map((l) => nyLinje(jobbType, satser, l.operasjonId, l.antall)))
  }

  function endreRom(index: number, endring: Partial<RomSkjema>) {
    setRom((forrige) => forrige.map((r, i) => (i === index ? { ...r, ...endring } : r)))
  }

  function endreLinje(index: number, endring: Partial<LinjeSkjema>) {
    setLinjer((forrige) =>
      forrige.map((l, i) => {
        if (i !== index) return l
        const oppdatert = { ...l, ...endring }
        if (endring.operasjonId && endring.operasjonId !== l.operasjonId) {
          const nyOp = hentOperasjon(jobbType, endring.operasjonId)
          // Bytter du operasjon, skal materialsatsen følge den nye — ellers står
          // 450 kr/m² flis igjen på en malerlinje.
          oppdatert.materialPerEnhet = nyOp ? tilFeltTekst(gjeldendeSats(nyOp, satser).materialPerEnhet) : '0'
          // Den nye enheten avgjør om rommet i det hele tatt kan fylle linja. Et
          // sikringsskap telles; det finnes ikke i kvadratmeter.
          oppdatert.fraRom = nyOp ? kommerFraRom(nyOp.enhet) && l.fraRom : false
          oppdatert.flate = standardFlateFor(endring.operasjonId)
        }
        return oppdatert
      })
    )
  }

  // Samme funksjon som serveren bruker, så forhåndsvisningen kan ikke bomme.
  const forhandsvisning = useMemo(() => {
    const tp = tilTall(timepris) ?? 0
    if (!tp || tp <= 0) return null
    const m = tilTall(margin) ?? -1
    if (!Number.isFinite(m) || m < 0 || m >= 100) return null
    const gyldige = gyldigeLinjer()
    if (gyldige.length === 0) return null
    return beregnTilbud(jobbType, gyldige, tp, m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobbType, linjer, timepris, margin, maal, satser])

  /**
   * Går gulv og tak opp mot hverandre?
   *
   * Bare for tall håndverkeren har skrevet selv. Kommer begge fra rommålene, ER
   * de like — da finnes det ingenting å advare om, og et varsel ville vært støy.
   */
  const samsvarsvarsel = useMemo(() => {
    const manuell = (enhet: 'm2_gulv' | 'm2_tak') => {
      const treff = linjer.find((l) => {
        const op = hentOperasjon(jobbType, l.operasjonId)
        return op?.enhet === enhet && !l.fraRom
      })
      return treff ? mengden(treff) : null
    }
    return sjekkSamsvar(manuell('m2_gulv'), manuell('m2_tak'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linjer, jobbType, maal])

  /**
   * Flater han har målt, men ikke lagt en linje på.
   *
   * Han måler rommet, appen regner ut fire tall — og så kan tre av dem bli
   * stående ubrukt uten at noen sier fra. Det er ikke nødvendigvis feil, men
   * det er verdt ett spørsmål: den glemte flaten oppdages ellers først på
   * befaring, og da er prisen allerede gitt.
   */
  const udekket = useMemo(() => {
    if (!maal || !visRom) return []
    const dekket = linjer
      .map((l) => {
        const op = hentOperasjon(jobbType, l.operasjonId)
        return op ? flatenTil(op.enhet, l.flate) : null
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
    return udekkedeFlater(dekket, maal, fag.operasjoner)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linjer, jobbType, maal, visRom])

  /**
   * Én boks per ULIK advarsel, ikke én per linje.
   *
   * Anslag-advarselen har samme ordlyd for alle operasjoner uten markedstall. En
   * malerjobb med sparkling, listverk, dør og vindu ga fire identiske amber
   * bokser under hverandre — og fire like varsler leses som støy, også den
   * gangen ett av dem er det som faktisk betyr noe.
   */
  const samledeAdvarsler = useMemo(() => {
    const perTekst = new Map<string, string[]>()
    for (const linje of forhandsvisning?.linjer ?? []) {
      if (!linje.advarsel) continue
      const navn = perTekst.get(linje.advarsel) ?? []
      if (!navn.includes(linje.navn)) navn.push(linje.navn)
      perTekst.set(linje.advarsel, navn)
    }
    return [...perTekst.entries()].map(([tekst, navn]) => ({ tekst, navn }))
  }, [forhandsvisning])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      jobbType,
      timepris: tilTall(timepris) ?? 0,
      marginProsent: tilTall(margin) ?? -1,
      linjer: gyldigeLinjer(),
      // Maalene er selve grunnlaget for prisen. Uten dem kan ingen etterpaa se
      // hvilke rom som var med i tilbudet — og uenighet om DET er den dyreste
      // uenigheten man kan ha med en kunde.
      rom: visRom ? komplette(romVerdier) : undefined,
      beskrivelse,
      kundenavn,
    })
  }

  return (
    <Card as="form" onSubmit={handleSubmit} className="space-y-6">
      <Select id="jobbType" label="Fag" value={jobbType} onChange={(e) => byttFag(e.target.value)} options={JOBBTYPE_OPTIONS} />

      {jobbmaler.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-2">Vanlige jobber</div>
          <div className="flex flex-wrap gap-2">
            {jobbmaler.map((mal) => (
              <button
                key={mal.id}
                type="button"
                onClick={() => brukJobbmal(mal.id)}
                title={mal.beskrivelse}
                className="rounded-md border-2 border-blue/30 bg-blue/5 px-3 py-2 text-sm font-bold text-blue hover:bg-blue/10 transition-colors"
              >
                {mal.navn}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TallInput
          id="timepris"
          label="Din timepris (kr, eks. mva)"
          required
          value={timepris}
          onChange={(e) => setTimepris(e.target.value)}
          placeholder="f.eks. 750"
        />

        <div>
          <TallInput
            id="margin"
            label="Margin (% av salgspris)"
            required
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
          />
          {(tilTall(margin) ?? -1) > 0 && (tilTall(margin) ?? -1) < 100 && (
            <p className="mt-2 text-sm text-slate-600">
              Tilsvarer <strong>{formatTall(marginSomPaaslag(tilTall(margin) ?? -1))} % påslag</strong> på kostnaden.
            </p>
          )}
        </div>
      </div>

      {visRom && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Målene på jobben</h3>
              <p className="text-sm text-slate-600">
                Mål rommet én gang. Gulv, tak, vegg og listverk regnes ut herfra — da kan de ikke
                sprike.
              </p>
            </div>
            <Button type="button" variant="link" onClick={() => setRom((f) => [...f, nyttRom()])}>
              + Legg til rom
            </Button>
          </div>

          {rom.map((r, i) => (
            <div key={r.id} className="rounded-md border-2 border-slate-200 p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Input
                  id={`romnavn-${i}`}
                  label="Rom (valgfritt)"
                  type="text"
                  value={r.navn}
                  onChange={(e) => endreRom(i, { navn: e.target.value })}
                  placeholder="f.eks. Stue"
                />
                <TallInput
                  id={`lengde-${i}`}
                  label="Lengde (m)"
                  value={r.lengde}
                  onChange={(e) => endreRom(i, { lengde: e.target.value })}
                  placeholder="4,2"
                />
                <TallInput
                  id={`bredde-${i}`}
                  label="Bredde (m)"
                  value={r.bredde}
                  onChange={(e) => endreRom(i, { bredde: e.target.value })}
                  placeholder="3,1"
                />
                <TallInput
                  id={`hoyde-${i}`}
                  label="Takhøyde (m)"
                  value={r.hoyde}
                  onChange={(e) => endreRom(i, { hoyde: e.target.value })}
                  placeholder="2,4"
                />
                <TallInput
                  id={`dorer-${i}`}
                  label="Antall dører"
                  value={r.dorer}
                  onChange={(e) => endreRom(i, { dorer: e.target.value })}
                  placeholder="1"
                />
                <TallInput
                  id={`vinduer-${i}`}
                  label="Antall vinduer"
                  value={r.vinduer}
                  onChange={(e) => endreRom(i, { vinduer: e.target.value })}
                  placeholder="2"
                />
              </div>

              {rom.length > 1 && (
                <Button type="button" variant="link" onClick={() => setRom((f) => f.filter((_, j) => j !== i))}>
                  Fjern rom
                </Button>
              )}
            </div>
          ))}

          {maal && (
            <div className="rounded-md border-2 border-blue/20 bg-blue/5 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Flatetall etikett="Gulv" verdi={`${formatTall(maal.gulvM2)} m²`} />
                <Flatetall etikett="Tak" verdi={`${formatTall(maal.takM2)} m²`} />
                <Flatetall etikett="Vegg" verdi={`${formatTall(maal.veggM2)} m²`} />
                <Flatetall etikett="Listverk" verdi={`${formatTall(maal.listverkLm)} lm`} />
              </div>
              <div className="mt-3 space-y-1">
                {utregning(romVerdier, maal).map((linje) => (
                  <p
                    key={linje}
                    className={linje.startsWith('⚠') ? 'text-sm font-bold text-amber-800' : 'text-sm text-black/60'}
                  >
                    {linje}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Hva skal gjøres?</h3>
          <Button type="button" variant="link" onClick={() => setLinjer((f) => [...f, nyLinje(jobbType, satser)])}>
            + Legg til arbeid
          </Button>
        </div>

        {linjer.map((linje, i) => {
          const op = hentOperasjon(jobbType, linje.operasjonId)
          const kanFraRom = op ? kommerFraRom(op.enhet) : false
          const fraRom = linje.fraRom && kanFraRom && maal !== null
          const romMengde = fraRom && op && maal ? mengdeFor(op.enhet, maal, linje.flate) : null

          return (
            <div key={linje.id} className="rounded-md border-2 border-slate-200 p-4 space-y-4">
              <Select
                id={`operasjon-${i}`}
                label="Arbeid"
                value={linje.operasjonId}
                onChange={(e) => endreLinje(i, { operasjonId: e.target.value })}
                grupper={operasjonsGrupper}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  {fraRom ? (
                    <div>
                      <div className="text-sm font-bold mb-2">
                        Antall ({op ? enhetFlertallFor(op) : ''})
                      </div>
                      <div className="rounded-md border-2 border-blue/20 bg-blue/5 px-4 py-3">
                        <span className="text-lg font-black">
                          {formatTall(romMengde ?? 0)}
                        </span>{' '}
                        <span className="text-sm text-black/60">fra målene over</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => endreLinje(i, { fraRom: false, antall: tilFeltTekst(romMengde ?? 0) })}
                        className="mt-2 text-sm font-medium text-blue hover:underline"
                      >
                        Skriv inn selv i stedet
                      </button>
                    </div>
                  ) : (
                    <div>
                      <TallInput
                        id={`antall-${i}`}
                        label={`Antall (${op ? enhetFlertallFor(op) : ''})`}
                        value={linje.antall}
                        onChange={(e) => endreLinje(i, { antall: e.target.value })}
                        placeholder="f.eks. 45"
                      />
                      {kanFraRom && maal && (
                        <button
                          type="button"
                          onClick={() => endreLinje(i, { fraRom: true })}
                          className="mt-2 text-sm font-medium text-blue hover:underline"
                        >
                          Bruk målene over
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <TallInput
                  id={`material-${i}`}
                  label="Materialer (kr per enhet)"
                  value={linje.materialPerEnhet}
                  onChange={(e) => endreLinje(i, { materialPerEnhet: e.target.value })}
                />
              </div>

              {/* Kun `m2_flate` er tvetydig — flis ligger både på gulv og vegg. */}
              {fraRom && op?.enhet === 'm2_flate' && (
                <Select
                  id={`flate-${i}`}
                  label="Hvilken flate?"
                  value={linje.flate}
                  onChange={(e) => endreLinje(i, { flate: e.target.value as Flate })}
                  options={FLATE_VALG}
                />
              )}

              {op?.hjelpetekst && <p className="text-sm text-slate-600">{op.hjelpetekst}</p>}

              {linjer.length > 1 && (
                <Button type="button" variant="link" onClick={() => setLinjer((f) => f.filter((_, j) => j !== i))}>
                  Fjern arbeid
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {udekket.length > 0 && (
        <div className="rounded-md border-2 border-blue/20 bg-blue/5 p-4">
          <p className="font-bold mb-1">Du har målt opp mer enn du har priset</p>
          <p className="text-sm text-black/60 mb-3">
            Skal noe av dette med i tilbudet? Er det ikke avtalt, hopper du bare over.
          </p>
          <div className="flex flex-wrap gap-2">
            {udekket.map((f) => (
              <button
                key={f.flate}
                type="button"
                onClick={() => setLinjer((forrige) => [...forrige, nyLinje(jobbType, satser, f.operasjonId)])}
                className="rounded-md border-2 border-blue/30 bg-white px-3 py-2 text-sm font-bold text-blue hover:bg-blue/10 transition-colors text-left"
              >
                + {f.operasjonNavn}
                <span className="block font-medium text-black/50">
                  {formatTall(f.mengde)} {f.enhetstekst} {f.navn}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {samsvarsvarsel && (
        <p className="text-sm text-amber-800 bg-amber-50 border-2 border-amber-300 rounded-md px-4 py-3 font-medium">
          {samsvarsvarsel}
        </p>
      )}

      {forhandsvisning && (
        <div className="rounded-md border-2 border-slate-300 bg-slate-50 p-4 space-y-2">
          <h3 className="font-semibold text-slate-900">Regnestykket</h3>
          {forhandsvisning.linjer.map((l, i) => (
            <p key={`${l.operasjonId}-${i}`} className="text-sm text-slate-700">
              {l.navn}: {formatTall(l.antall)} {l.enhetstekst} × {formatTall(l.timerPerEnhet)} t = {formatTall(l.timer)} t × {formatTall(tilTall(timepris) ?? 0)} kr
              {' + '}
              {formatTall(l.materialKr)} kr materialer → <strong>{formatTall(l.prisKr)} kr</strong>
              {' '}({formatTall(l.prisPerEnhet)} kr per {l.enhetstekstEntall})
            </p>
          ))}
          <p className="text-sm text-slate-700 pt-2 border-t border-slate-300">
            Arbeid {formatTall(forhandsvisning.arbeidKr)} kr + materialer{' '}
            {formatTall(forhandsvisning.materialKr)} kr + margin{' '}
            {formatTall(forhandsvisning.marginKr)} kr
          </p>
          <p className="text-lg font-bold text-slate-900">
            Sum: kr {formatTall(forhandsvisning.prisKr)},- for {formatTall(forhandsvisning.timer)} timer
          </p>
          {samledeAdvarsler.map((advarsel) => (
            <p
              key={advarsel.tekst}
              className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2"
            >
              {advarsel.navn.join(', ')}: {advarsel.tekst}
            </p>
          ))}
        </div>
      )}

      <Input
        id="kundenavn"
        label="Kundenavn (valgfritt)"
        type="text"
        value={kundenavn}
        onChange={(e) => setKundenavn(e.target.value)}
        placeholder="f.eks. Ola Nordmann"
      />

      <Textarea
        id="beskrivelse"
        label="Beskrivelse (valgfritt)"
        value={beskrivelse}
        onChange={(e) => setBeskrivelse(e.target.value)}
        placeholder="F.eks. overflate, tilkomst, spesielle forhold på jobben"
        rows={4}
      />

      {error && (
        <div className="text-red-700 bg-red-100 border-2 border-red-300 rounded-md px-4 py-3 font-medium">
          {error}
        </div>
      )}

      <Button type="submit" fullWidth disabled={loading}>
        {loading ? 'Beregner...' : 'Beregn tilbud'}
      </Button>
    </Card>
  )
}

function Flatetall({ etikett, verdi }: { etikett: string; verdi: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-black/40">{etikett}</div>
      <div className="text-xl font-black">{verdi}</div>
    </div>
  )
}
