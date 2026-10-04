// Server-only. Selve oppslaget mot databasen.
//
// Skilt fra lib/holdliv.ts av samme grunn som etterkalkyle/etterkalkyleLager er
// skilt: lib/supabase.ts krever SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY ved
// import, og kaster uten dem. Lå dette i samme fil som cronGodkjent() og
// varselMottaker(), kunne ikke regresjonstesten importert dem uten et fullt
// databasemiljø.

import { supabase } from '@/lib/supabase'
import type { Livssjekk } from '@/lib/holdliv'

// En pauset base svarer ikke nødvendigvis med en feil — den kan la
// forbindelsen henge. Uten tidsavbrudd ville cron-kallet hengt til Vercel
// drepte funksjonen, og da rekker vi aldri å sende varselet. Grensen er satt
// romslig nok til at et tregt kaldstart-oppslag ikke gir falskt alarm.
const TIDSAVBRUDD_MS = 10_000

// Tabellen som røres. Valgt fordi den er appens kjerne og finnes fra første
// oppsett. Oppslaget er `head: true` med count — PostgREST kjører en ekte
// count-spørring mot Postgres og returnerer ingen rader. Vi trenger
// databaseaktivitet, ikke data.
const TABELL = 'tilbud'

export async function sjekkDatabasen(): Promise<Livssjekk> {
  const start = Date.now()
  try {
    const { error } = await supabase
      .from(TABELL)
      .select('id', { count: 'exact', head: true })
      .abortSignal(AbortSignal.timeout(TIDSAVBRUDD_MS))

    const ms = Date.now() - start
    if (error) return { oppe: false, feil: error.message, ms }
    return { oppe: true, ms }
  } catch (err) {
    // Hit havner tidsavbruddet og alt annet som kaster før PostgREST svarer —
    // DNS-feil mot et slettet prosjekt, nettverksfeil, manglende nøkkel.
    const ms = Date.now() - start
    const grunn = err instanceof Error ? err.message : String(err)
    return {
      oppe: false,
      feil: ms >= TIDSAVBRUDD_MS ? `Ingen svar innen ${TIDSAVBRUDD_MS / 1000} sekunder (${grunn})` : grunn,
      ms,
    }
  }
}
