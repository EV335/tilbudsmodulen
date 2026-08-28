// Rommet — ett sett mål, alle flatene.
//
// Fagene som er igjen i appen har én ting felles: håndverkeren måler noe, og
// tallet hans blir tilbudet. Maleren måler vegg og tak, gulvleggeren gulv,
// flisleggeren begge deler, og listverket følger omkretsen. Alle fire tallene
// kommer fra DE SAMME tre målene.
//
// Derfor ligger målene på jobben og ikke på linja. Med en regner per linje
// måtte 4,2 × 3,1 × 2,4 tastes inn på nytt for hver operasjon, og da kan de
// drive fra hverandre: 21 m² gulv og 23 m² tak i samme rom er et tilbud som
// ikke går opp, og kunden ser det før håndverkeren gjør det. Nå er det
// umulig — taket ER gulvet, regnet av samme lengde og bredde.
//
// Ren regning, ingen React og ingen database, slik at skjemaet, testene og en
// framtidig serverside bruker nøyaktig samme tall.

import type { Enhet } from '@/lib/priser'

/**
 * Ett rom, slik håndverkeren måler det.
 *
 * Alt er valgfritt fordi skjemaet fylles ut i den rekkefølgen han går rundt med
 * tommestokken. `maalOpp` tar med det som er komplett og sier fra om resten.
 */
export interface Rom {
  /** Fritt navn — «Stue», «Sov 2». Kun til gjenkjenning i lista. */
  navn?: string
  /** Meter. */
  lengde?: number
  bredde?: number
  hoyde?: number
  /** Antall, ikke areal. Håndverkeren teller dører; han måler dem ikke. */
  dorer?: number
  vinduer?: number
}

/**
 * Standard åpningsareal, brukt til fradrag i veggflaten.
 *
 * En norsk innerdør med karm er ca. 0,9 × 2,1 m, et vanlig vindu ca. 1,2 × 1,2 m.
 * Avrundede normalstørrelser, ikke en måling av kundens hus — derfor er
 * fradraget valgfritt, og utregningen viser alltid hva som ble trukket fra.
 */
export const DOR_M2 = 1.9
export const VINDU_M2 = 1.4
/** Bredden på en standard innerdør. Lister går ikke over åpningen. */
export const DOR_BREDDE_M = 0.9

export interface Flatemaal {
  gulvM2: number
  takM2: number
  veggM2: number
  listverkLm: number
  /** Rom som hadde både lengde og bredde — de som teller på gulv, tak og listverk. */
  rom: number
  /**
   * Av dem: hvor mange som manglet takhøyde og derfor IKKE er med i `veggM2`.
   *
   * Telles og skjules ikke. Uten dette tallet ville veggflaten stille vært for
   * liten, og en for liten veggflate er et for billig tilbud — den feilen
   * oppdages først når jobben er gjort.
   */
  romUtenHoyde: number
}

/** Hvilken flate en `m2_flate`-operasjon gjelder. Flis kan være både gulv og vegg. */
export type Flate = 'gulv' | 'tak' | 'vegg'

export const FLATE_VALG: { value: Flate; label: string }[] = [
  { value: 'gulv', label: 'Gulv' },
  { value: 'vegg', label: 'Vegg' },
  { value: 'tak', label: 'Tak' },
]

// Kvadratmeter og løpemeter oppgis med én desimal. Flere desimaler enn det er
// en presisjon en tommestokk ikke har.
function rundEn(n: number): number {
  return Math.round(n * 10) / 10
}

function tall(verdi: number | undefined): number | null {
  return verdi !== undefined && Number.isFinite(verdi) && verdi > 0 ? verdi : null
}

function antall(verdi: number | undefined): number {
  return verdi !== undefined && Number.isFinite(verdi) && verdi > 0 ? Math.floor(verdi) : 0
}

/**
 * Summerer rommene til fire flatetall.
 *
 * Et rom uten lengde eller bredde teller ikke i det hele tatt — det er en tom
 * rad i skjemaet, ikke et rom på null kvadratmeter. Et rom uten takhøyde teller
 * på gulv, tak og listverk, men ikke på vegg, og blir talt opp i `romUtenHoyde`
 * slik at skjemaet kan si fra.
 *
 * Returnerer null når ingen rom er komplette, så kalleren slipper å skille
 * «ingen mål ennå» fra «null kvadratmeter».
 */
