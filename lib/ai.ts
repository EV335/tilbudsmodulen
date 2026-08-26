import {
  beregnTilbud,
  hentFag,
  BeregnetLinje,
  BeregnetSum,
  TilbudLinjeInput,
} from '@/lib/priser'
import { romTekst, type Rom } from '@/lib/mengde'

export interface TilbudInput {
  jobbType: string
  timepris: number
  linjer: TilbudLinjeInput[]
  marginProsent?: number
  beskrivelse?: string
  kundenavn?: string
  /**
   * Rommene jobben gjelder, slik de ble maalt.
   *
   * Lagres MED tilbudet og ikke bare brukt til aa regne ut antallene: maalene
   * er selve grunnlaget for prisen, og uten dem kan ingen etterpaa se hvilke
   * rom som var med. De brukes ikke i utregningen — antallene staar allerede
   * paa linjene — men de staar i teksten kunden leser.
   */
  rom?: Rom[]
  /** Kun for tilbud lagret før linjemodellen (august 2026). Brukes ikke i utregning. */
  romstorrelseM2?: number
  materialkost?: number
}

export interface TilbudResult {
  pris: number
  tidsbrukTimer: number
  materialforbruk: string
  materialkostTotal: number
  marginProsent: number
  marginKr: number
  risikoanalyse: string
  tilbudstekst: string
  /** Hvor TEKSTEN kommer fra. Tallene regnes alltid i koden. */
  kilde: 'ai' | 'lokalt-estimat'
  linjer?: BeregnetLinje[]
  arbeidKr?: number
  kostKr?: number
  advarsler?: string[]
}

// AI-en får ALDRI bestemme pris. Den får de ferdige tallene og skriver teksten
// rundt dem. Før denne endringen regnet modellen selv, og sju av sju svar var
// aritmetisk umulige — pris stemte ikke med timer x timepris + materialer +
// margin i et eneste tilfelle, med avvik opp til 52 500 kr. Den gjorde også at
// samme jobb kunne gi 0,34x eller 1,45x av husmodellen.
export const SYSTEM_PROMPT = `Du skriver tilbudstekster for norske håndverkere.

Du får et FERDIG UTREGNET tilbud. Tallene er bestemt av håndverkerens egne satser
og skal ikke endres, diskuteres eller regnes om. Du skal kun formulere teksten.

Svar KUN med et gyldig JSON-objekt (ingen markdown) med nøyaktig disse feltene:
{
  "materialforbruk": string,   // kort, konkret liste over materialer jobben krever
  "risikoanalyse": string,     // 1-3 setninger om hva som kan drive kostnaden opp
  "tilbudstekst": string       // ferdig tilbudstekst på norsk, klar til å sendes
}

Regler:
- Gjenta prisen nøyaktig slik den er oppgitt. Ikke rund av, ikke juster, ikke foreslå noe annet tall.
- Ikke finn på tillegg, rabatter eller forbehold som ikke følger av det du har fått.
- Skriv kort og profesjonelt. Ingen fyllord, ingen overtalelse.`

// Formaterer TALLET, ikke beløpet — «kr» og «,-» settes av malene under.
// Het tidligere formatKr, som er navnet på pengeformatereren i lib/format.ts.
// To ulike funksjoner med samme navn inviterer til at noen «rydder opp» ved å
// bytte inn feil av dem, og da får kunden «kr kr 10 167,-,-».
function formatTall(n: number): string {
  return n.toLocaleString('nb-NO')
}

function linjeTekst(l: BeregnetLinje): string {
  return `- ${l.navn}: ${formatTall(l.antall)} ${l.enhetstekst} — kr ${formatTall(l.prisKr)},-`
}

/**
 * Nevner AI-teksten det beløpet vi faktisk regnet ut?
 *
 * Sammenligningen går på SIFRE. Den sjekket tidligere mot
 * `toLocaleString('nb-NO')`, som skiller tusener med hardt mellomrom (U+00A0).
 * En AI skriver vanlig mellomrom, punktum eller ingenting — så vakten var usann
 * for enhver pris over 1000, altså nesten alle tilbud. AI-teksten ble dermed
 * alltid forkastet til fordel for malen, og loggen sa «gjengir ikke prisen»,
 * som peker mistanken mot modellen i stedet for mot sammenligningen.
 */
export function tekstNevnerPrisen(tekst: string, prisKr: number): boolean {
  return tekst.replace(/\D/g, '').includes(String(prisKr))
}

