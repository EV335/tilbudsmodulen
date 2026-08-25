// Etterkalkyle — hva jobben faktisk tok, målt mot hva vi trodde.
//
// Prisboka i lib/priser.ts og brukerens egne satser i `prissatser` er begge
// ANSLAG. Uten en tilbakemelding fra virkeligheten kan en håndverker ligge
// 30 % feil på hver eneste jobb i et år uten at noe fanger det opp.
//
// Denne fila er ren regning, uten database og uten React, slik at både
// serveren, skjemaet i nettleseren og testene bruker nøyaktig samme tall.

import { BeregnetLinje, Operasjon, Prissatser, finnOperasjon, gjeldendeSats } from '@/lib/priser'
import { maanedNokkel } from '@/lib/format'

/**
 * Øyeblikksbilde av tilbudets linjer, tatt da timene ble registrert.
 *
 * Lagres med registreringen og ikke som en peker til tilbudet: redigerer noen
 * tilbudet etterpå (45 m² blir til 60), ville grunnlaget for et forslag som
 * allerede er gitt endret seg stille, og satsen drevet i en retning ingen ba om.
 */
export interface EtterkalkyleLinje {
  operasjonId: string
  antall: number
  estimertTimer: number
  /**
   * Materialkostnaden linja var estimert til. Valgfri fordi registreringer
   * lagret før materialavviket kom til ikke har den — de teller fortsatt på
   * timesiden, men kan ikke si noe om materialer.
   */
  estimertMaterialKr?: number
}

export interface Etterkalkyle {
  tilbudId: string
  faktiskeTimer: number
  faktiskMaterialKr?: number
  notat?: string
  linjer: EtterkalkyleLinje[]
  registrert: string
}

/** Avvik i prosent. Positivt = jobben tok lengre tid enn estimert. */
export function avvikProsent(faktiskeTimer: number, estimerteTimer: number): number | null {
  if (!Number.isFinite(faktiskeTimer) || !Number.isFinite(estimerteTimer)) return null
  if (estimerteTimer <= 0) return null
  return Math.round(((faktiskeTimer - estimerteTimer) / estimerteTimer) * 100)
}

export function sumEstimerteTimer(linjer: EtterkalkyleLinje[]): number {
  return linjer.reduce((sum, l) => sum + (Number.isFinite(l.estimertTimer) ? l.estimertTimer : 0), 0)
}

/**
 * Fordeler de faktiske timene ut på linjene.
 *
 * En jobb på «45 m² vegg + 12 m² tak» som tok 14 timer sier ikke hvilken av de
 * to som tok den ekstra tida. Vi fordeler i forhold til det estimerte
 * timetallet — altså antar at bommen er like stor på begge. Det er en antakelse,
 * ikke en måling, og derfor teller antall jobber bak et forslag: en jobb med
 * ÉN operasjon er et rent signal, en jobb med fire er et rykte.
 *
 * Er summen av estimerte timer null (gamle tilbud uten linjer), får vi ingen
 * fordeling — da er registreringen fortsatt verdt noe som avvikstall, men den
 * kan ikke lære opp en sats.
 */
function fordelEtterVekt(
  total: number,
  linjer: EtterkalkyleLinje[],
  vekt: (l: EtterkalkyleLinje) => number
): { linje: EtterkalkyleLinje; andel: number }[] {
  // Nevneren regnes av de SAMME linjene som får noe tildelt. Ble den regnet av
  // alle linjene, ville en linje som faller ut av filteret (antall 0 fra et
  // håndredigert eller gammelt øyeblikksbilde) fortsatt tatt sin andel av
  // nevneren — og det som var tildelt den ville forsvunnet. Da ville
  // satsforslaget blitt for lavt, altså foreslått at jobben er billigere eller
  // går raskere enn den gjør.
  const med = linjer.filter(
    (l) => Number.isFinite(l.antall) && l.antall > 0 && Number.isFinite(vekt(l)) && vekt(l) > 0
  )
  const sum = med.reduce((s, l) => s + vekt(l), 0)
  if (!Number.isFinite(total) || total <= 0 || sum <= 0) return []

  return med.map((l) => ({ linje: l, andel: (vekt(l) / sum) * total }))
}

