'use client'

import { useMemo, useState } from 'react'
import { TilbudInput } from '@/lib/ai'
import {
  FAG,
  FAGNAVN,
  hentFag,
  hentOperasjon,
  beregnTilbud,
  marginSomPaaslag,
  gjeldendeSats,
  ENHETSTEKST,
  type Prissatser,
} from '@/lib/priser'
import { tilTall, tilFeltTekst } from '@/lib/tall'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import TallInput from '@/components/ui/TallInput'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'

const JOBBTYPE_OPTIONS = FAGNAVN.map((navn) => ({ value: navn, label: FAG[navn].navn }))

interface LinjeSkjema {
  /** Stabil nøkkel for React. Uten den arver en linje inputfeltene til den som
   *  ble slettet over den — indeks som key gjenbruker DOM-noden. */
  id: number
  operasjonId: string
  antall: string
  materialPerEnhet: string
}

let linjeTeller = 0

interface InputFormProps {
  onSubmit: (input: TilbudInput) => void
  loading: boolean
  error?: string | null
  /** Brukerens egne satser. Tom for den som ikke har endret noe. */
  satser?: Prissatser
}

function nyLinje(jobbType: string, satser?: Prissatser, operasjonId?: string): LinjeSkjema {
  const fag = hentFag(jobbType)
  const op = operasjonId ? hentOperasjon(jobbType, operasjonId) : fag.operasjoner[0]
  const valgt = op ?? fag.operasjoner[0]
  const sats = gjeldendeSats(valgt, satser)
  return {
    id: ++linjeTeller,
    operasjonId: valgt.id,
    antall: '',
    materialPerEnhet: tilFeltTekst(sats.materialPerEnhet),
  }
}

