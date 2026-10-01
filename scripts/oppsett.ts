// Setter opp databasen i et Supabase-prosjekt som ALLEREDE finnes: schema.sql,
// deretter alle migrasjonene i datorekkefølge. Kjør med:
//
//   npm run oppsett -- --tort                 se hva som ville blitt kjørt
//   npm run oppsett                           kjør mot prosjektet i .env.local
//   npm run oppsett -- --prosjekt=abcd1234    kjør mot et annet prosjekt
//   npm run oppsett -- --kun-migrasjoner      hopp over schema.sql
//
// Skal prosjektet også OPPRETTES, bruk `npm run nyttprosjekt` i stedet. Begge
// kjører de samme filene gjennom scripts/supabase-admin.ts, så rekkefølgen kan
// ikke komme i utakt mellom dem.
//
// SIKKERHET: skriptet har ingen egen vakt mot å slette data. Den ligger der den
// hører hjemme — i `DEL -1` i supabase/schema.sql, som avbryter hele filen hvis
// `public.users` har rader. To vakter som skal si det samme er to vakter som
// kan komme i utakt.

import {
  lesEnvLokal,
  samleSteg,
  kjorSteg,
  kontroller,
  manglerTokenMelding,
  GJENSTAAR,
} from './supabase-admin'

lesEnvLokal()

const flagg = process.argv.slice(2)
const har = (navn: string) => flagg.includes(navn)
const verdi = (navn: string) => flagg.find((f) => f.startsWith(`${navn}=`))?.slice(navn.length + 1)

const TORT = har('--tort')
const KUN_MIGRASJONER = har('--kun-migrasjoner')
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

/**
 * Prosjektet som skal settes opp.
 *
 * `--prosjekt=` finnes fordi det normale tilfellet er at prosjektet er NYTT:
 * da peker `.env.local` fortsatt på det gamle, og uten overstyring ville
 * skriptet kjørt mot feil sted — eller mot ingenting.
 */
function prosjektRef(): string | null {
  const overstyrt = verdi('--prosjekt')
  if (overstyrt) return overstyrt
  const url = process.env.SUPABASE_URL
  if (!url) return null
  try {
    return new URL(url).host.split('.')[0]
  } catch {
    return null
  }
}

async function main() {
  const steg = samleSteg(KUN_MIGRASJONER)
  const ref = prosjektRef()

  console.log('TilbudsMaskinen — oppsett av database\n')
  console.log(`Prosjekt:  ${ref ?? '(ikke oppgitt)'}`)
  console.log(`Filer:     ${steg.length}${KUN_MIGRASJONER ? ' (schema.sql hoppet over)' : ''}`)
  for (const s of steg) {
    console.log(`             ${s.navn.padEnd(46)} ${String(s.sql.length).padStart(6)} tegn`)
  }

  if (TORT) {
    console.log('\n--tort: ingenting ble kjørt.')
    return
  }

  if (!ref) {
    console.error(
      '\nMangler prosjekt. Oppgi --prosjekt=<ref> eller sett SUPABASE_URL i .env.local.\n' +
        'Ref-en er det første leddet i adressen: https://<ref>.supabase.co\n' +
        'Finnes prosjektet ikke ennå: npm run nyttprosjekt'
    )
    process.exit(1)
  }

  if (!TOKEN) {
    console.error(`\n${manglerTokenMelding()}`)
    process.exit(1)
  }

  console.log('\nKJØRER')
  if (!(await kjorSteg(ref, TOKEN, steg))) process.exit(1)

  const alt = await kontroller(ref, TOKEN)
  console.log(alt ? '\nDatabasen er satt opp.\n' : '\nNoe mangler — se kontrollen over.\n')
  console.log(GJENSTAAR)
  if (!alt) process.exit(1)
}

main().catch((err) => {
  console.error('\nUventet feil:', err instanceof Error ? err.message : err)
  process.exit(1)
})
