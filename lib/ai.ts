import { hentFagKonfig } from '@/lib/priser'

export interface TilbudInput {
  jobbType: string
  romstorrelseM2: number
  timepris: number
  materialkost: number
  beskrivelse?: string
  kundenavn?: string
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
  kilde: 'ai' | 'lokalt-estimat'
}

export const SYSTEM_PROMPT = `Du er en profesjonell kalkulatør for norske håndverkere (malere, snekkere, rørleggere, elektrikere, murere, bilpleie).
Du får oppgitt jobbtype, romstørrelse i m², timepris, estimert materialkostnad, en valgfri beskrivelse og et valgfritt kundenavn.

Regn ut et realistisk tilbud og svar KUN med et gyldig JSON-objekt (ingen forklaringstekst, ingen markdown) med nøyaktig disse feltene:
{
  "pris": number,              // total tilbudspris i kroner, inkl. margin
  "tidsbrukTimer": number,     // estimert tidsbruk i timer
  "materialforbruk": string,   // kort beskrivelse av materialer som trengs
  "materialkostTotal": number, // total materialkostnad i kroner
  "marginProsent": number,     // margin i prosent
  "marginKr": number,          // margin i kroner
  "risikoanalyse": string,     // kort, konkret risikoanalyse (1-3 setninger)
  "tilbudstekst": string       // ferdig, profesjonell tilbudstekst på norsk klar til å sendes til kunde
}

Vær realistisk og konkret. Ikke bruk fyllord. Tilbudsteksten skal være kort, profesjonell og direkte, uten unødvendig prat.`

function beregnLokaltEstimat(input: TilbudInput): TilbudResult {
  const fagKonfig = hentFagKonfig(input.jobbType)
  const tidsbrukTimer = Math.max(1, Math.round(input.romstorrelseM2 * fagKonfig.timerPerM2 * 10) / 10)

  const arbeidskostnad = tidsbrukTimer * input.timepris
  const materialkostTotal = input.materialkost
  const kostnadFoerMargin = arbeidskostnad + materialkostTotal

  const marginProsent = fagKonfig.marginProsent
  const pris = Math.round(kostnadFoerMargin / (1 - marginProsent / 100))
  const marginKr = pris - kostnadFoerMargin

  const materialforbruk = `Estimert materialforbruk for ${input.jobbType.toLowerCase()}-jobb på ${input.romstorrelseM2} m²: standard materialer og forbruksvarer tilpasset omfanget. Faktisk forbruk bør bekreftes ved befaring.`

  const risikoanalyse = `Estimatet er basert på oppgitt areal og standard tidsbruk for ${input.jobbType.toLowerCase()}-arbeid. Skjulte forhold, dårlig tilgjengelighet eller avvik i underlag/overflate kan øke tidsbruk og materialkostnad. Anbefaler befaring før endelig pris bekreftes ved usikkerhet.`

  const tilbudstekst = `TILBUD${input.kundenavn ? ` – ${input.kundenavn}` : ''}

Jobbtype: ${input.jobbType}
Omfang: ${input.romstorrelseM2} m²${input.beskrivelse ? `\nBeskrivelse: ${input.beskrivelse}` : ''}

Vi tilbyr å utføre oppdraget til en fastpris på kr ${pris.toLocaleString('nb-NO')},-.

Estimert tidsbruk: ${tidsbrukTimer} timer.
Inkludert materialer: ${materialforbruk}

Prisen inkluderer arbeid og materialer som beskrevet over. Eventuelle tillegg utover avtalt omfang avtales særskilt før arbeid igangsettes.

Tilbudet er gyldig i 14 dager.

Med vennlig hilsen`

  return {
    pris,
    tidsbrukTimer,
    materialforbruk,
    materialkostTotal,
    marginProsent,
    marginKr,
    risikoanalyse,
    tilbudstekst,
    kilde: 'lokalt-estimat',
  }
}

export async function genererTilbud(input: TilbudInput): Promise<TilbudResult> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey || apiKey.startsWith('sk-mock')) {
    return beregnLokaltEstimat(input)
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
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
              romstorrelseM2: input.romstorrelseM2,
              timepris: input.timepris,
              materialkost: input.materialkost,
              beskrivelse: input.beskrivelse || 'Ingen ytterligere beskrivelse oppgitt.',
              kundenavn: input.kundenavn || undefined,
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

    const result: TilbudResult = {
      pris: Number(parsed.pris),
      tidsbrukTimer: Number(parsed.tidsbrukTimer),
      materialforbruk: String(parsed.materialforbruk),
      materialkostTotal: Number(parsed.materialkostTotal),
      marginProsent: Number(parsed.marginProsent),
      marginKr: Number(parsed.marginKr),
      risikoanalyse: String(parsed.risikoanalyse),
      tilbudstekst: String(parsed.tilbudstekst),
      kilde: 'ai',
    }

    if (Object.values(result).some((v) => v === undefined || (typeof v === 'number' && Number.isNaN(v)))) {
      throw new Error('Ufullstendig JSON fra AI-modellen')
    }

    return result
  } catch (err) {
    console.error('AI-kall feilet, faller tilbake til lokalt estimat:', err)
    return beregnLokaltEstimat(input)
  }
}