export function maalOpp(rom: Rom[]): Flatemaal | null {
  const maal: Flatemaal = { gulvM2: 0, takM2: 0, veggM2: 0, listverkLm: 0, rom: 0, romUtenHoyde: 0 }

  for (const r of rom) {
    const lengde = tall(r.lengde)
    const bredde = tall(r.bredde)
    if (lengde === null || bredde === null) continue

    maal.rom += 1

    const gulv = lengde * bredde
    maal.gulvM2 += gulv
    // Taket ER gulvet. Skråtak og innkassinger finnes, men da overstyrer
    // håndverkeren linja manuelt — det er en avgjørelse han tar, ikke en
    // antakelse appen skal gjøre på egen hånd.
    maal.takM2 += gulv

    const dorer = antall(r.dorer)
    maal.listverkLm += Math.max(0, 2 * (lengde + bredde) - dorer * DOR_BREDDE_M)

    const hoyde = tall(r.hoyde)
    if (hoyde === null) {
      maal.romUtenHoyde += 1
      continue
    }

    const vegg = 2 * (lengde + bredde) * hoyde - dorer * DOR_M2 - antall(r.vinduer) * VINDU_M2
    // Ti dører i et lite bod spiser hele veggen. Da er svaret at målene ikke
    // henger sammen, ikke et negativt areal som trekker ned de andre rommene.
    maal.veggM2 += Math.max(0, vegg)
  }

  if (maal.rom === 0) return null

  return {
    gulvM2: rundEn(maal.gulvM2),
    takM2: rundEn(maal.takM2),
    veggM2: rundEn(maal.veggM2),
    listverkLm: rundEn(maal.listverkLm),
    rom: maal.rom,
    romUtenHoyde: maal.romUtenHoyde,
  }
}

/**
 * Mengden en operasjon skal ha, hentet fra rommålene.
 *
 * null betyr «denne enheten kommer ikke fra et rom» — et elektrisk punkt og et
 * sikringsskap telles, de måles ikke, og et tall herfra ville vært oppspinn.
 */
export function mengdeFor(enhet: Enhet, maal: Flatemaal, flate: Flate = 'gulv'): number | null {
  switch (enhet) {
    case 'm2_gulv':
      return maal.gulvM2
    case 'm2_tak':
      return maal.takM2
    case 'm2_vegg':
      return maal.veggM2
    case 'm2_flate':
      // Den eneste enheten som er tvetydig: flis legges på gulv OG vegg,
      // sparkling på vegg, membran på gulv. Håndverkeren velger selv.
      return flate === 'vegg' ? maal.veggM2 : flate === 'tak' ? maal.takM2 : maal.gulvM2
    case 'lopemeter':
      return maal.listverkLm
    default:
      return null
  }
}

/** Kan denne enheten i det hele tatt fylles fra rommålene? */
export function kommerFraRom(enhet: Enhet): boolean {
  return enhet === 'm2_gulv' || enhet === 'm2_tak' || enhet === 'm2_vegg' || enhet === 'm2_flate' || enhet === 'lopemeter'
}

/** Har faget noe som helst som måles? Elektriker og rørlegger teller bare. */
export function fagBrukerRom(enheter: Enhet[]): boolean {
  return enheter.some(kommerFraRom)
}