export function fordelTimer(
  faktiskeTimer: number,
  linjer: EtterkalkyleLinje[]
): { operasjonId: string; antall: number; estimertTimer: number; faktiskTimer: number }[] {
  return fordelEtterVekt(faktiskeTimer, linjer, (l) => l.estimertTimer).map(({ linje, andel }) => ({
    operasjonId: linje.operasjonId,
    antall: linje.antall,
    estimertTimer: linje.estimertTimer,
    faktiskTimer: andel,
  }))
}

/**
 * Fordeler den faktiske materialkostnaden ut på linjene.
 *
 * Vekten er den ESTIMERTE materialkostnaden, ikke timene: maling og parkett
 * koster ikke i forhold til hvor lenge man holder på med dem. Fordeles
 * materialer etter tid, ville en operasjon som er arbeidsintensiv og
 * materialfattig fått skylda for materialer den aldri brukte.
 */
export function fordelMaterial(
  faktiskMaterialKr: number,
  linjer: EtterkalkyleLinje[]
): { operasjonId: string; antall: number; estimertMaterialKr: number; faktiskMaterialKr: number }[] {
  return fordelEtterVekt(faktiskMaterialKr, linjer, (l) => l.estimertMaterialKr ?? 0).map(
    ({ linje, andel }) => ({
      operasjonId: linje.operasjonId,
      antall: linje.antall,
      estimertMaterialKr: linje.estimertMaterialKr ?? 0,
      faktiskMaterialKr: andel,
    })
  )
}

/**
 * Plukker ut det etterkalkylen trenger fra et lagret tilbud.
 *
 * Tilbud laget før linjemodellen (august 2026) har ingen `linjer`. De kan
 * fortsatt få registrert timer — avviket mot `tidsbrukTimer` er like ekte —
 * men de kan ikke lære opp en sats, for vi vet ikke hvilken operasjon timene
 * hørte til. Derfor tom liste og ikke et kast.
 */
// Tar bare det den leser: et objekt med linjer. Da godtar den bade et lagret
// TilbudResult og en fersk BeregnetSum, og den rene regnefila slipper en
// typeavhengighet til lib/ai.
export function linjerFraResultat(resultat: { linjer?: BeregnetLinje[] }): EtterkalkyleLinje[] {
  const linjer: BeregnetLinje[] = resultat.linjer ?? []
  return linjer
    .filter(
      (l) =>
        Number.isFinite(l.antall) &&
        l.antall > 0 &&
        // Timer ELLER material. Kravet om timer > 0 var riktig da
        // oeyeblikksbildet bare tjente timefordelingen. Naa mater det ogsaa
        // materialfordelingen, og en linje uten timer er fullt gyldig der:
        // brukeren kan ha satt timesatsen til 0 og bare ta betalt for
        // materialet. Falt linja ut, ble materialet dens fordelt paa de
        // andre linjene i stedet — og operasjonen som faktisk brukte
        // materialet laerte ingenting.
        ((Number.isFinite(l.timer) && l.timer > 0) ||
          (Number.isFinite(l.materialKr) && l.materialKr > 0))
    )
    .map((l) => ({
      operasjonId: l.operasjonId,
      antall: l.antall,
      estimertTimer: l.timer,
      estimertMaterialKr: l.materialKr,
    }))
}

export interface Erfaring {
  operasjonId: string
  operasjon: Operasjon
  fagNavn: string
  /** Antall registrerte jobber som inneholder denne operasjonen. */
  jobber: number
  /** Hvor mange av dem som hadde bare denne ene operasjonen — det rene signalet. */
  reneJobber: number
  sumAntall: number
  sumFaktiskTimer: number
  /** Det jobbene faktisk sier: timer per enhet. */
  observertTimerPerEnhet: number
  /** Satsen som gjelder i dag — standarden, eller brukerens egen. */
  gjeldendeTimerPerEnhet: number
  avvikProsent: number
  /**
   * Materialsiden. Undefined når ingen av registreringene har ført faktisk
   * materialkostnad — feltet er valgfritt i skjemaet, og et forslag bygget på
   * ingenting er verre enn ingen forslag.
   */
  material?: {
    jobber: number
    sumAntall: number
    sumFaktiskKr: number
    observertPerEnhet: number
    gjeldendePerEnhet: number
    avvikProsent: number
  }
}

