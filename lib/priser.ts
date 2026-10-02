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

// Entallsformer for de enhetene der ENHETSTEKST er flertall. «3 timer» er
// riktig, men «1 067 kr per timer» er det ikke. De ovrige enhetene leses likt
// begge veier («per m² gulv», «3 m² gulv»), og star derfor ikke her.
const ENHETSTEKST_ENTALL: Partial<Record<Enhet, string>> = {
  time: 'time',
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
  /**
   * Hva EN enhet heter for mennesker. Enheten `stk` gjør fire uforenlige
   * jobber — én bil, ett bad, ett sikringsskap, ett toalett — og ordet følger
   * med helt ut i tilbudet kunden leser. «Polering — 3 stk» er ikke et tilbud
   * en bilpleier sender. Står feltene tomme, brukes ENHETSTEKST som før.
   */
  enhetEntall?: string
  enhetFlertall?: string
  /**
   * Overskrift i nedtrekkslista. Fagene har vokst — bilpleie har tre
   * bilstørrelser å velge mellom, maleren har både flater og stykkarbeid — og
   * en flat liste på elleve punkter er noe man leter i, ikke velger fra.
   * Uten gruppe havner operasjonen i en gruppe som heter fagets eget navn.
   */
  gruppe?: string
}

/**
 * En ferdig utfylt jobb, klar til å legges inn med ett klikk.
 *
 * Grunnen er målt friksjon: den vanligste malerjobben er «vegger og tak i ett
 * rom», og den krevde å velge operasjon, fylle antall, trykke «Legg til linje»,
 * velge operasjon igjen, fylle antall igjen. Fem handlinger for noe som gjøres
 * hver uke. `antall` settes bare der det faktisk er fast — en bil er én bil,
 * mens veggflaten i et rom er forskjellig hver gang.
 */
export interface Jobbmal {
  id: string
  navn: string
  beskrivelse?: string
  linjer: { operasjonId: string; antall?: number }[]
}

/** «... kr per X» — entall. */
export function enhetEntallFor(op: Operasjon): string {
  return op.enhetEntall ?? ENHETSTEKST_ENTALL[op.enhet] ?? ENHETSTEKST[op.enhet]
}

/** «3 X» og «Antall (X)» — flertall. Faller tilbake pa entall der de er like. */
export function enhetFlertallFor(op: Operasjon): string {
  return op.enhetFlertall ?? op.enhetEntall ?? ENHETSTEKST[op.enhet]
}

