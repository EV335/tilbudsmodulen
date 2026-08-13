'use client'

import { useMemo, useState } from 'react'
import { TilbudInput } from '@/lib/ai'
import { FAG, FAGNAVN, hentFag, hentOperasjon, beregnTilbud, marginSomPaaslag, ENHETSTEKST } from '@/lib/priser'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
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
}

function nyLinje(jobbType: string, operasjonId?: string): LinjeSkjema {
  const fag = hentFag(jobbType)
  const op = operasjonId ? hentOperasjon(jobbType, operasjonId) : fag.operasjoner[0]
  return {
    id: ++linjeTeller,
    operasjonId: op?.id ?? fag.operasjoner[0].id,
    antall: '',
    materialPerEnhet: String(op?.materialPerEnhet ?? 0),
  }
}

export default function InputForm({ onSubmit, loading, error }: InputFormProps) {
  const [jobbType, setJobbType] = useState('Maler')
  const [timepris, setTimepris] = useState('')
  const [margin, setMargin] = useState(String(FAG.Maler.marginProsent))
  const [linjer, setLinjer] = useState<LinjeSkjema[]>([nyLinje('Maler')])
  const [beskrivelse, setBeskrivelse] = useState('')
  const [kundenavn, setKundenavn] = useState('')

  const fag = hentFag(jobbType)
  const operasjonOptions = fag.operasjoner.map((o) => ({
    value: o.id,
    label: `${o.navn} (per ${ENHETSTEKST[o.enhet]})`,
  }))

  function byttFag(nyttFag: string) {
    setJobbType(nyttFag)
    setMargin(String(hentFag(nyttFag).marginProsent))
    setLinjer([nyLinje(nyttFag)])
  }

  function endreLinje(index: number, endring: Partial<LinjeSkjema>) {
    setLinjer((forrige) =>
      forrige.map((l, i) => {
        if (i !== index) return l
        const oppdatert = { ...l, ...endring }
        // Bytter du operasjon, skal materialsatsen følge den nye operasjonen —
        // ellers står 450 kr/m² flis igjen på en malerlinje.
        if (endring.operasjonId && endring.operasjonId !== l.operasjonId) {
          oppdatert.materialPerEnhet = String(hentOperasjon(jobbType, endring.operasjonId)?.materialPerEnhet ?? 0)
        }
        return oppdatert
      })
    )
  }

  // Samme funksjon som serveren bruker, så forhåndsvisningen kan ikke bomme.
  const forhandsvisning = useMemo(() => {
    const tp = Number(timepris)
    if (!tp || tp <= 0) return null
    const m = Number(margin)
    if (!Number.isFinite(m) || m < 0 || m >= 100) return null
    const gyldige = linjer
      .filter((l) => Number(l.antall) > 0)
      .map((l) => ({
        operasjonId: l.operasjonId,
        antall: Number(l.antall),
        materialPerEnhet: l.materialPerEnhet === '' ? undefined : Number(l.materialPerEnhet),
      }))
    if (gyldige.length === 0) return null
    return beregnTilbud(jobbType, gyldige, tp, m)
  }, [jobbType, linjer, timepris, margin])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      jobbType,
      timepris: Number(timepris),
      marginProsent: Number(margin),
      linjer: linjer
        .filter((l) => Number(l.antall) > 0)
        .map((l) => ({
          operasjonId: l.operasjonId,
          antall: Number(l.antall),
          materialPerEnhet: l.materialPerEnhet === '' ? undefined : Number(l.materialPerEnhet),
        })),
      beskrivelse,
      kundenavn,
    })
  }

  return (
    <Card as="form" onSubmit={handleSubmit} className="space-y-6">
      <Select id="jobbType" label="Fag" value={jobbType} onChange={(e) => byttFag(e.target.value)} options={JOBBTYPE_OPTIONS} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          id="timepris"
          label="Din timepris (kr, eks. mva)"
          type="number"
          min="1"
          max="100000"
          step="any"
          required
          value={timepris}
          onChange={(e) => setTimepris(e.target.value)}
          placeholder="f.eks. 750"
        />

        <div>
          <Input
            id="margin"
            label="Margin (% av salgspris)"
            type="number"
            min="0"
            max="99"
            step="any"
            required
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
          />
          {Number(margin) > 0 && Number(margin) < 100 && (
            <p className="mt-2 text-sm text-slate-600">
              Tilsvarer <strong>{marginSomPaaslag(Number(margin))} % påslag</strong> på kostnaden.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Hva skal gjøres?</h3>
          <Button type="button" variant="link" onClick={() => setLinjer((f) => [...f, nyLinje(jobbType)])}>
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
                <Input
                  id={`antall-${i}`}
                  label={`Antall (${op ? ENHETSTEKST[op.enhet] : ''})`}
                  type="number"
                  min="0"
                  max="100000"
                  step="any"
                  value={linje.antall}
                  onChange={(e) => endreLinje(i, { antall: e.target.value })}
                  placeholder="f.eks. 45"
                />
                <Input
                  id={`material-${i}`}
                  label="Materialer (kr per enhet)"
                  type="number"
                  min="0"
                  step="any"
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
              {l.navn}: {l.antall} {l.enhetstekst} × {l.timerPerEnhet} t = {l.timer} t × {Number(timepris).toLocaleString('nb-NO')} kr
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
