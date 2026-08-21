'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { LagretTilbud } from '@/lib/historikk'
import { avvikProsent, fordelTimer, linjerFraResultat, type EtterkalkyleLinje } from '@/lib/etterkalkyle'
import { ENHETSTEKST, finnOperasjon, omfangTekst } from '@/lib/priser'
import { formatKr, formatDato } from '@/lib/format'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'

export default function EtterkalkylePage({ params }: { params: { tilbudId: string } }) {
  const router = useRouter()
  const { status } = useSession()
  const [tilbud, setTilbud] = useState<LagretTilbud | null>(null)
  const [timer, setTimer] = useState('')
  const [material, setMaterial] = useState('')
  const [notat, setNotat] = useState('')
  const [registrert, setRegistrert] = useState(false)
  const [lagrer, setLagrer] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [laster, setLaster] = useState(true)

  useEffect(() => {
    if (status !== 'authenticated') return

    Promise.all([
      fetch(`/api/tilbud/${params.tilbudId}`).then((res) => (res.ok ? res.json() : null)),
      fetch('/api/etterkalkyle').then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([lagret, alle]) => {
        setTilbud(lagret)
        const min = (alle ?? []).find((e: { tilbudId: string }) => e.tilbudId === params.tilbudId)
        if (min) {
          setRegistrert(true)
          setTimer(String(min.faktiskeTimer))
          setMaterial(min.faktiskMaterialKr === undefined ? '' : String(min.faktiskMaterialKr))
          setNotat(min.notat ?? '')
        }
      })
      .catch(() => setFeil('Klarte ikke å hente jobben.'))
      .finally(() => setLaster(false))
  }, [status, params.tilbudId])

  const estimerteTimer = tilbud?.resultat.tidsbrukTimer ?? 0
  const faktiskeTimer = timer.trim() === '' ? null : Number(timer)
  const avvik =
    faktiskeTimer !== null && Number.isFinite(faktiskeTimer) && faktiskeTimer > 0
      ? avvikProsent(faktiskeTimer, estimerteTimer)
      : null

  // Øyeblikksbildet serveren vil lagre — samme funksjon, ikke en kopi av den.
  // Her sto det tidligere en håndkopi, og den hadde allerede drevet fra
  // originalen: den kastet linjer uten timer, som serveren nå beholder for
  // materialets skyld. Fordelingen som vises skal være den som lærer opp satsen.
  const linjer: EtterkalkyleLinje[] = tilbud ? linjerFraResultat(tilbud.resultat) : []
  const fordelt = faktiskeTimer && faktiskeTimer > 0 ? fordelTimer(faktiskeTimer, linjer) : []

  // Materialene har sitt eget avvik. Timer og kroner bommer ikke i takt: en
  // jobb kan gå fort og likevel sluke maling, og det er to ulike satser som må
  // rettes hver for seg.
  const faktiskMaterial = material.trim() === '' ? null : Number(material)
  const materialavvik =
    faktiskMaterial !== null && Number.isFinite(faktiskMaterial) && faktiskMaterial > 0
      ? avvikProsent(faktiskMaterial, tilbud?.resultat.materialkostTotal ?? 0)
      : null

  async function lagre(e: React.FormEvent) {
    e.preventDefault()
    setLagrer(true)
    setFeil(null)
    try {
      const res = await fetch('/api/etterkalkyle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tilbudId: params.tilbudId,
          faktiskeTimer: timer,
          faktiskMaterialKr: material,
          notat,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Lagring feilet.')
      }
      router.push('/historikk')
    } catch (err) {
      setFeil(err instanceof Error ? err.message : 'Noe gikk galt.')
    } finally {
      setLagrer(false)
    }
  }

  async function slett() {
    if (!window.confirm('Slette de registrerte timene for denne jobben?')) return
    setLagrer(true)
    setFeil(null)
    try {
      const res = await fetch(`/api/etterkalkyle/${params.tilbudId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Sletting feilet.')
      router.push('/historikk')
    } catch {
      setFeil('Klarte ikke å slette registreringen.')
      setLagrer(false)
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

  if (laster) {
    return (
      <Section spacing="none" className="py-16 text-center">
        <p className="text-white/50">Laster...</p>
      </Section>
    )
  }

  if (!tilbud) {
    return (
      <Section size="sm" spacing="roomy">
        <h1 className="text-2xl font-black mb-4">Fant ikke jobben</h1>
        <p className="text-white/70 mb-8">Tilbudet finnes ikke, eller det er slettet.</p>
        <Button href="/historikk" size="md">
          Til historikk
        </Button>
      </Section>
    )
  }

  return (
    <Section size="sm">
      <Link href="/historikk" className="text-white/60 hover:text-white text-sm font-medium">
        ← Historikk
      </Link>

      <h1 className="text-3xl md:text-4xl font-black mt-4 mb-2">Etterkalkyle</h1>
      <p className="text-white/70 mb-8">
        {tilbud.input.jobbType}
        {tilbud.input.kundenavn ? ` · ${tilbud.input.kundenavn}` : ''} ·{' '}
        {omfangTekst(tilbud.input.jobbType, tilbud.input.linjer, tilbud.input.romstorrelseM2)} ·{' '}
        {formatDato(tilbud.opprettet)}
      </p>

      {feil && (
        <div className="mb-6 text-red-700 bg-red-100 border-2 border-red-300 rounded-md px-4 py-3 font-medium">
          {feil}
        </div>
      )}

      <Card as="form" onSubmit={lagre} className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-4 border-b-2 border-black/10">
          <div>
            <div className="text-sm text-black/50">Estimert tid</div>
            <div className="text-2xl font-black">{estimerteTimer.toLocaleString('nb-NO')} timer</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-black/50">Tilbudt pris</div>
            <div className="text-2xl font-black">{formatKr(tilbud.resultat.pris)}</div>
          </div>
        </div>

        <Input
          id="timer"
          label="Timer jobben faktisk tok"
          type="number"
          min="0"
          step="any"
          required
          autoFocus
          value={timer}
          onChange={(e) => setTimer(e.target.value)}
          hint="Alle timene på jobben, slik du fører dem selv. Rigging og opprydding også."
        />

        {avvik !== null && (
          <div
            className={`rounded-md px-4 py-3 font-medium border-2 ${
              Math.abs(avvik) < 10
                ? 'bg-green-50 border-green-300 text-green-900'
                : avvik > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-blue-50 border-blue-300 text-blue-900'
            }`}
          >
            {avvik === 0
              ? 'Estimatet traff nøyaktig.'
              : avvik > 0
                ? `Jobben tok ${avvik} % lengre tid enn estimert.`
                : `Jobben tok ${Math.abs(avvik)} % kortere tid enn estimert.`}
          </div>
        )}

        <Input
          id="material"
          label="Materialer faktisk kostet (kr)"
          type="number"
          min="0"
          step="any"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          hint={`Valgfritt. Estimert: ${formatKr(tilbud.resultat.materialkostTotal)}.`}
        />

        {materialavvik !== null && (
          <p className="text-sm text-black/60 -mt-3">
            {materialavvik === 0
              ? 'Materialene traff estimatet.'
              : materialavvik > 0
                ? `Materialene ble ${materialavvik} % dyrere enn estimert.`
                : `Materialene ble ${Math.abs(materialavvik)} % billigere enn estimert.`}
          </p>
        )}

        <Textarea
          id="notat"
          label="Notat"
          rows={3}
          maxLength={2000}
          value={notat}
          onChange={(e) => setNotat(e.target.value)}
          placeholder="Valgfritt. F.eks. «gammel maling måtte skrapes først»."
        />

        {fordelt.length > 1 && (
          <div className="text-sm text-black/60 border-t-2 border-black/10 pt-4">
            <p className="font-bold text-black/70 mb-2">Slik fordeles timene på operasjonene</p>
            <ul className="space-y-1">
              {fordelt.map((l) => {
                const op = finnOperasjon(l.operasjonId)?.operasjon
                return (
                  <li key={l.operasjonId} className="flex justify-between gap-4">
                    <span>{op?.navn ?? l.operasjonId}</span>
                    <span className="tabular-nums shrink-0">
                      {l.faktiskTimer.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} t /{' '}
                      {l.antall.toLocaleString('nb-NO')} {op ? ENHETSTEKST[op.enhet] : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-black/50">
              Jobben har flere operasjoner, og timene sier ikke hvilken som tok den ekstra tida. De
              fordeles derfor i forhold til estimatet. Jobber med bare én operasjon gir det sikreste
              grunnlaget for å justere satsene.
            </p>
          </div>
        )}

        {linjer.length === 0 && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded px-3 py-2">
            Dette tilbudet er laget før linjemodellen og har ingen operasjoner. Avviket blir
            registrert, men jobben kan ikke være med på å justere satsene dine.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <Button type="submit" size="md" disabled={lagrer || timer.trim() === ''}>
            {lagrer ? 'Lagrer...' : registrert ? 'Oppdater' : 'Lagre'}
          </Button>
          {registrert && (
            <button
              type="button"
              onClick={slett}
              disabled={lagrer}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              Slett registreringen
            </button>
          )}
        </div>
      </Card>

      <p className="text-white/50 text-sm mt-6">
        Når nok jobber er registrert, foreslår{' '}
        <Link href="/innstillinger/priser" className="underline">
          Dine satser
        </Link>{' '}
        justeringer basert på det du faktisk bruker av tid.
      </p>
    </Section>
  )
}