/**
 * Samler alle registreringer til én rad per operasjon.
 *
 * Estimatoren er sum(timer) / sum(antall), ikke gjennomsnittet av jobbenes
 * satser. Det vekter etter størrelse: en jobb på 200 m² sier mer om
 * produktiviteten enn en på 5 m², og et snitt av snitt ville latt den lille
 * jobben telle like tungt.
 */
export function samleErfaring(registreringer: Etterkalkyle[], satser?: Prissatser): Erfaring[] {
  const samlet = new Map<string, { jobber: number; reneJobber: number; antall: number; timer: number }>()
  // Egen samling for materialer: feltet er valgfritt i skjemaet, så en
  // operasjon kan ha fem jobber med timer og bare to med materialkostnad.
  // Blandes de, ville materialsatsen blitt regnet av enheter ingen har ført
  // kostnad for — altså delt kronene på for mange kvadratmeter.
  const materialer = new Map<string, { jobber: number; antall: number; kr: number }>()

  for (const reg of registreringer) {
    const fordelt = fordelTimer(reg.faktiskeTimer, reg.linjer)

    // Linjer med samme operasjon slaas sammen FOER opptellingen. Et tilbud
    // kan godt ha flere av dem - «+ Legg til linje» gir samme operasjon som
    // standard, og tre rom med samme veggmaling er helt vanlig utfylling.
    // Telte vi per linje, ville EN slik jobb alene passert terskelen paa tre
    // jobber, og hele vernet mot aa justere satsen paa tilfeldigheter falt bort.
    const perOperasjon = new Map<string, { antall: number; timer: number }>()
    for (const linje of fordelt) {
      const f = perOperasjon.get(linje.operasjonId) ?? { antall: 0, timer: 0 }
      perOperasjon.set(linje.operasjonId, {
        antall: f.antall + linje.antall,
        timer: f.timer + linje.faktiskTimer,
      })
    }

    // Rent signal = alle timene i jobben gikk til EN operasjon, uansett hvor
    // mange linjer de ble foert paa.
    const eneste = perOperasjon.size === 1

    for (const [operasjonId, linje] of perOperasjon) {
      const forrige = samlet.get(operasjonId) ?? { jobber: 0, reneJobber: 0, antall: 0, timer: 0 }
      samlet.set(operasjonId, {
        jobber: forrige.jobber + 1,
        reneJobber: forrige.reneJobber + (eneste ? 1 : 0),
        antall: forrige.antall + linje.antall,
        timer: forrige.timer + linje.timer,
      })
    }

    // Materialene telles med samme sammenslåing per operasjon, og av samme
    // grunn: ellers ville tre veggmaling-linjer i én jobb passert terskelen
    // alene.
    if (reg.faktiskMaterialKr !== undefined && reg.faktiskMaterialKr > 0) {
      const perOperasjonKr = new Map<string, { antall: number; kr: number }>()
      for (const linje of fordelMaterial(reg.faktiskMaterialKr, reg.linjer)) {
        const f = perOperasjonKr.get(linje.operasjonId) ?? { antall: 0, kr: 0 }
        perOperasjonKr.set(linje.operasjonId, {
          antall: f.antall + linje.antall,
          kr: f.kr + linje.faktiskMaterialKr,
        })
      }

      for (const [operasjonId, linje] of perOperasjonKr) {
        const forrige = materialer.get(operasjonId) ?? { jobber: 0, antall: 0, kr: 0 }
        materialer.set(operasjonId, {
          jobber: forrige.jobber + 1,
          antall: forrige.antall + linje.antall,
          kr: forrige.kr + linje.kr,
        })
      }
    }
  }

  const erfaringer: Erfaring[] = []
  // Union av begge samlingene. Timesiden kan mangle helt: setter brukeren
  // timesatsen til 0 og tar bare betalt for materialet, faller linja ut av
  // timefordelingen — men den har fortsatt en materialkostnad aa laere av.
  // Ble oversikten bygget av timene alene, forsvant den operasjonen i
  // stillhet, med hele materialet sitt.
  const alleOperasjoner = new Set<string>([...samlet.keys(), ...materialer.keys()])
  for (const operasjonId of alleOperasjoner) {
    const treff = finnOperasjon(operasjonId)
    // En operasjon som er fjernet fra lib/priser.ts siden registreringen ble
    // gjort har ingen sats å foreslå noe for. Da hopper vi over den i stedet
    // for å krasje hele oversikten.
    if (!treff) continue

    const tall = samlet.get(operasjonId) ?? { jobber: 0, reneJobber: 0, antall: 0, timer: 0 }
    const harTimer = tall.antall > 0
    if (!harTimer && !materialer.has(operasjonId)) continue

    const sats = gjeldendeSats(treff.operasjon, satser)
    const gjeldende = sats.timerPerEnhet
    const observert = harTimer ? tall.timer / tall.antall : 0

    const mat = materialer.get(operasjonId)
    const observertMaterial = mat && mat.antall > 0 ? mat.kr / mat.antall : null

    erfaringer.push({
      operasjonId,
      operasjon: treff.operasjon,
      fagNavn: treff.fagNavn,
      jobber: tall.jobber,
      reneJobber: tall.reneJobber,
      sumAntall: rundTre(tall.antall),
      sumFaktiskTimer: rundTre(tall.timer),
      observertTimerPerEnhet: rundTre(observert),
      gjeldendeTimerPerEnhet: gjeldende,
      avvikProsent:
        gjeldende > 0 && harTimer ? Math.round(((observert - gjeldende) / gjeldende) * 100) : 0,
      material:
        mat && observertMaterial !== null
          ? {
              jobber: mat.jobber,
              sumAntall: rundTre(mat.antall),
              sumFaktiskKr: Math.round(mat.kr),
              observertPerEnhet: Math.round(observertMaterial),
              gjeldendePerEnhet: sats.materialPerEnhet,
              avvikProsent:
                sats.materialPerEnhet > 0
                  ? Math.round(((observertMaterial - sats.materialPerEnhet) / sats.materialPerEnhet) * 100)
                  : 0,
            }
          : undefined,
    })
  }

  return erfaringer.sort((a, b) => Math.abs(b.avvikProsent) - Math.abs(a.avvikProsent))
}