/** Regnestykket i klartekst, så tallet kan ettergås i stedet for å tros på. */
export function utregning(rom: Rom[], maal: Flatemaal): string[] {
  const linjer: string[] = []
  const flere = maal.rom > 1

  linjer.push(
    flere
      ? `${maal.rom} rom: ${maal.gulvM2} m² gulv, og like mye tak.`
      : `Gulv og tak: ${maal.gulvM2} m² hver.`
  )

  if (maal.veggM2 > 0) {
    const dorer = rom.reduce((sum, r) => sum + antall(r.dorer), 0)
    const vinduer = rom.reduce((sum, r) => sum + antall(r.vinduer), 0)
    const fradrag = rundEn(dorer * DOR_M2 + vinduer * VINDU_M2)
    linjer.push(
      fradrag > 0
        ? `Vegg: ${maal.veggM2} m², etter fradrag på ${fradrag} m² for ${dorer} dør${
            dorer === 1 ? '' : 'er'
          } og ${vinduer} vindu${vinduer === 1 ? '' : 'er'}.`
        : `Vegg: ${maal.veggM2} m².`
    )
  }

  linjer.push(`Listverk: ${maal.listverkLm} løpemeter rundt.`)

  if (maal.romUtenHoyde > 0) {
    linjer.push(
      maal.romUtenHoyde === 1
        ? '⚠ Ett rom mangler takhøyde og er ikke med i veggflaten.'
        : `⚠ ${maal.romUtenHoyde} rom mangler takhøyde og er ikke med i veggflaten.`
    )
  }

  return linjer
}

/**
 * Går tilbudet opp?
 *
 * Én sjekk, og den finnes fordi den fanger den eneste feilen som er både lett å
 * gjøre og vanskelig å se: taket i et rom er like stort som gulvet, så to
 * håndskrevne linjer som sier noe annet er en tastefeil. Ti prosent slingring,
 * fordi innkassinger og skråtak er ekte.
 *
 * Sjekken gjelder bare tall håndverkeren har skrevet selv. Kommer begge fra
 * rommålene, ER de like, og da er det ingenting å advare om.
 */
export function sjekkSamsvar(gulvM2: number | null, takM2: number | null): string | null {
  if (gulvM2 === null || takM2 === null || gulvM2 <= 0 || takM2 <= 0) return null
  const avvik = Math.abs(takM2 - gulvM2) / gulvM2
  if (avvik <= 0.1) return null
  return `Du har ført ${gulvM2} m² gulv og ${takM2} m² tak. I et rom er de like store — sjekk tallene, med mindre taket er skrått eller innkasset.`
}

// Teksten gaar rett ut i tilbudet kunden leser, saa tallene maa vaere norske.
// «4.2 × 3.1 m» er ikke et norsk maal — og denne kodebasen har traadt i den
// fella foer, med «kr 12 033,25,-» paa en ekte faktura.
function nb(n: number): string {
  return n.toLocaleString('nb-NO')
}

/**
 * Rommene slik kunden skal lese dem i tilbudet.
 *
 * Malervennen sa at tilbudene ikke beskriver jobben som faktisk skal utfoeres.
 * En del av det er at «45 m² veggflate» ikke sier hvilke rom det gjelder — og
 * uenighet om HVILKE rom som var med i prisen er den dyreste uenigheten man kan
 * ha med en kunde, fordi den kommer for dagen etter at arbeidet er gjort.
 *
 * Rom uten navn nummereres, slik at fire rader ikke blir fire like linjer.
 */
export function romTekst(rom: Rom[]): string | null {
  const komplette = rom.filter((r) => tall(r.lengde) !== null && tall(r.bredde) !== null)
  if (komplette.length === 0) return null

  return komplette
    .map((r, i) => {
      const navn = r.navn?.trim() || `Rom ${i + 1}`
      const hoyde = tall(r.hoyde)
      const maal = `${nb(r.lengde!)} × ${nb(r.bredde!)} m${
        hoyde !== null ? `, takhøyde ${nb(hoyde)} m` : ''
      }`
      return `${navn} (${maal})`
    })
    .join(', ')
}

/**
 * Bare rommene som faktisk har maal.
 *
 * Skjemaet starter med en tom rad, og en tom rad skal ikke lagres med tilbudet
 * og senere leses som «et rom uten maal» av noen som lurer paa hva det betyr.
 */
export function komplette(rom: Rom[]): Rom[] {
  return rom.filter((r) => tall(r.lengde) !== null && tall(r.bredde) !== null)
}

// ---------------------------------------------------------------------------
// Flater som er maalt, men ikke priset
// ---------------------------------------------------------------------------

/** De fire tallene et rom gir. `Flate` er de tre som `m2_flate` kan peke paa. */
export type Maalflate = 'gulv' | 'tak' | 'vegg' | 'listverk'

