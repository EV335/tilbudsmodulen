import { NextRequest, NextResponse } from 'next/server'
import { cronGodkjent, sendNedevarsel } from '@/lib/holdliv'
import { sjekkDatabasen } from '@/lib/holdlivBase'

// MÅ være dynamisk. Cachet den, ville Vercel servert gårsdagens svar uten å
// røre databasen i det hele tatt — og da gjør hele jobben ingenting, mens
// loggen viser 200 hver dag.
export const dynamic = 'force-dynamic'
// supabase-js kaller global fetch, som Next.js patcher og cacher til disk.
// Samme problem som over, ett lag lenger ned.
export const fetchCache = 'force-no-store'
export const revalidate = 0

/**
 * Daglig puls mot databasen. Planlagt i `vercel.json`.
 *
 * Se lib/holdliv.ts for hvorfor dette finnes. Kort: free-planen pauser
 * Supabase-prosjektet etter rundt én uke uten aktivitet, og forrige gang det
 * skjedde lå appen nede i fem uker uten at noen merket det.
 *
 * Svarer alltid 200 når ruten selv virker — også når databasen er nede.
 * Grunnen: Vercel prøver ikke et cron-kall på nytt, så en 500 ville bare gjort
 * at utfallet ble vanskeligere å lese i loggen. Status på basen står i
 * svarkroppen, og er den nede har det gått e-post.
 */
export async function GET(req: NextRequest) {
  if (!cronGodkjent(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Ikke autorisert.' }, { status: 401 })
  }

  // `?prove=1` tvinger nede-grenen uten å røre databasen.
  //
  // Den ene stien her som ellers aldri blir prøvd er den som betyr noe: at
  // e-posten faktisk kommer frem når basen er borte. Den kan ikke testes ved
  // å vente på at det skjer — da er det for sent, og det er nettopp da vi
  // trenger å vite det. Så den kan utløses med vilje.
  //
  // Ligger bak samme `CRON_SECRET` som resten av ruten. Er hemmeligheten ikke
  // satt, slipper også dette kallet gjennom — men det eneste en fremmed da
  // kan få til er å sende én e-post til eieren, tydelig merket som test.
  if (req.nextUrl.searchParams.get('prove') === '1') {
    const falsk = {
      oppe: false as const,
      feil: 'PRØVE — databasen ble aldri spurt. Dette er en test av varslingen.',
      ms: 0,
    }
    const varsel = await sendNedevarsel(falsk)
    return NextResponse.json({
      prove: true,
      varsel: varsel.sendt ? `sendt til ${varsel.til}` : `ikke sendt: ${varsel.grunn}`,
      tid: new Date().toISOString(),
    })
  }

  const sjekk = await sjekkDatabasen()

  if (sjekk.oppe) {
    return NextResponse.json({ oppe: true, ms: sjekk.ms, tid: new Date().toISOString() })
  }

  // Loggen er førstelinja: e-posten kan feile av helt egne grunner, og da skal
  // det fortsatt stå i Vercel-loggen hva som var galt med basen.
  console.error(`Holdliv: databasen svarer ikke etter ${sjekk.ms} ms — ${sjekk.feil}`)

  const varsel = await sendNedevarsel(sjekk)
  if (!varsel.sendt) {
    console.error(`Holdliv: fikk heller ikke sendt varsel — ${varsel.grunn}`)
  }

  return NextResponse.json({
    oppe: false,
    feil: sjekk.feil,
    ms: sjekk.ms,
    varsel: varsel.sendt ? `sendt til ${varsel.til}` : `ikke sendt: ${varsel.grunn}`,
    tid: new Date().toISOString(),
  })
}
