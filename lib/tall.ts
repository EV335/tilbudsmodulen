// Tallesing for et norsk grensesnitt.
//
// Bakgrunn: skjemaene brukte `type="number"` overalt. Da er det NETTLESERENS
// språkinnstilling, ikke appens, som avgjør om «7,5» er et gyldig tall. En
// håndverker med engelskspråklig nettleser fikk feltet tømt idet han skrev
// komma — verdien i React-staten ble tom streng, mens han så «7,5» stå i
// feltet. Lagre-knappen ble deaktivert uten et ord om hvorfor.
//
// Løsningen er å ta imot teksten som tekst og tolke den selv, likt overalt.
// Se components/ui/TallInput.tsx for feltet som hører til.

/**
 * Tolker det brukeren har skrevet. Returnerer null for tomt eller uforståelig.
 *
 * Godtar både komma og punktum som desimalskille, og mellomrom som
 * tusenskille — også det harde mellomrommet `toLocaleString('nb-NO')` legger
 * inn, slik at et tall kopiert ut av appen kan limes rett inn igjen.
 */
export function tilTall(tekst: string): number | null {
  let rent = tekst.trim().replace(/\s/g, '')
  if (rent === '') return null

  if (rent.includes(',') && rent.includes('.')) {
    // Begge deler: «1.234,5» er norsk formatering — punktum er tusenskille.
    rent = rent.replace(/\./g, '').replace(',', '.')
  } else {
    // Bare én av dem. Andre komma gjør tallet tvetydig, og da skal det avvises
    // i stedet for at vi gjetter — «1,234» kan være både 1234 og 1,234.
    rent = rent.replace(',', '.')
  }

  const n = Number(rent)
  return Number.isFinite(n) ? n : null
}

/** Tolker, men holder seg innenfor grensene. Til skjemaer som krever et tall. */
export function tilTallIOmraade(tekst: string, min: number, maks: number): number | null {
  const n = tilTall(tekst)
  if (n === null || n < min || n > maks) return null
  return n
}

/**
 * Server-siden. Tre utfall, ikke to: «ikke oppgitt» og «oppgitt, men tull» må
 * behandles ulikt — det første er ofte lovlig, det andre skal gi 400 med en
 * setning brukeren kan gjøre noe med.
 *
 * Tar imot komma av samme grunn som `tilTall`: klienten sender videre det
 * brukeren skrev, og et norsk desimaltall skal ikke avvises av serveren.
 */
export function lesTall(verdi: unknown, maks: number): number | null | 'ugyldig' {
  if (verdi === null || verdi === undefined) return null
  if (typeof verdi === 'string' && verdi.trim() === '') return null
  // Number([]) og Number(true) gir 0 og 1. Bare tall og tallstrenger godtas.
  if (typeof verdi !== 'number' && typeof verdi !== 'string') return 'ugyldig'

  const tall = typeof verdi === 'number' ? verdi : tilTall(verdi)
  if (tall === null || !Number.isFinite(tall) || tall < 0 || tall > maks) return 'ugyldig'
  return tall
}