const FLATENAVN: Record<Maalflate, string> = {
  gulv: 'gulv',
  tak: 'tak',
  vegg: 'vegg',
  listverk: 'listverk',
}

/**
 * Hvilken flate en `m2_flate`-operasjon gjelder som standard.
 *
 * Membran legges på gulv, sparkling på vegg, flis på begge — der er gulv det
 * vanligste. Gjettingen er bare et utgangspunkt; håndverkeren ser og endrer
 * valget på linja.
 *
 * Den lå tidligere i skjemaet alene, og det var en ekte feil: `udekkedeFlater`
 * antok gulv for alle `m2_flate`-operasjoner, og tilbød dermed sparkling som
 * «legg til gulv» til en maler — som ikke legger gulv. To steder som måtte
 * være enige om samme spørsmål, og bare det ene visste svaret.
 */
export function standardFlateFor(operasjonId: string): Flate {
  if (operasjonId === 'maler_sparkling') return 'vegg'
  return 'gulv'
}

/**
 * Hvilket av rommets fire tall en linje spiser.
 *
 * `m2_flate` er tvetydig og avgjøres av linjas eget flatevalg — en flislinje
 * på vegg dekker veggen, ikke gulvet.
 */
export function flatenTil(enhet: Enhet, flate: Flate = 'gulv'): Maalflate | null {
  switch (enhet) {
    case 'm2_gulv':
      return 'gulv'
    case 'm2_tak':
      return 'tak'
    case 'm2_vegg':
      return 'vegg'
    case 'm2_flate':
      return flate
    case 'lopemeter':
      return 'listverk'
    default:
      return null
  }
}

function mengdenTil(flate: Maalflate, maal: Flatemaal): number {
  return flate === 'gulv'
    ? maal.gulvM2
    : flate === 'tak'
      ? maal.takM2
      : flate === 'vegg'
        ? maal.veggM2
        : maal.listverkLm
}

export interface UdekketFlate {
  flate: Maalflate
  navn: string
  mengde: number
  enhetstekst: string
  /** Operasjonen som ville dekket den — fagets første med riktig enhet. */
  operasjonId: string
  operasjonNavn: string
}

const REKKEFOLGE: Maalflate[] = ['vegg', 'tak', 'gulv', 'listverk']

/**
 * Flater håndverkeren har målt opp, men ikke lagt en linje på.
 *
 * Malervennens innvending var at tilbudene ikke beskriver jobben som faktisk
 * skal utføres. Én konkret form av det: han måler rommet, appen regner ut fire
 * tall — og så står tre av dem ubrukt uten at noen sier fra. Det er ikke
 * nødvendigvis feil (mange jobber er bare vegger), men det er verdt ett
 * spørsmål, for den glemte flaten oppdages ellers først på befaring.
 *
 * Derfor et SPØRSMÅL og ikke et varsel: appen vet ikke hva som er avtalt, og
 * et varsel om noe som er helt i orden lærer folk å overse varsler.
 *
 * Fag uten en operasjon for flaten hoppes over — en maler har ingen
 * gulvoperasjon, og å spørre «skal gulvet med?» uten noe å legge til ville
 * vært et spørsmål uten svar.
 */
export function udekkedeFlater(
  dekket: Maalflate[],
  maal: Flatemaal,
  operasjoner: { id: string; navn: string; enhet: Enhet }[]
): UdekketFlate[] {
  const brukt = new Set(dekket)

  return REKKEFOLGE.filter((flate) => !brukt.has(flate) && mengdenTil(flate, maal) > 0)
    .map((flate) => {
      // Fagets første operasjon som treffer flaten. `m2_flate` avgjøres av sin
      // egen standardflate — uten det ble sparkling tilbudt som «legg til
      // gulv» til en maler, som ikke legger gulv.
      const op = operasjoner.find((o) => flatenTil(o.enhet, standardFlateFor(o.id)) === flate)
      if (!op) return null
      return {
        flate,
        navn: FLATENAVN[flate],
        mengde: mengdenTil(flate, maal),
        enhetstekst: flate === 'listverk' ? 'løpemeter' : 'm²',
        operasjonId: op.id,
        operasjonNavn: op.navn,
      }
    })
    .filter((f): f is UdekketFlate => f !== null)
}
