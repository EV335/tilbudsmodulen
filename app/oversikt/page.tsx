'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { LagretTilbud } from '@/lib/historikk'
import type { Faktura } from '@/lib/payments'
import { fakturaBelop } from '@/lib/mva'
import { kanBetales, erForfalt } from '@/lib/fakturaStatus'
import { omfangTekst, type Prissatser } from '@/lib/priser'
import {
  harForslag,
  harMaterialforslag,
  samleErfaring,
  sumEstimerteTimer,
  treffPerMaaned,
  treffUtvikling,
  MIN_JOBBER_FOR_FORSLAG,
  MIN_AVVIK_PROSENT,
  MIN_FORBEDRING_PROSENTPOENG,
  type Etterkalkyle,
  type TreffMaaned,
  type TreffPunkt,
  type TreffUtvikling,
} from '@/lib/etterkalkyle'
import { formatKr, formatDato, formatMaaned, maanedNokkel } from '@/lib/format'
import { leggTilbudIOkt } from '@/lib/tilbudsokt'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const ANTALL_SISTE_TILBUD = 5

// Appens forside for den som er logget inn. Den svarer på tre spørsmål før noen
// rekker å stille dem: hva har jeg tilbudt denne måneden, hva venter jeg på
// penger for, og bommer estimatene mine.
export default function OversiktPage() {
  const router = useRouter()
  const { status } = useSession()
  const [tilbud, setTilbud] = useState<LagretTilbud[] | null>(null)
  const [fakturaer, setFakturaer] = useState<Faktura[] | null>(null)
  const [etterkalkyler, setEtterkalkyler] = useState<Etterkalkyle[]>([])
  const [satser, setSatser] = useState<Prissatser>({})
  const [feil, setFeil] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return
    let aktiv = true

    // Tilbud og fakturaer bærer siden — feiler en av dem, er det ingen oversikt
    // å vise, og da skal brukeren få vite det.
    Promise.all([hentJson('/api/tilbud'), hentJson('/api/invoices')])
      .then(([t, f]) => {
        if (!aktiv) return
        setTilbud(t as LagretTilbud[])
        setFakturaer(f as Faktura[])
      })
      .catch(() => {
        if (aktiv) setFeil('Klarte ikke å hente oversikten.')
      })

    // Etterkalkyler og satser er tillegg, og hentes bevisst hver for seg uten å
    // velte siden: er migrasjonen for etterkalkyle ikke kjørt, skal nøkkeltallene
    // og fakturaene fortsatt stå. Samme valg som i historikken og på satssiden.
    hentJson('/api/etterkalkyle')
      .then((data) => {
        if (aktiv) setEtterkalkyler((data as Etterkalkyle[]) ?? [])
      })
      .catch(() => {
        /* uten registrerte timer er resten av siden fortsatt brukbar */
      })

    hentJson('/api/priser')
      .then((data) => {
        if (aktiv) setSatser((data as Prissatser) ?? {})
      })
      .catch(() => {
        /* uten egne satser måles treffsikkerheten mot standardsatsene */
      })

    return () => {
      aktiv = false
    }
  }, [status])

  function apneTilbud(t: LagretTilbud) {
    leggTilbudIOkt({ id: t.id, input: t.input, resultat: t.resultat })
    router.push('/result')
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
        <p className="text-white/70 mb-8">Oversikten krever innlogging.</p>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  const naa = new Date()
  const denneMaaned = maanedNokkel(naa)
  const forrigeMaaned = maanedNokkel(new Date(naa.getFullYear(), naa.getMonth() - 1, 1))

  const alleTilbud = tilbud ?? []
  const alleFakturaer = fakturaer ?? []

  const tilbudDenne = alleTilbud.filter((t) => maanedNokkel(t.opprettet) === denneMaaned)
  const tilbudForrige = alleTilbud.filter((t) => maanedNokkel(t.opprettet) === forrigeMaaned)

  // «Utestående» er alt som verken er betalt eller kansellert — nøyaktig de
  // fakturaene kunden fortsatt KAN betale. Regelen hentes fra `kanBetales`, den
  // samme som styrer betalingsknappen, slik at oversikten ikke kan komme til å
  // telle en faktura som ventende mens betalingssiden mener den er ferdig.
  const utestaende = alleFakturaer.filter((f) => kanBetales(f.status))
  const forfalte = alleFakturaer.filter((f) => erForfalt(f, naa))
  const betaltDenneMaaned = alleFakturaer.filter(
    (f) => f.status === 'paid' && f.paid_at && maanedNokkel(f.paid_at) === denneMaaned
  )

  const etterkalkylePerTilbud = new Map(etterkalkyler.map((e) => [e.tilbudId, e]))

  // Samme grunnlag som avviksmerket i historikken: øyeblikksbildet som ble
  // lagret med timene, med tilbudets eget timetall som reserve for jobber fra
  // før linjemodellen. Bruker de to ulike grunnlag, viser appen to forskjellige
  // avvik for samme jobb.
  const treffPunkter: TreffPunkt[] = alleTilbud.flatMap((t) => {
    const registrering = etterkalkylePerTilbud.get(t.id)
    if (!registrering) return []
    return [
      {
        dato: t.opprettet,
        estimerteTimer: sumEstimerteTimer(registrering.linjer) || t.resultat.tidsbrukTimer,
        faktiskeTimer: registrering.faktiskeTimer,
      },
    ]
  })

  const maaneder = treffPerMaaned(treffPunkter)
  const utvikling = treffUtvikling(treffPunkter)
  const sisteMaaned = maaneder.length > 0 ? maaneder[maaneder.length - 1] : null

  const antallForslag = samleErfaring(etterkalkyler, satser).filter(
    (e) => harForslag(e) || harMaterialforslag(e)
  ).length

  // Bare FAKTURERTE jobber etterspørres. Et tilbud som aldri ble solgt har ingen
  // timer å føre, og en liste som maste om timer på hvert eneste tilbud ville
  // vært støy — og dermed blitt oversett også de gangene den hadde rett.
  const fakturerteTilbud = new Set(
    alleFakturaer
      .filter((f) => f.tilbud_id && f.status !== 'cancelled')
      .map((f) => f.tilbud_id as string)
  )
  const manglerTimer = alleTilbud.filter(
    (t) => fakturerteTilbud.has(t.id) && !etterkalkylePerTilbud.has(t.id)
  )

  const forfaltSum = summer(forfalte.map((f) => fakturaBelop(f).total))
  const gjoremaal: Gjoremaal[] = []
  if (forfalte.length > 0) {
    gjoremaal.push({
      nokkel: 'forfalt',
      hast: true,
      tekst:
        forfalte.length === 1
          ? `Én faktura er forfalt — ${formatKr(forfaltSum)} du venter på.`
          : `${forfalte.length} fakturaer er forfalt — ${formatKr(forfaltSum)} du venter på.`,
      lenke: '/historikk/invoices',
      lenketekst: 'Se fakturaene',
    })
  }
  if (manglerTimer.length > 0) {
    gjoremaal.push({
      nokkel: 'timer',
      hast: false,
      tekst:
        manglerTimer.length === 1
          ? 'Én fakturert jobb mangler førte timer. Uten dem lærer ikke satsene dine noe.'
          : `${manglerTimer.length} fakturerte jobber mangler førte timer. Uten dem lærer ikke satsene dine noe.`,
      // Lenken går til den ELDSTE av dem: lista er nyeste først, så siste
      // element er den som har ligget lengst — og den som er nærmest å bli
      // glemt helt.
      lenke: `/historikk/etterkalkyle/${manglerTimer[manglerTimer.length - 1].id}`,
      lenketekst: manglerTimer.length === 1 ? 'Før timer' : 'Før timer på den eldste',
    })
  }
  if (antallForslag > 0) {
    gjoremaal.push({
      nokkel: 'forslag',
      hast: false,
      tekst:
        antallForslag === 1
          ? 'Én sats bommer mot timene du har ført.'
          : `${antallForslag} satser bommer mot timene du har ført.`,
      lenke: '/innstillinger/priser',
      lenketekst: 'Se forslagene',
    })
  }

  const laster = tilbud === null && fakturaer === null && !feil

  return (
    <Section size="xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-black mb-2">Oversikt</h1>
          <p className="text-white/70">
            {denneMaaned ? `Slik ligger ${formatMaaned(denneMaaned)} an.` : 'Slik ligger måneden an.'}
          </p>
        </div>
        <Button href="/calc" size="md" className="shrink-0">
          Nytt tilbud
        </Button>
      </div>

      {feil && <p className="text-red-400 mb-6">{feil}</p>}
      {laster && <p className="text-white/60">Laster oversikt...</p>}

      {!feil && !laster && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <Nokkeltall
              etikett="Tilbud denne måneden"
              verdi={String(tilbudDenne.length)}
              under={`${formatKr(summer(tilbudDenne.map((t) => t.resultat.pris)))} tilbudt`}
              fotnote={
                tilbudForrige.length > 0
                  ? `${tilbudForrige.length} forrige måned`
                  : 'ingen forrige måned'
              }
            />
            <Nokkeltall
              etikett="Utestående"
              verdi={formatKr(summer(utestaende.map((f) => fakturaBelop(f).total)))}
              under={`${utestaende.length} ${utestaende.length === 1 ? 'ubetalt faktura' : 'ubetalte fakturaer'}`}
              fotnote={forfalte.length > 0 ? `${forfalte.length} forfalt` : 'ingen forfalt'}
              tone={forfalte.length > 0 ? 'varsel' : 'noytral'}
            />
            <Nokkeltall
              etikett="Betalt denne måneden"
              verdi={formatKr(summer(betaltDenneMaaned.map((f) => fakturaBelop(f).total)))}
              under={`${betaltDenneMaaned.length} ${betaltDenneMaaned.length === 1 ? 'faktura' : 'fakturaer'}`}
              tone={betaltDenneMaaned.length > 0 ? 'bra' : 'noytral'}
            />
            <Nokkeltall
              etikett="Typisk bom"
              verdi={sisteMaaned ? `± ${sisteMaaned.typiskBom} %` : '—'}
              under={
                sisteMaaned
                  ? `${formatMaaned(sisteMaaned.maaned)}, ${sisteMaaned.jobber} ${
                      sisteMaaned.jobber === 1 ? 'jobb' : 'jobber'
                    }`
                  : 'ingen førte timer ennå'
              }
              tone={
                !sisteMaaned ? 'noytral' : sisteMaaned.typiskBom < MIN_AVVIK_PROSENT ? 'bra' : 'varsel'
              }
            />
          </div>

          {gjoremaal.length > 0 && (
            <Card padding="md" className="mb-10">
              <h2 className="text-xl font-black mb-4">Neste steg</h2>
              <ul className="space-y-3">
                {gjoremaal.map((g) => (
                  <li
                    key={g.nokkel}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                  >
                    <span className={g.hast ? 'font-bold text-red-700' : 'text-black/80'}>{g.tekst}</span>
                    <Link href={g.lenke} className="text-sm font-medium text-blue hover:underline shrink-0">
                      {g.lenketekst} →
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card padding="md" className="mb-10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-1">
              <h2 className="text-xl font-black">Treffsikkerhet over tid</h2>
              <Link href="/innstillinger/priser" className="text-sm font-medium text-blue hover:underline">
                Se satsene dine →
              </Link>
            </div>
            <p className="text-sm text-black/50 mb-6">
              Hvor nær estimatet timene faktisk lå. Jobben telles i måneden{' '}
              <strong>tilbudet ble laget</strong>, ikke måneden timene ble ført — det er estimatet
              som måles.
            </p>

            {maaneder.length === 0 ? (
              <p className="text-black/60">
                Ingen førte timer ennå. Åpne en jobb i historikken og trykk «Før timer». Etter{' '}
                {MIN_JOBBER_FOR_FORSLAG} jobber begynner appen å foreslå satser som er dine, ikke
                bokas.
              </p>
            ) : (
              <>
                {utvikling && <Utviklingslinje utvikling={utvikling} />}
                <div className="space-y-5">
                  {[...maaneder].reverse().map((m) => (
                    <Maanedsrad
                      key={m.maaned}
                      maaned={m}
                      maks={Math.max(...maaneder.map((x) => x.typiskBom), 1)}
                    />
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card padding="md">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
              <h2 className="text-xl font-black">Siste tilbud</h2>
              <Link href="/historikk" className="text-sm font-medium text-blue hover:underline">
                Se alle →
              </Link>
            </div>

            {alleTilbud.length === 0 ? (
              <p className="text-black/60">
                Ingen lagrede tilbud ennå. Regn ut det første, så fyller denne siden seg selv.
              </p>
            ) : (
              <ul className="divide-y divide-black/10">
                {alleTilbud.slice(0, ANTALL_SISTE_TILBUD).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => apneTilbud(t)}
                      className="w-full py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left hover:opacity-70 transition-opacity"
                    >
                      <span className="min-w-0">
                        <span className="font-bold break-words">
                          {t.input.jobbType}
                          {t.input.kundenavn ? ` · ${t.input.kundenavn}` : ''}
                        </span>
                        <span className="block text-sm text-black/50">
                          {omfangTekst(t.input.jobbType, t.input.linjer, t.input.romstorrelseM2)} ·{' '}
                          {formatDato(t.opprettet)}
                        </span>
                      </span>
                      <span className="font-black text-blue shrink-0">{formatKr(t.resultat.pris)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </Section>
  )
}

interface Gjoremaal {
  nokkel: string
  tekst: string
  lenke: string
  lenketekst: string
  /** Haster — vises rødt, og legges inn først. */
  hast: boolean
}

async function hentJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Henting av ${url} feilet`)
  return res.json()
}

function summer(tall: number[]): number {
  return tall.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
}

function Nokkeltall({
  etikett,
  verdi,
  under,
  fotnote,
  tone = 'noytral',
}: {
  etikett: string
  verdi: string
  under?: string
  fotnote?: string
  tone?: 'noytral' | 'varsel' | 'bra'
}) {
  const farge = tone === 'varsel' ? 'text-red-700' : tone === 'bra' ? 'text-green-700' : 'text-dark'

  return (
    <Card padding="md" className="flex flex-col">
      <div className="text-xs font-bold uppercase tracking-wide text-black/40">{etikett}</div>
      {/* break-words og ikke truncate: et beløp som er for langt skal brekke,
          ikke kuttes. «kr 128...» på et nøkkeltall er verre enn ingen visning. */}
      <div className={`mt-2 text-2xl font-black leading-tight break-words ${farge}`}>{verdi}</div>
      {under && <div className="mt-1 text-sm text-black/60">{under}</div>}
      {fotnote && <div className="mt-auto pt-2 text-xs text-black/40">{fotnote}</div>}
    </Card>
  )
}

/**
 * Én måned som en stolpe.
 *
 * Lang stolpe = stor bom. Det er «feil vei» for noe som heter treffsikkerhet,
 * men riktig vei for det som faktisk måles: hvor mye du bommet. Tallet ved
 * siden av står med ± nettopp for å si det.
 */
function Maanedsrad({ maaned, maks }: { maaned: TreffMaaned; maks: number }) {
  const bredde = Math.max(2, Math.round((maaned.typiskBom / maks) * 100))
  const farge =
    maaned.typiskBom < MIN_AVVIK_PROSENT
      ? 'bg-green-600'
      : maaned.typiskBom < 25
        ? 'bg-gold'
        : 'bg-red-600'

  // Retningen er en annen beskjed enn størrelsen: bommer du like mye begge
  // veier, er det støy — bommer du systematisk én vei, skal satsen flyttes.
  // Vises bare når skjevheten er stor nok til å bety noe, og når det står mer
  // enn én jobb bak den.
  const skjevhet =
    maaned.jobber > 1 && Math.abs(maaned.snittAvvik) >= MIN_AVVIK_PROSENT
      ? maaned.snittAvvik > 0
        ? 'Estimatene lå jevnt for lavt — jobbene tok lengre tid enn du trodde.'
        : 'Estimatene lå jevnt for høyt — jobbene gikk raskere enn du trodde.'
      : null

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-bold">{formatMaaned(maaned.maaned)}</span>
        <span className="text-black/50">
          {maaned.jobber} {maaned.jobber === 1 ? 'jobb' : 'jobber'} ·{' '}
          {maaned.sumFaktiskeTimer.toLocaleString('nb-NO')} t brukt mot{' '}
          {maaned.sumEstimerteTimer.toLocaleString('nb-NO')} t estimert
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-black/10 overflow-hidden">
          <div className={`h-full rounded-full ${farge}`} style={{ width: `${bredde}%` }} />
        </div>
        <span className="w-20 shrink-0 text-right text-sm font-black">± {maaned.typiskBom} %</span>
      </div>
      {skjevhet && <p className="mt-1.5 text-xs text-black/50">{skjevhet}</p>}
    </div>
  )
}

function Utviklingslinje({ utvikling }: { utvikling: TreffUtvikling }) {
  const uendret = Math.abs(utvikling.forbedring) < MIN_FORBEDRING_PROSENTPOENG
  const bedre = utvikling.forbedring > 0

  const ramme = uendret
    ? 'border-black/15 bg-black/5'
    : bedre
      ? 'border-green-600 bg-green-50'
      : 'border-gold bg-gold/10'

  return (
    <div className={`mb-6 rounded-md border-2 px-4 py-3 ${ramme}`}>
      <p className="font-bold">
        {uendret
          ? 'Omtrent like presist som før.'
          : bedre
            ? `Du treffer bedre nå — bommen er ${utvikling.forbedring} poeng mindre.`
            : `Bommen har vokst ${Math.abs(utvikling.forbedring)} poeng.`}
      </p>
      <p className="mt-1 text-sm text-black/60">
        ± {utvikling.nyereBom} % på de siste {utvikling.nyereJobber} jobbene, mot ± {utvikling.eldreBom}{' '}
        % på de {utvikling.eldreJobber} før dem.
      </p>
    </div>
  )
}