/** Færre enn dette er tilfeldigheter, ikke et mønster. */
export const MIN_JOBBER_FOR_FORSLAG = 3
/** Under dette er avviket mindre enn støyen i hvordan folk fører timer. */
export const MIN_AVVIK_PROSENT = 10

/**
 * Skal vi foreslå en ny sats for denne operasjonen?
 *
 * To terskler, og begge er der for å unngå det samme: at appen maser om å
 * justere satsen etter én jobb som gikk litt tregt. Et forslag som viser seg å
 * være støy én gang, blir ignorert for alltid.
 */
export function harForslag(erfaring: Erfaring): boolean {
  return (
    erfaring.jobber >= MIN_JOBBER_FOR_FORSLAG &&
    Math.abs(erfaring.avvikProsent) >= MIN_AVVIK_PROSENT &&
    erfaring.observertTimerPerEnhet > 0
  )
}

/**
 * Skal vi foreslå en ny materialsats?
 *
 * Samme terskler som for tid, men talt på materialjobbene alene: feltet er
 * valgfritt, så en operasjon kan ha fem jobber med timer og to med kostnad.
 */
export function harMaterialforslag(erfaring: Erfaring): boolean {
  const m = erfaring.material
  return (
    m !== undefined &&
    m.jobber >= MIN_JOBBER_FOR_FORSLAG &&
    Math.abs(m.avvikProsent) >= MIN_AVVIK_PROSENT &&
    m.observertPerEnhet > 0
  )
}