export interface Fag {
  navn: string
  marginProsent: number
  operasjoner: Operasjon[]
  /** De vanligste jobbene i faget. Tom liste er gyldig. */
  jobbmaler?: Jobbmal[]
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
        gruppe: 'Flatearbeid',
        timerPerEnhet: 0.15,
        materialPerEnhet: 40,
        markedLav: 140,
        markedHoy: 280,
        kilde: 'marked',
        // Hjelpeteksten pekte tidligere paa en knapp som ikke finnes lenger
        // («Regn ut fra romstoerrelse» laa per linje foer maalene flyttet til
        // jobben). En hjelpetekst som viser til en kontroll brukeren ikke
        // finner, er verre enn ingen hjelpetekst.
        hjelpetekst:
          'Veggflate, ikke gulvflate — den regnes ut av rommålene over, etter fradrag for dører og vinduer.',
      },
      {
        id: 'maler_tak',
        navn: 'Male tak, 2 strøk',
        enhet: 'm2_tak',
        gruppe: 'Flatearbeid',
        timerPerEnhet: 0.25,
        materialPerEnhet: 45,
        markedLav: 250,
        markedHoy: 400,
        kilde: 'marked',
        hjelpetekst: 'Tak er dyrere per m² enn vegg — mer krevende arbeidsstilling.',
      },
      {
        id: 'maler_vegg_1strok',
        navn: 'Male vegger, 1 strøk (oppfriskning)',
        enhet: 'm2_vegg',
        gruppe: 'Flatearbeid',
        timerPerEnhet: 0.1,
        materialPerEnhet: 22,
        kilde: 'anslag',
        hjelpetekst:
          'Samme farge på nytt, uten sparkling. Satsen er avledet av 2-strøk-satsen og ikke markedsverifisert: ett strøk sparer selve påføringen, men ikke maskering og rigg — derfor to tredjedeler av tiden, ikke halvparten. Før timer på en slik jobb, så retter appen den for deg.',
      },
      {
        id: 'maler_sparkling',
        navn: 'Sparkling og grunning',
        enhet: 'm2_flate',
        gruppe: 'Flatearbeid',
        timerPerEnhet: 0.12,
        materialPerEnhet: 25,
        kilde: 'anslag',
        hjelpetekst: 'Legges til der underlaget krever det. Ikke markedsverifisert sats.',
      },
      {
        id: 'maler_listverk',
        navn: 'Male listverk og karmer',
        enhet: 'lopemeter',
        gruppe: 'Stykkarbeid',
        timerPerEnhet: 0.08,
        materialPerEnhet: 12,
        kilde: 'anslag',
        hjelpetekst:
          'Gulv- og taklister, dørkarmer. Måles i løpemeter — bruk «Regn ut fra romstørrelse» hvis du har rommålene.',
      },
      {
        id: 'maler_dor',
        navn: 'Male dør, begge sider',
        enhet: 'stk',
        gruppe: 'Stykkarbeid',
        enhetEntall: 'dør',
        enhetFlertall: 'dører',
        timerPerEnhet: 1.2,
        materialPerEnhet: 120,
        kilde: 'anslag',
        hjelpetekst: 'Inkludert karm. Ikke markedsverifisert sats.',
      },
      {
        id: 'maler_vindu',
        navn: 'Male vindu innvendig',
        enhet: 'stk',
        gruppe: 'Stykkarbeid',
        enhetEntall: 'vindu',
        enhetFlertall: 'vinduer',
        timerPerEnhet: 1,
        materialPerEnhet: 90,
        kilde: 'anslag',
        hjelpetekst: 'Karm og ramme. Ikke markedsverifisert sats.',
      },
    ],
    jobbmaler: [
      {
        id: 'maler_rom',
        navn: 'Ett rom — vegger og tak',
        beskrivelse: 'Den vanligste jobben. Fyll inn målene, så regnes flatene ut.',
        linjer: [{ operasjonId: 'maler_vegg' }, { operasjonId: 'maler_tak' }],
      },
      {
        id: 'maler_rom_full',
        navn: 'Ett rom — full oppussing',
        beskrivelse: 'Sparkling og grunning først, så vegger, tak og listverk.',
        linjer: [
          { operasjonId: 'maler_sparkling' },
          { operasjonId: 'maler_vegg' },
          { operasjonId: 'maler_tak' },
          { operasjonId: 'maler_listverk' },
        ],
      },
      {
        id: 'maler_oppfriskning',
        navn: 'Oppfriskning — ett strøk vegger',
        beskrivelse: 'Samme farge på nytt, uten sparkling.',
        linjer: [{ operasjonId: 'maler_vegg_1strok' }],
      },
      {
        id: 'maler_dorer_vinduer',
        navn: 'Kun dører og vinduer',
        linjer: [{ operasjonId: 'maler_dor' }, { operasjonId: 'maler_vindu' }],
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
        gruppe: 'Gulv',
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
        gruppe: 'Gulv',
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
        gruppe: 'Gulv',
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
        gruppe: 'Listverk',
        timerPerEnhet: 0.1,
        materialPerEnhet: 60,
        kilde: 'anslag',
      },
    ],
    jobbmaler: [
      {
        id: 'snekker_rom_parkett',
        navn: 'Ett rom - parkett med lister',
        beskrivelse: 'Den vanligste gulvjobben. Mål rommet, så regnes både areal og løpemeter ut.',
        linjer: [{ operasjonId: 'snekker_parkett' }, { operasjonId: 'snekker_lister' }],
      },
      {
        id: 'snekker_rom_vinyl',
        navn: 'Ett rom - vinyl med lister',
        linjer: [{ operasjonId: 'snekker_vinyl' }, { operasjonId: 'snekker_lister' }],
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
    jobbmaler: [
      {
        id: 'murer_vatrom',
        navn: 'Våtromsgulv - membran og flis',
        beskrivelse: 'Membran først, så flis på samme flate.',
        linjer: [{ operasjonId: 'murer_membran' }, { operasjonId: 'murer_flis' }],
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
        enhetEntall: 'sikringsskap',
        enhetFlertall: 'sikringsskap',
        timerPerEnhet: 8,
        materialPerEnhet: 8000,
        markedLav: 15000,
        markedHoy: 25000,
        kilde: 'marked',
      },
    ],
    jobbmaler: [
      {
        id: 'el_kjokken',
        navn: 'Nytt kjøkken - 8 punkter',
        beskrivelse: 'Typisk punktantall for et kjøkken. Juster tallet hvis jobben er større.',
        linjer: [{ operasjonId: 'el_punkt', antall: 8 }],
      },
      {
        id: 'el_skap_og_punkter',
        navn: 'Bytte sikringsskap',
        linjer: [{ operasjonId: 'el_sikringsskap', antall: 1 }],
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
        enhetEntall: 'bad',
        enhetFlertall: 'bad',
        timerPerEnhet: 45,
        materialPerEnhet: 35000,
        markedLav: 65000,
        markedHoy: 125000,
        kilde: 'marked',
        hjelpetekst: 'Rørleggerdelen av et standard bad på 5–7 m².',
      },
      {
        id: 'ror_wc',
        navn: 'Bytte toalett',
        enhet: 'stk',
        enhetEntall: 'toalett',
        enhetFlertall: 'toaletter',
        timerPerEnhet: 2,
        materialPerEnhet: 4000,
        kilde: 'anslag',
      },
      {
        id: 'ror_servant',
        navn: 'Bytte servant eller kran',
        enhet: 'stk',
        enhetEntall: 'servant eller kran',
        enhetFlertall: 'servanter og kraner',
        timerPerEnhet: 1.5,
        materialPerEnhet: 2500,
        kilde: 'anslag',
      },
    ],
    jobbmaler: [
      {
        id: 'ror_komplett_bad',
        navn: 'Komplett bad',
        beskrivelse: 'Rørleggerdelen av et standard bad.',
        linjer: [{ operasjonId: 'ror_bad', antall: 1 }],
      },
      {
        id: 'ror_smaajobb',
        navn: 'Bytte toalett og servant',
        linjer: [
          { operasjonId: 'ror_wc', antall: 1 },
          { operasjonId: 'ror_servant', antall: 1 },
        ],
      },
    ],
  },

  // Bilpleie lå her fram til 25.08.2026 og er fjernet.
  //
  // Faget passet ikke modellen. Alt her hviler på et MÅLBART omfang — en flate,
  // en lengde, et punkt — og på at samme jobb gjøres på samme måte hver gang.
  // En bil har ingen av delene: prisen styres av lakkens tilstand og hvor skitten
  // kupeen er, og det er en befaring, ikke en utregning. Alle elleve
  // operasjonene sto som `anslag` uten ett eneste markedstall.
  //
  // Fagene som står igjen deler én egenskap: håndverkeren måler noe, og tallet
  // hans blir tilbudet. Se `Rom` i lib/mengde.ts.
  //
  // Trenger noen tallene igjen: `git show <commit>^:lib/priser.ts`.

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

/** Fagets jobbmaler, eller tom liste for et fag som ikke har noen. */
export function jobbmalerFor(jobbType: string): Jobbmal[] {
  return hentFag(jobbType).jobbmaler ?? []
}

export function finnJobbmal(jobbType: string, malId: string): Jobbmal | undefined {
  return jobbmalerFor(jobbType).find((m) => m.id === malId)
}

export interface OperasjonsGruppe {
  navn: string
  operasjoner: Operasjon[]
}

/**
 * Operasjonene gruppert slik nedtrekkslista skal vise dem.
 *
 * Rekkefølgen følger `operasjoner`-lista og ikke alfabetet: den er satt med
 * vilje (liten bil før stor, flatearbeid før stykkarbeid), og en sortering her
 * ville overstyrt en beslutning som allerede er tatt lenger oppe i fila.
 *
 * Har ingen operasjoner i faget en `gruppe`, blir det en gruppe med fagets eget
 * navn — da ser lista ut nøyaktig som for, uten en overskrift som ikke skiller
 * noe fra noe.
 */
export function grupperteOperasjoner(jobbType: string): OperasjonsGruppe[] {
  const fag = hentFag(jobbType)
  const rekkefolge: string[] = []
  const perGruppe = new Map<string, Operasjon[]>()

  for (const operasjon of fag.operasjoner) {
    const gruppe = operasjon.gruppe ?? fag.navn
    if (!perGruppe.has(gruppe)) {
      perGruppe.set(gruppe, [])
      rekkefolge.push(gruppe)
    }
    perGruppe.get(gruppe)!.push(operasjon)
  }

  return rekkefolge.map((navn) => ({ navn, operasjoner: perGruppe.get(navn) ?? [] }))
}

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
  /** Flertall — til «3 biler». */
  enhetstekst: string
  /** Entall — til «4 500 kr per bil». To felter fordi norsk krever det. */
  enhetstekstEntall: string
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
      advarsel = `${prisPerEnhet} kr per ${enhetEntallFor(op)} ligger over markedet (${op.markedLav}–${op.markedHoy} kr). Kunden vil trolig finne det billigere.`
    } else if (prisPerEnhet < op.markedLav) {
      advarsel = `${prisPerEnhet} kr per ${enhetEntallFor(op)} ligger under markedet (${op.markedLav}–${op.markedHoy} kr). Sjekk at du ikke taper penger.`
    }
  } else if (op.kilde === 'anslag') {
    advarsel = 'Satsen for denne operasjonen er et anslag, ikke et markedstall. Kontroller den mot din egen erfaring.'
  }

  return {
    operasjonId: op.id,
    navn: op.navn,
    enhet: op.enhet,
    enhetstekst: enhetFlertallFor(op),
    enhetstekstEntall: enhetEntallFor(op),
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
        return op ? `${l.antall} ${enhetFlertallFor(op)}` : `${l.antall}`
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