export default function InputForm({ onSubmit, loading, error, satser }: InputFormProps) {
  const [jobbType, setJobbType] = useState('Maler')
  const [timepris, setTimepris] = useState('')
  const [margin, setMargin] = useState(tilFeltTekst(FAG.Maler.marginProsent))
  const [linjer, setLinjer] = useState<LinjeSkjema[]>([nyLinje('Maler', satser)])
  const [beskrivelse, setBeskrivelse] = useState('')
  const [kundenavn, setKundenavn] = useState('')

  const fag = hentFag(jobbType)
  const operasjonOptions = fag.operasjoner.map((o) => ({
    value: o.id,
    label: `${o.navn} (per ${ENHETSTEKST[o.enhet]})`,
  }))

  // Satsen sendes med hver linje som et øyeblikksbilde, slik at tilbudet kan
  // etterregnes senere selv om brukeren endrer satsene sine i mellomtiden.
  function satsFor(operasjonId: string): number | undefined {
    const op = hentOperasjon(jobbType, operasjonId)
    return op ? gjeldendeSats(op, satser).timerPerEnhet : undefined
  }

  function byttFag(nyttFag: string) {
    // Operasjonene tilhører hvert sitt fag, så linjene kan ikke følge med over —
    // de må nullstilles. Men et feilklikk i nedtrekkslista slettet tidligere en
    // ferdig utfylt jobb uten et eneste ord. Vi spør bare når det faktisk står
    // arbeid der; er alt tomt, er det ingenting å advare om.
    const harArbeid = linjer.some((l) => (tilTall(l.antall) ?? 0) > 0)
    if (
      harArbeid &&
      !window.confirm(
        `Bytter du til ${hentFag(nyttFag).navn}, må du fylle inn linjene på nytt. ` +
          'Arbeidet du har lagt inn forsvinner. Fortsette?'
      )
    ) {
      return
    }
    setJobbType(nyttFag)
    setMargin(tilFeltTekst(hentFag(nyttFag).marginProsent))
    setLinjer([nyLinje(nyttFag, satser)])
  }

  function endreLinje(index: number, endring: Partial<LinjeSkjema>) {
    setLinjer((forrige) =>
      forrige.map((l, i) => {
        if (i !== index) return l
        const oppdatert = { ...l, ...endring }
        // Bytter du operasjon, skal materialsatsen følge den nye operasjonen —
        // ellers står 450 kr/m² flis igjen på en malerlinje.
        if (endring.operasjonId && endring.operasjonId !== l.operasjonId) {
          const nyOp = hentOperasjon(jobbType, endring.operasjonId)
          oppdatert.materialPerEnhet = nyOp ? tilFeltTekst(gjeldendeSats(nyOp, satser).materialPerEnhet) : '0'
        }
        return oppdatert
      })
    )
  }

  // Samme funksjon som serveren bruker, så forhåndsvisningen kan ikke bomme.
  const forhandsvisning = useMemo(() => {
    const tp = (tilTall(timepris) ?? 0)
    if (!tp || tp <= 0) return null
    const m = (tilTall(margin) ?? -1)
    if (!Number.isFinite(m) || m < 0 || m >= 100) return null
    const gyldige = linjer
      .filter((l) => (tilTall(l.antall) ?? 0) > 0)
      .map((l) => ({
        operasjonId: l.operasjonId,
        antall: (tilTall(l.antall) ?? 0),
        timerPerEnhet: satsFor(l.operasjonId),
        materialPerEnhet: tilTall(l.materialPerEnhet) ?? undefined,
      }))
    if (gyldige.length === 0) return null
    return beregnTilbud(jobbType, gyldige, tp, m)
  }, [jobbType, linjer, timepris, margin])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      jobbType,
      timepris: (tilTall(timepris) ?? 0),
      marginProsent: (tilTall(margin) ?? -1),
      linjer: linjer
        .filter((l) => (tilTall(l.antall) ?? 0) > 0)
        .map((l) => ({
          operasjonId: l.operasjonId,
          antall: (tilTall(l.antall) ?? 0),
          timerPerEnhet: satsFor(l.operasjonId),
          materialPerEnhet: tilTall(l.materialPerEnhet) ?? undefined,
        })),
      beskrivelse,
      kundenavn,
    })
  }

  return (
    <Card as="form" onSubmit={handleSubmit} className="space-y-6">
      <Select id="jobbType" label="Fag" value={jobbType} onChange={(e) => byttFag(e.target.value)} options={JOBBTYPE_OPTIONS} />

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
              Tilsvarer <strong>{marginSomPaaslag((tilTall(margin) ?? -1))} % påslag</strong> på kostnaden.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Hva skal gjøres?</h3>
          <Button type="button" variant="link" onClick={() => setLinjer((f) => [...f, nyLinje(jobbType, satser)])}>
            + Legg til linje
          </Button>
        </div>

        {linjer.map((linje, i) => {
          const op = hentOperasjon(jobbType, linje.operasjonId)
          return (
            <div key={linje.id} className="rounded-md border-2 border-slate-200 p-4 space-y-4">
              <Select
                id={`operasjon-${i}`}
                label="Arbeid"
                value={linje.operasjonId}
                onChange={(e) => endreLinje(i, { operasjonId: e.target.value })}
                options={operasjonOptions}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TallInput
                  id={`antall-${i}`}
                  label={`Antall (${op ? ENHETSTEKST[op.enhet] : ''})`}
                  value={linje.antall}
                  onChange={(e) => endreLinje(i, { antall: e.target.value })}
                  placeholder="f.eks. 45"
                />
                <TallInput
                  id={`material-${i}`}
                  label="Materialer (kr per enhet)"
                  value={linje.materialPerEnhet}
                  onChange={(e) => endreLinje(i, { materialPerEnhet: e.target.value })}
                />
              </div>

              {op?.hjelpetekst && <p className="text-sm text-slate-600">{op.hjelpetekst}</p>}

              {linjer.length > 1 && (
                <Button type="button" variant="link" onClick={() => setLinjer((f) => f.filter((_, j) => j !== i))}>
                  Fjern linje
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {forhandsvisning && (
        <div className="rounded-md border-2 border-slate-300 bg-slate-50 p-4 space-y-2">
          <h3 className="font-semibold text-slate-900">Regnestykket</h3>
          {forhandsvisning.linjer.map((l, i) => (
            <p key={`${l.operasjonId}-${i}`} className="text-sm text-slate-700">
              {l.navn}: {l.antall} {l.enhetstekst} × {l.timerPerEnhet} t = {l.timer} t × {(tilTall(timepris) ?? 0).toLocaleString('nb-NO')} kr
              {' + '}
              {l.materialKr.toLocaleString('nb-NO')} kr materialer → <strong>{l.prisKr.toLocaleString('nb-NO')} kr</strong>
              {' '}({l.prisPerEnhet.toLocaleString('nb-NO')} kr per {l.enhetstekst})
            </p>
          ))}
          <p className="text-sm text-slate-700 pt-2 border-t border-slate-300">
            Arbeid {forhandsvisning.arbeidKr.toLocaleString('nb-NO')} kr + materialer{' '}
            {forhandsvisning.materialKr.toLocaleString('nb-NO')} kr + margin{' '}
            {forhandsvisning.marginKr.toLocaleString('nb-NO')} kr
          </p>
          <p className="text-lg font-bold text-slate-900">
            Sum: kr {forhandsvisning.prisKr.toLocaleString('nb-NO')},- for {forhandsvisning.timer} timer
          </p>
          {forhandsvisning.linjer
            .filter((l) => l.advarsel)
            .map((l, i) => (
              <p key={`adv-${l.operasjonId}-${i}`} className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2">
                {l.navn}: {l.advarsel}
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