// Satsene i prisboka har to til tre desimaler (0,15 og 0,025). Flere desimaler
// enn det er en presisjon tallet ikke har dekning for.
function rundTre(n: number): number {
  return Math.round(n * 1000) / 1000
}

// ---------------------------------------------------------------------------
// Treffsikkerhet over tid — «traff du bedre i august enn i juni?»
// ---------------------------------------------------------------------------

/**
 * Én registrert jobb, redusert til det utviklingen trenger.
 *
 * `dato` er når ESTIMATET ble laget, ikke når timene ble ført. Spørsmålet
 * handler om estimatene, og et tilbud skrevet i juni som først fikk timene
 * sine ført i august er fortsatt et juni-estimat. Bøttet vi på
 * registreringsdatoen, ville en opprydding der fem gamle jobber føres samme
 * kveld sett ut som én forferdelig måned — og alle månedene de faktisk hørte
 * til stått tomme.
 */
export interface TreffPunkt {
  dato: string
  estimerteTimer: number
  faktiskeTimer: number
}

export interface TreffMaaned {
  /** 'YYYY-MM'. */
  maaned: string
  jobber: number
  sumEstimerteTimer: number
  sumFaktiskeTimer: number
  /**
   * Typisk bom: medianen av |avvik| for jobbene i måneden.
   *
   * Median og ikke snitt, fordi én jobb som gikk fullstendig galt (+400 %)
   * ellers ville svelget en måned med fem gode estimater. Da måler tallet
   * uhellet, ikke treffsikkerheten.
   */
  typiskBom: number
  /**
   * Snittavviket MED fortegn. Står det positivt måned etter måned,
   * underestimerer du systematisk — en annen beskjed enn «du bommer», og en
   * handlingsbar en: satsene skal opp.
   *
   * Prosent er asymmetrisk (dobbelt så lang tid er +100 %, halvparten er
   * −50 %), så tallet lener naturlig positivt. Det er likevel `avvikProsent`
   * som brukes, den samme som står på hver enkelt jobb i historikken. To ulike
   * mål på samme bom ville vært verre enn ett skjevt: brukeren ville sett to
   * tall om samme jobb som ikke stemte overens.
   */
  snittAvvik: number
}

interface Maanedsbotte {
  avvik: number[]
  estimert: number
  faktisk: number
}

function grupperPerMaaned(punkter: TreffPunkt[]): Map<string, Maanedsbotte> {
  const grupper = new Map<string, Maanedsbotte>()

  for (const punkt of punkter) {
    // Jobber uten et brukbart estimat (gamle tilbud der timetallet er 0) faller
    // ut. De har ingen bom å måle — ikke en bom på null.
    const avvik = avvikProsent(punkt.faktiskeTimer, punkt.estimerteTimer)
    if (avvik === null) continue

    const nokkel = maanedNokkel(punkt.dato)
    if (nokkel === null) continue

    const botte = grupper.get(nokkel) ?? { avvik: [], estimert: 0, faktisk: 0 }
    botte.avvik.push(avvik)
    botte.estimert += punkt.estimerteTimer
    botte.faktisk += punkt.faktiskeTimer
    grupper.set(nokkel, botte)
  }

  return grupper
}

/** Én rad per måned det finnes førte timer for, eldste først. */
export function treffPerMaaned(punkter: TreffPunkt[]): TreffMaaned[] {
  return [...grupperPerMaaned(punkter).entries()]
    .map(([maaned, botte]) => ({
      maaned,
      jobber: botte.avvik.length,
      sumEstimerteTimer: rundTre(botte.estimert),
      sumFaktiskeTimer: rundTre(botte.faktisk),
      typiskBom: median(botte.avvik.map((a) => Math.abs(a))),
      snittAvvik: Math.round(botte.avvik.reduce((sum, a) => sum + a, 0) / botte.avvik.length),
    }))
    .sort((a, b) => a.maaned.localeCompare(b.maaned))
}

