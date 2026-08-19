// Prisbibliotek — kalibrert mot norske markedspriser august 2026.
//
// MODELLEN: et tilbud består av LINJER, ikke ett tall. En malerjobb kan være
// «45 m² vegg + 12 m² tak», eller bare tak. Hver operasjon har sin egen enhet:
// maler regner per m² veggflate, gulvlegger per m² gulv, elektriker per punkt,
// rørlegger som fastpris per jobb. Ett felles «romstørrelse»-felt kan ikke bære
// det, og det var hovedgrunnen til at tallene bommet med 2–4x.
//
// Det som er kalibrert er TIMER PER ENHET — altså produktivitet. Den er stabil
// på tvers av landet. Prisen kommer av håndverkerens egen timepris og margin,
// slik at tallet blir deres eget og ikke en gjennomsnittspris fra nettet.
//
// `markedLav`/`markedHoy` er ferdig pris per enhet i markedet (inkl. materialer
// og håndverkerens margin). De brukes IKKE i utregningen — kun til å varsle når
// resultatet havner utenfor det kunden kan finne andre steder.
//
// `kilde: 'marked'` = tallet er forankret i innhentede prisguider (se docs/priser.md).
// `kilde: 'anslag'` = ikke funnet markedstall; må kalibreres av en fagperson.

export type Enhet = 'm2_vegg' | 'm2_tak' | 'm2_gulv' | 'm2_flate' | 'punkt' | 'stk' | 'lopemeter' | 'time'

export const ENHETSTEKST: Record<Enhet, string> = {
  m2_vegg: 'm² veggflate',
  m2_tak: 'm² takflate',
  m2_gulv: 'm² gulv',
  m2_flate: 'm² flate',
  punkt: 'punkt',
  stk: 'stk',
  lopemeter: 'løpemeter',
  time: 'timer',
}

export interface Operasjon {
  id: string
  navn: string
  enhet: Enhet
  /** Timer per enhet — produktivitetsnormen. Dette er tallet som kalibreres. */
  timerPerEnhet: number
  /** Materialkostnad per enhet i kroner. Kan overstyres per linje. */
  materialPerEnhet: number
  /** Ferdig markedspris per enhet, inkl. materialer og margin. Kun til kontroll. */
  markedLav?: number
  markedHoy?: number
  kilde: 'marked' | 'anslag'
  hjelpetekst?: string
}

export interface Fag {
  navn: string
  marginProsent: number
  operasjoner: Operasjon[]
}