function malbasertTekst(input: TilbudInput, sum: BeregnetSum): Omit<TilbudResult, 'kilde'> {
  const materialforbruk = `Materialer for ${input.jobbType.toLowerCase()}-arbeidet er beregnet til kr ${formatTall(
    sum.materialKr
  )},- basert på omfanget i tilbudet. Faktisk forbruk bekreftes ved befaring.`

  const risikoanalyse = `Prisen bygger på oppgitt omfang og normal tidsbruk for ${input.jobbType.toLowerCase()}-arbeid. Skjulte forhold, dårlig tilgjengelighet eller avvik i underlaget kan øke tidsbruk og materialkostnad. Ved usikkerhet anbefales befaring før prisen bekreftes.`

  const rom = input.rom ? romTekst(input.rom) : null

  const tilbudstekst = `TILBUD${input.kundenavn ? ` – ${input.kundenavn}` : ''}

Jobbtype: ${input.jobbType}${input.beskrivelse ? `\nBeskrivelse: ${input.beskrivelse}` : ''}

Omfang:${rom ? `\nRom: ${rom}` : ''}
${sum.linjer.map(linjeTekst).join('\n')}

Samlet fastpris: kr ${formatTall(sum.prisKr)},-
Estimert tidsbruk: ${formatTall(sum.timer)} timer.

Prisen inkluderer arbeid og materialer som beskrevet over. Tillegg utover avtalt
omfang avtales særskilt før arbeidet igangsettes.

Tilbudet er gyldig i 14 dager.

Med vennlig hilsen`

  return {
    pris: sum.prisKr,
    tidsbrukTimer: sum.timer,
    materialforbruk,
    materialkostTotal: sum.materialKr,
    marginProsent: sum.marginProsent,
    marginKr: sum.marginKr,
    risikoanalyse,
    tilbudstekst,
    linjer: sum.linjer,
    arbeidKr: sum.arbeidKr,
    kostKr: sum.kostKr,
    advarsler: sum.linjer.map((l) => l.advarsel).filter((a): a is string => Boolean(a)),
  }
}

/**
 * Regner prisen på nytt fra linjene og sammenligner med det klienten sendte inn.
 * Returnerer en feilmelding hvis de spriker, ellers null.
 *
 * Uten denne var prisen som ble lagret — og senere fakturert til kunden — bare
 * det nettleseren påsto. En bug i klienten, en gammel fane med utdatert kode
 * eller noen som tuklet i konsollen ville gått rett gjennom til fakturaen.
 *
 * Tilbud lagret før linjemodellen har ingen `linjer` og hoppes over; de kan ikke
 * etterregnes, og skal fortsatt kunne åpnes og lagres.
 */
export function verifiserPris(
  input: TilbudInput,
  resultat: TilbudResult,
  { tillatUtenLinjer = false }: { tillatUtenLinjer?: boolean } = {}
): string | null {
  if (!input?.linjer?.length) {
    // Gamle tilbud (fra før linjemodellen, august 2026) har ingen linjer, og
    // skal fortsatt kunne åpnes, redigeres og lagres på nytt. Derfor unntaket —
    // men det gjelder BARE oppdatering av et eksisterende tilbud.
    //
    // Et nytt tilbud kommer alltid fra kalkulatoren, og /api/calc avviser tomme
    // linjer. Der er «ingen linjer» altså ikke gamle data, men en pris ingen har
    // regnet ut — og da kontrollerte denne vakten ingenting i det hele tatt.
    return tillatUtenLinjer
      ? null
      : 'Tilbudet mangler linjer, så prisen kan ikke kontrolleres.'
  }

  const sum = beregnTilbud(input.jobbType, input.linjer, input.timepris, input.marginProsent)

  if (sum.linjer.length === 0) {
    return 'Tilbudet har ingen gyldige linjer.'
  }

  if (sum.prisKr !== resultat.pris) {
    return `Prisen stemmer ikke med utregningen: fikk ${resultat.pris}, regnet ut ${sum.prisKr}.`
  }

  return null
}

export async function genererTilbud(input: TilbudInput): Promise<TilbudResult> {
  const sum = beregnTilbud(input.jobbType, input.linjer ?? [], input.timepris, input.marginProsent)

  if (sum.linjer.length === 0) {
    throw new Error('Tilbudet har ingen gyldige linjer.')
  }

  const basis = malbasertTekst(input, sum)
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey || apiKey.startsWith('sk-mock')) {
    return { ...basis, kilde: 'lokalt-estimat' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              jobbType: input.jobbType,
              kundenavn: input.kundenavn || undefined,
              beskrivelse: input.beskrivelse || 'Ingen ytterligere beskrivelse oppgitt.',
              // Rommene sendes med saa teksten kan navngi dem. AI-en rorer
              // fortsatt ingen tall — den faar det ferdige regnestykket.
              rom: (input.rom ? romTekst(input.rom) : null) || undefined,
              omfang: sum.linjer.map((l) => ({
                arbeid: l.navn,
                antall: l.antall,
                enhet: l.enhetstekst,
                pris: l.prisKr,
              })),
              samletPris: sum.prisKr,
              tidsbrukTimer: sum.timer,
              materialkostnad: sum.materialKr,
            }),
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API-feil: ${response.status}`)
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content
    if (!raw) {
      throw new Error('Tomt svar fra AI-modellen')
    }

    const parsed = JSON.parse(raw)
    const tekst = String(parsed.tilbudstekst ?? '')

    if (!tekst || !String(parsed.risikoanalyse ?? '')) {
      throw new Error('Ufullstendig tekst fra AI-modellen')
    }

    // Siste skanse: nevner teksten et annet totalbeløp enn det vi regnet ut,
    // er den ubrukelig uansett hvor godt den er skrevet. Da tar malen over.
    if (!tekstNevnerPrisen(tekst, sum.prisKr)) {
      throw new Error('AI-teksten gjengir ikke prisen som ble regnet ut')
    }

    return {
      ...basis,
      materialforbruk: String(parsed.materialforbruk ?? basis.materialforbruk),
      risikoanalyse: String(parsed.risikoanalyse),
      tilbudstekst: tekst,
      kilde: 'ai',
    }
  } catch (err) {
    console.error('AI-tekst feilet, bruker malbasert tekst:', err)
    return { ...basis, kilde: 'lokalt-estimat' }
  } finally {
    clearTimeout(timeout)
  }
}
