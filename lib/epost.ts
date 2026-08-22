// Validering av e-postadresser, ett sted.
//
// Bakgrunn: kundens e-post ble aldri sjekket. En skrivefeil — «ola@firma» uten
// toppdomene — ble lagret uten innvending, og feilet først når fakturaen skulle
// sendes. Da er det for sent: i webhook-løpet er utsendingen etter at
// betalingen er registrert, og en feil der svelges med vilje (se
// sendFakturaEpost). Håndverkeren satt igjen med en betalt faktura han trodde
// var sendt, og en kunde som aldri fikk noe.
//
// Adressen skal derfor avvises der den skrives inn, ikke der den brukes.

// Med vilje romslig. Den skal fange skrivefeil, ikke håndheve RFC 5322 —
// avviser vi en gyldig adresse med plusstegn eller underdomene, har vi laget et
// verre problem enn det vi løste. Krav: noe før @, noe etter, og minst ett
// punktum i domenet.
const EPOST = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function erEpost(verdi: string): boolean {
  return EPOST.test(verdi.trim())
}

/**
 * For felter der adressen er valgfri: tom betyr «ikke oppgitt», ikke «ugyldig».
 * Returnerer den rensede adressen, null om feltet var tomt, eller 'ugyldig'.
 */
export function lesEpost(verdi: unknown): string | null | 'ugyldig' {
  if (verdi === null || verdi === undefined) return null
  if (typeof verdi !== 'string') return 'ugyldig'
  const rent = verdi.trim()
  if (rent === '') return null
  return erEpost(rent) ? rent : 'ugyldig'
}