export const FAG: Record<string, Fag> = {
  Maler: {
    navn: 'Maler',
    marginProsent: 25,
    operasjoner: [
      {
        id: 'maler_vegg',
        navn: 'Male vegger, 2 strøk',
        enhet: 'm2_vegg',
        timerPerEnhet: 0.15,
        materialPerEnhet: 40,
        markedLav: 140,
        markedHoy: 280,
        kilde: 'marked',
        hjelpetekst: 'Veggflate, ikke gulvflate. Rom på 20 m² gulv har typisk 45–55 m² vegg.',
      },
      {
        id: 'maler_tak',
        navn: 'Male tak, 2 strøk',
        enhet: 'm2_tak',
        timerPerEnhet: 0.25,
        materialPerEnhet: 45,
        markedLav: 250,
        markedHoy: 400,
        kilde: 'marked',
        hjelpetekst: 'Tak er dyrere per m² enn vegg — mer krevende arbeidsstilling.',
      },
      {
        id: 'maler_sparkling',
        navn: 'Sparkling og grunning',
        enhet: 'm2_flate',
        timerPerEnhet: 0.12,
        materialPerEnhet: 25,
        kilde: 'anslag',
        hjelpetekst: 'Legges til der underlaget krever det. Ikke markedsverifisert sats.',
      },
    ],
  },

  Snekker: {
    navn: 'Snekker',
    marginProsent: 28,
    operasjoner: [
      {
        id: 'snekker_parkett',
        navn: 'Legge parkett/laminat (klikk)',
        enhet: 'm2_gulv',
        timerPerEnhet: 0.25,
        materialPerEnhet: 400,
        markedLav: 400,
        markedHoy: 900,
        kilde: 'marked',
      },
      {
        id: 'snekker_massivtre',
        navn: 'Legge massivt tregulv (limt)',
        enhet: 'm2_gulv',
        timerPerEnhet: 0.5,
        materialPerEnhet: 700,
        markedLav: 800,
        markedHoy: 1500,
        kilde: 'marked',
      },
      {
        id: 'snekker_vinyl',
        navn: 'Legge vinyl/LVT',
        enhet: 'm2_gulv',
        timerPerEnhet: 0.15,
        materialPerEnhet: 250,
        markedLav: 250,
        markedHoy: 900,
        kilde: 'marked',
      },
      {
        id: 'snekker_lister',
        navn: 'Montere lister',
        enhet: 'lopemeter',
        timerPerEnhet: 0.1,
        materialPerEnhet: 60,
        kilde: 'anslag',
      },
    ],
  },

  Murer: {
    navn: 'Murer / flislegger',
    marginProsent: 27,
    operasjoner: [
      {
        id: 'murer_flis',
        navn: 'Flislegging gulv eller vegg',
        enhet: 'm2_flate',
        timerPerEnhet: 0.85,
        materialPerEnhet: 450,
        markedLav: 900,
        markedHoy: 1600,
        kilde: 'marked',
      },
      {
        id: 'murer_membran',
        navn: 'Membran på våtrom',
        enhet: 'm2_flate',
        timerPerEnhet: 0.3,
        materialPerEnhet: 150,
        kilde: 'anslag',
      },
    ],
  },

  Elektriker: {
    navn: 'Elektriker',
    marginProsent: 30,
    operasjoner: [
      {
        id: 'el_punkt',
        navn: 'Nytt elektrisk punkt',
        enhet: 'punkt',
        timerPerEnhet: 1,
        materialPerEnhet: 350,
        markedLav: 1200,
        markedHoy: 2000,
        kilde: 'marked',
        hjelpetekst: 'Bransjen priser per punkt, ikke per m². Ett punkt = ett uttak, bryter eller lampepunkt.',
      },
      {
        id: 'el_sikringsskap',
        navn: 'Bytte sikringsskap',
        enhet: 'stk',
        timerPerEnhet: 8,
        materialPerEnhet: 8000,
        markedLav: 15000,
        markedHoy: 25000,
        kilde: 'marked',
      },
    ],
  },

  Rørlegger: {
    navn: 'Rørlegger',
    marginProsent: 30,
    operasjoner: [
      {
        id: 'ror_bad',
        navn: 'Komplett bad — rørleggerdelen',
        enhet: 'stk',
        timerPerEnhet: 45,
        materialPerEnhet: 35000,
        markedLav: 65000,
        markedHoy: 125000,
        kilde: 'marked',
        hjelpetekst: 'Rørleggerdelen av et standard bad på 5–7 m². Antall = antall bad.',
      },
      {
        id: 'ror_wc',
        navn: 'Bytte toalett',
        enhet: 'stk',
        timerPerEnhet: 2,
        materialPerEnhet: 4000,
        kilde: 'anslag',
      },
      {
        id: 'ror_servant',
        navn: 'Bytte servant eller kran',
        enhet: 'stk',
        timerPerEnhet: 1.5,
        materialPerEnhet: 2500,
        kilde: 'anslag',
      },
    ],
  },

  Bilpleie: {
    navn: 'Bilpleie',
    marginProsent: 35,
    operasjoner: [
      {
        id: 'bil_polering',
        navn: 'Polering og lakkforsegling',
        enhet: 'stk',
        timerPerEnhet: 6,
        materialPerEnhet: 1200,
        kilde: 'anslag',
        hjelpetekst: 'Antall = antall biler. Bilpleie måles ikke i m².',
      },
      {
        id: 'bil_innvendig',
        navn: 'Innvendig rens',
        enhet: 'stk',
        timerPerEnhet: 3,
        materialPerEnhet: 400,
        kilde: 'anslag',
      },
    ],
  },

  Annet: {
    navn: 'Annet',
    marginProsent: 25,
    operasjoner: [
      {
        id: 'annet_timer',
        navn: 'Timearbeid',
        enhet: 'time',
        timerPerEnhet: 1,
        materialPerEnhet: 0,
        kilde: 'anslag',
        hjelpetekst: 'Du oppgir timene selv. Materialer legges inn per linje.',
      },
    ],
  },
}

export const FAGNAVN = Object.keys(FAG)

export function hentFag(jobbType: string): Fag {
  return FAG[jobbType] ?? FAG.Annet
}