export interface TreffUtvikling {
  nyereBom: number
  eldreBom: number
  /** Positivt = bommen har krympet. */
  forbedring: number
  nyereJobber: number
  eldreJobber: number
  nyereMaaneder: string[]
  eldreMaaneder: string[]
}

/**
 * Under dette er «du har blitt bedre» en påstand tallene ikke bærer.
 *
 * Målt i PROSENTPOENG av den typiske bommen, ikke i prosent: går bommen fra
 * 30 % til 24 %, er forbedringen 6 poeng. Lavere enn `MIN_AVVIK_PROSENT`,
 * fordi dette er en median over flere jobber og ikke ett enkelt avvik — den
 * tåler en mindre bevegelse før den betyr noe.
 */
export const MIN_FORBEDRING_PROSENTPOENG = 5

/** Så mange måneder regnes som «nå», når det finnes nok historikk bak dem. */
export const NYERE_VINDU_MAANEDER = 3

/**
 * Hvor mange måneder som utgjør «nå» i sammenligningen.
 *
 * Aldri mer enn halvparten av det som finnes: et fast vindu på tre måneder
 * ville krevd fire måneders historikk før appen turte å si noe som helst, og
 * appen er yngre enn det. Med to måneder blir det én mot én, med fire blir det
 * to mot to, og med et år blir det de tre siste mot de ni før dem — som er
 * riktig, for da er «nå» faktisk nå og ikke et halvår tilbake.
 */
function nyereVindu(antallMaaneder: number): number {
  return Math.min(NYERE_VINDU_MAANEDER, Math.floor(antallMaaneder / 2))
}

/**
 * Sammenligner de siste månedene med alle de foregående.
 *
 * Månedene telles som MÅNEDER MED JOBBER, ikke kalendermåneder. En håndverker
 * som ikke fører timer i juli skal ikke miste sammenligningen sin av den grunn.
 *
 * Jobbterskelen er den samme som for satsforslag, og av samme grunn: under tre
 * jobber på hver side er forskjellen tilfeldigheter. En app som sier «du har
 * blitt bedre» på grunnlag av to jobber lærer brukeren å ikke tro på den —
 * og da er også de forslagene som faktisk holder, tapt.
 *
 * Medianene regnes over JOBBENE i hver gruppe, ikke som et snitt av månedenes
 * medianer. En median av medianer ville latt en måned med én jobb telle like
 * tungt som en måned med ti.
 */
export function treffUtvikling(punkter: TreffPunkt[], vindu?: number): TreffUtvikling | null {
  const grupper = grupperPerMaaned(punkter)
  const maaneder = [...grupper.keys()].sort()
  if (maaneder.length < 2) return null

  const bredde = vindu ?? nyereVindu(maaneder.length)
  if (bredde < 1) return null

  const nyereMaaneder = maaneder.slice(-bredde)
  const eldreMaaneder = maaneder.slice(0, -bredde)
  if (eldreMaaneder.length === 0) return null

  const nyere = nyereMaaneder.flatMap((m) => grupper.get(m)?.avvik ?? [])
  const eldre = eldreMaaneder.flatMap((m) => grupper.get(m)?.avvik ?? [])
  if (nyere.length < MIN_JOBBER_FOR_FORSLAG || eldre.length < MIN_JOBBER_FOR_FORSLAG) return null

  const nyereBom = median(nyere.map((a) => Math.abs(a)))
  const eldreBom = median(eldre.map((a) => Math.abs(a)))

  return {
    nyereBom,
    eldreBom,
    forbedring: eldreBom - nyereBom,
    nyereJobber: nyere.length,
    eldreJobber: eldre.length,
    nyereMaaneder,
    eldreMaaneder,
  }
}

function median(tall: number[]): number {
  if (tall.length === 0) return 0
  const sortert = [...tall].sort((a, b) => a - b)
  const midt = Math.floor(sortert.length / 2)
  return sortert.length % 2 === 1
    ? sortert[midt]
    : Math.round((sortert[midt - 1] + sortert[midt]) / 2)
}
