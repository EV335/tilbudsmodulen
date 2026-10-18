import { NextResponse } from 'next/server'
import { sjekkDatabasen } from '@/lib/holdlivBase'

// Samme grunn som på cron-ruten: cachet den, ville svaret kommet fra disk
// uten at databasen ble spurt, og vakten utenfor ville sett grønt på en død
// base. Det er den ene feilen denne ruten ikke har lov til å gjøre.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

/**
 * Helsesjekk for en overvåking utenfor Vercel.
 *
 * Hullet denne lukker: nedevarselet sendes av den daglige cron-jobben som
 * gjør sjekken. Slutter jobben å kjøre — Vercel-prosjektet faller ut,
 * cron-oppsettet forsvinner, deployen ryker — så stopper varslene samtidig,
 * og da er det ingenting igjen som sier fra. Det er nøyaktig det som skjedde
 * to ganger: appen lå nede i ukevis fordi forsiden er statisk og svarte 200
 * hele tiden.
 *
 * Et øye som står utenfor ser begge deler: om basen lever, og om appen i det
 * hele tatt svarer.
 *
 * **Åpen med vilje.** En ekstern uptime-tjeneste kan ikke sende en
 * hemmelighet. Avveiingen er at ruten koster ett lite `count`-oppslag uten
 * rader per kall, og den sier ingenting om innholdet i basen — verken antall,
 * feilmelding fra Postgres eller noe annet som kunne hjulpet en fremmed.
 *
 * Svarer **503** når basen er nede, ikke 200 med `oppe: false`. En
 * uptime-vakt leser statuskoden; en 200 ville blitt lest som friskt.
 */
export async function GET() {
  const sjekk = await sjekkDatabasen()

  if (sjekk.oppe) {
    return NextResponse.json({ oppe: true }, { status: 200 })
  }

  // Detaljene hører hjemme i loggen, der bare vi ser dem.
  console.error(`Helse: databasen svarer ikke etter ${sjekk.ms} ms — ${sjekk.feil}`)
  return NextResponse.json({ oppe: false }, { status: 503 })
}