export function hentOperasjon(jobbType: string, operasjonId: string): Operasjon | undefined {
  return hentFag(jobbType).operasjoner.find((o) => o.id === operasjonId)
}

const OPERASJON_ETTER_ID = new Map<string, { fagNavn: string; operasjon: Operasjon }>(
  Object.entries(FAG).flatMap(([fagNavn, fag]) =>
    fag.operasjoner.map((operasjon) => [operasjon.id, { fagNavn, operasjon }] as const)
  )
)

/**
 * Slår opp en operasjon uten å vite faget. Etterkalkylen samler erfaring på
 * tvers av jobber, og der er operasjons-id-en det eneste som følger med — faget
 * ligger på tilbudet, ikke på linja.
 */
export function finnOperasjon(operasjonId: string): { fagNavn: string; operasjon: Operasjon } | undefined {
  return OPERASJON_ETTER_ID.get(operasjonId)
}

/**
 * Én linje slik brukeren fyller den ut.
 *
 * `timerPerEnhet` og `materialPerEnhet` er øyeblikksbilder av satsene som gjaldt
 * da tilbudet ble laget. De lagres MED tilbudet, ikke bare som en peker til
 * dagens satser — endrer håndverkeren satsen sin i morgen, skal et tilbud sendt
 * i dag fortsatt kunne regnes etter og vise samme sum.
 */
export interface TilbudLinjeInput {
  operasjonId: string
  antall: number
  timerPerEnhet?: number
  materialPerEnhet?: number
}

/** Brukerens egne satser, hentet fra `prissatser`-tabellen. Kun det som er endret. */
export type Prissatser = Record<string, { timerPerEnhet?: number; materialPerEnhet?: number }>

/** Satsene som faktisk gjelder for en operasjon: standard, overstyrt av brukerens egne. */
export function gjeldendeSats(op: Operasjon, satser?: Prissatser) {
  const egen = satser?.[op.id]
  return {
    timerPerEnhet: egen?.timerPerEnhet ?? op.timerPerEnhet,
    materialPerEnhet: egen?.materialPerEnhet ?? op.materialPerEnhet,
    erEndret: egen?.timerPerEnhet !== undefined || egen?.materialPerEnhet !== undefined,
  }
}

/** Én ferdig utregnet linje — alle mellomregninger er med, slik at tallet kan ettergås. */
export interface BeregnetLinje {
  operasjonId: string
  navn: string
  enhet: Enhet
  enhetstekst: string
  antall: number
  timerPerEnhet: number
  timer: number
  arbeidKr: number
  materialPerEnhet: number
  materialKr: number
  kostKr: number
  prisKr: number
  prisPerEnhet: number
  /** Satt når prisen havner utenfor markedsbåndet, eller når satsen ikke er verifisert. */
  advarsel?: string
}

function rund(n: number): number {
  return Math.round(n * 100) / 100
}

