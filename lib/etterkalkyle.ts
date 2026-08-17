// Etterkalkyle — hva jobben faktisk tok, målt mot hva vi trodde.
//
// Prisboka i lib/priser.ts og brukerens egne satser i `prissatser` er begge
// ANSLAG. Uten en tilbakemelding fra virkeligheten kan en håndverker ligge
// 30 % feil på hver eneste jobb i et år uten at noe fanger det opp.
//
// Denne fila er ren regning, uten database og uten React, slik at både
// serveren, skjemaet i nettleseren og testene bruker nøyaktig samme tall.

import { Operasjon, Prissatser, finnOperasjon, gjeldendeSats } from '@/lib/priser'

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
export function fordelTimer(
  faktiskeTimer: number,
  linjer: EtterkalkyleLinje[]
): { operasjonId: string; antall: number; estimertTimer: number; faktiskTimer: number }[] {
  const estimert = sumEstimerteTimer(linjer)
  if (!Number.isFinite(faktiskeTimer) || faktiskeTimer <= 0 || estimert <= 0) return []

  return linjer
    .filter((l) => Number.isFinite(l.antall) && l.antall > 0 && l.estimertTimer > 0)
    .map((l) => ({
      operasjonId: l.operasjonId,
      antall: l.antall,
      estimertTimer: l.estimertTimer,
      faktiskTimer: (l.estimertTimer / estimert) * faktiskeTimer,
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

  for (const reg of registreringer) {
    const fordelt = fordelTimer(reg.faktiskeTimer, reg.linjer)
    const eneste = fordelt.length === 1

    for (const linje of fordelt) {
      const forrige = samlet.get(linje.operasjonId) ?? { jobber: 0, reneJobber: 0, antall: 0, timer: 0 }
      samlet.set(linje.operasjonId, {
        jobber: forrige.jobber + 1,
        reneJobber: forrige.reneJobber + (eneste ? 1 : 0),
        antall: forrige.antall + linje.antall,
        timer: forrige.timer + linje.faktiskTimer,
      })
    }
  }

  const erfaringer: Erfaring[] = []
  for (const [operasjonId, tall] of samlet) {
    const treff = finnOperasjon(operasjonId)
    // En operasjon som er fjernet fra lib/priser.ts siden registreringen ble
    // gjort har ingen sats å foreslå noe for. Da hopper vi over den i stedet
    // for å krasje hele oversikten.
    if (!treff || tall.antall <= 0) continue

    const gjeldende = gjeldendeSats(treff.operasjon, satser).timerPerEnhet
    const observert = tall.timer / tall.antall

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
      avvikProsent: gjeldende > 0 ? Math.round(((observert - gjeldende) / gjeldende) * 100) : 0,
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

// Satsene i prisboka har to til tre desimaler (0,15 og 0,025). Flere desimaler
// enn det er en presisjon tallet ikke har dekning for.
function rundTre(n: number): number {
  return Math.round(n * 1000) / 1000
}