export function beregnLinje(
  jobbType: string,
  linje: TilbudLinjeInput,
  timepris: number,
  marginProsent: number
): BeregnetLinje | null {
  const op = hentOperasjon(jobbType, linje.operasjonId)
  // `antall > 0` er sant også for Infinity, som ga pris = Infinity og
  // prisPerEnhet = NaN (Infinity delt på Infinity). Krev et endelig tall.
  if (!op || !Number.isFinite(linje.antall) || linje.antall <= 0) return null

  // Margin 100 % ga divisjon på null -> pris = Infinity, og over 100 % ga negativ
  // pris. API-et avviser slike verdier, men forhåndsvisningen i skjemaet regnet
  // videre og viste «Sum: kr Infinity». Stopper det ved kilden i stedet.
  if (!Number.isFinite(marginProsent) || marginProsent < 0 || marginProsent >= 100) return null
  if (!Number.isFinite(timepris) || timepris <= 0) return null

  // Begge satsene kommer fra klienten som øyeblikksbilde lagret med tilbudet, og
  // begge må vaktes likt. `timerPerEnhet` var vaktet, `materialPerEnhet` ikke:
  // en negativ materialsats ga et negativt tilbud som `verifiserPris` godtok,
  // fordi serveren regnet ut samme negative tall som klienten sendte inn.
  const materialPerEnhet = linje.materialPerEnhet ?? op.materialPerEnhet
  const timerPerEnhet = linje.timerPerEnhet ?? op.timerPerEnhet
  if (!Number.isFinite(timerPerEnhet) || timerPerEnhet < 0) return null
  if (!Number.isFinite(materialPerEnhet) || materialPerEnhet < 0) return null
  const timer = rund(linje.antall * timerPerEnhet)
  const arbeidKr = Math.round(timer * timepris)
  const materialKr = Math.round(linje.antall * materialPerEnhet)
  const kostKr = arbeidKr + materialKr
  const prisKr = Math.round(kostKr / (1 - marginProsent / 100))
  const prisPerEnhet = Math.round(prisKr / linje.antall)

  let advarsel: string | undefined
  if (op.markedLav && op.markedHoy) {
    if (prisPerEnhet > op.markedHoy) {
      advarsel = `${prisPerEnhet} kr per ${ENHETSTEKST[op.enhet]} ligger over markedet (${op.markedLav}–${op.markedHoy} kr). Kunden vil trolig finne det billigere.`
    } else if (prisPerEnhet < op.markedLav) {
      advarsel = `${prisPerEnhet} kr per ${ENHETSTEKST[op.enhet]} ligger under markedet (${op.markedLav}–${op.markedHoy} kr). Sjekk at du ikke taper penger.`
    }
  } else if (op.kilde === 'anslag') {
    advarsel = 'Satsen for denne operasjonen er et anslag, ikke et markedstall. Kontroller den mot din egen erfaring.'
  }

  return {
    operasjonId: op.id,
    navn: op.navn,
    enhet: op.enhet,
    enhetstekst: ENHETSTEKST[op.enhet],
    antall: linje.antall,
    timerPerEnhet,
    timer,
    arbeidKr,
    materialPerEnhet,
    materialKr,
    kostKr,
    prisKr,
    prisPerEnhet,
    advarsel,
  }
}

export interface BeregnetSum {
  linjer: BeregnetLinje[]
  timer: number
  arbeidKr: number
  materialKr: number
  kostKr: number
  marginProsent: number
  marginKr: number
  prisKr: number
}

export function beregnTilbud(
  jobbType: string,
  linjer: TilbudLinjeInput[],
  timepris: number,
  marginProsent?: number
): BeregnetSum {
  const margin = marginProsent ?? hentFag(jobbType).marginProsent
  const beregnede = linjer
    .map((l) => beregnLinje(jobbType, l, timepris, margin))
    .filter((l): l is BeregnetLinje => l !== null)

  const timer = rund(beregnede.reduce((s, l) => s + l.timer, 0))
  const arbeidKr = beregnede.reduce((s, l) => s + l.arbeidKr, 0)
  const materialKr = beregnede.reduce((s, l) => s + l.materialKr, 0)
  const kostKr = arbeidKr + materialKr
  const prisKr = beregnede.reduce((s, l) => s + l.prisKr, 0)

  return {
    linjer: beregnede,
    timer,
    arbeidKr,
    materialKr,
    kostKr,
    marginProsent: margin,
    marginKr: prisKr - kostKr,
    prisKr,
  }
}

/**
 * Kort oppsummering av omfanget, f.eks. «45 m² veggflate + 12 m² takflate».
 * Tar imot løse felter og ikke TilbudInput, slik at klientkomponenter kan bruke
 * den uten å dra hele lib/ai (og OpenAI-kallet) inn i nettleserbunten.
 * `romstorrelseM2` er fallback for tilbud lagret før linjemodellen.
 */
export function omfangTekst(jobbType: string, linjer?: TilbudLinjeInput[], romstorrelseM2?: number): string {
  if (linjer && linjer.length > 0) {
    return linjer
      .map((l) => {
        const op = hentOperasjon(jobbType, l.operasjonId)
        return op ? `${l.antall} ${ENHETSTEKST[op.enhet]}` : `${l.antall}`
      })
      .join(' + ')
  }
  return romstorrelseM2 ? `${romstorrelseM2} m²` : 'omfang ikke oppgitt'
}

/**
 * Dekningsgrad regnes av salgsprisen, ikke av kostnaden: 25 % margin er kostnad
 * ganget med 1,33 — ikke 1,25. Håndverkere sier ofte «påslag» og mener det siste.
 * Brukes til å vise begge tall i skjemaet, slik at ingen blir overrasket.
 */
export function marginSomPaaslag(marginProsent: number): number {
  return Math.round((1 / (1 - marginProsent / 100) - 1) * 1000) / 10
}
