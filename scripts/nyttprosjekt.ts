// Oppretter et NYTT Supabase-prosjekt og setter opp hele databasen i én
// kommando. Kjør med:
//
//   npm run nyttprosjekt                       se planen, opprett ingenting
//   npm run nyttprosjekt -- --ja               opprett og kjør
//   npm run nyttprosjekt -- --navn=... --ja    eget navn
//   npm run nyttprosjekt -- --region=eu-central-1 --ja
//
// HVORFOR DEN FINNES: 1. oktober 2026 var prosjektet borte, og `oppsett.ts`
// kunne bare kjøre SQL mot et prosjekt som allerede fantes. Det som gjensto for
// hånd — opprett prosjekt, vent på provisjonering, hent nøklene, skriv dem inn
// — er fire steg der tre av dem er venting og avskrift. Avskrift av nøkler er
// dessuten det eneste stedet i hele oppsettet der en tastefeil gir en app som
// starter og så feiler først ved første databasekall.
//
// Den oppretter ALDRI noe uten `--ja`. Uten flagget skriver den bare planen.
//
// SQL-en kjøres av nøyaktig de samme funksjonene som `oppsett.ts` bruker
// (scripts/supabase-admin.ts), slik at de to aldri kan komme i utakt om
// rekkefølgen.

import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import {
  api,
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

const JA = har('--ja')
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const NAVN = verdi('--navn') ?? 'tilbudsmaskinen'
// eu-north-1 er Stockholm — nærmeste region til Norge, og innenfor EØS, som
// gjør personvernspørsmålet enklere når det ligger kundedata i basen.
const REGION = verdi('--region') ?? 'eu-north-1'

interface Org { id: string; name: string }
interface Prosjekt { id: string; name: string; status?: string; region?: string }
interface Nokkel { name: string; api_key: string }

/** Databasepassord. Skrives til .env.local, aldri til skjermen. */
function lagPassord(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Legger nøkler inn i .env.local — erstatter linja hvis den finnes.
 *
 * Avskrift for hånd er det eneste stedet i oppsettet der en tastefeil gir en
 * app som starter helt fint og så feiler først ved første databasekall. En
 * sikkerhetskopi tas, fordi fila inneholder nøkler som ikke ligger noe annet
 * sted.
 */
function skrivEnv(verdier: Record<string, string>): string {
  let innhold = ''
  try {
    innhold = readFileSync('.env.local', 'utf-8')
  } catch {
    /* fila finnes ikke ennå — da lager vi den */
  }

  if (innhold) {
    const kopi = `.env.local.backup-${new Date().toISOString().slice(0, 10)}`
    writeFileSync(kopi, innhold, 'utf-8')
    console.log(`  sikkerhetskopi: ${kopi}`)
  }

  let ut = innhold
  for (const [nokkel, v] of Object.entries(verdier)) {
    const linje = `${nokkel}=${v}`
    const regex = new RegExp(`^${nokkel}=.*$`, 'm')
    ut = regex.test(ut) ? ut.replace(regex, linje) : `${ut.replace(/\n*$/, '')}\n${linje}\n`
  }
  writeFileSync('.env.local', ut, 'utf-8')
  return '.env.local'
}

/** Venter til prosjektet er oppe. Provisjonering tar typisk ett til tre minutter. */
async function ventPaaProsjekt(ref: string, token: string): Promise<boolean> {
  const MAKS_FORSOK = 40
  const INTERVALL_MS = 10_000

  for (let i = 1; i <= MAKS_FORSOK; i++) {
    const svar = await api<Prosjekt>(`/projects/${ref}`, token)
    const status = svar.ok ? svar.data.status ?? 'ukjent' : `(${svar.feil})`
    process.stdout.write(`\r  venter... ${status}  [${i}/${MAKS_FORSOK}]          `)

    if (svar.ok && svar.data.status === 'ACTIVE_HEALTHY') {
      console.log('\r  prosjektet er oppe.                                   ')
      return true
    }
    await new Promise((r) => setTimeout(r, INTERVALL_MS))
  }

  console.log('\n  ga opp å vente. Prosjektet kan fortsatt komme opp — sjekk dashbordet,')
  console.log('  og kjør deretter: npm run oppsett -- --prosjekt=' + ref)
  return false
}

async function main() {
  const steg = samleSteg()

  console.log('TilbudsMaskinen — nytt Supabase-prosjekt\n')
  console.log('PLANEN')
  console.log(`  1. Opprett prosjekt «${NAVN}» i region ${REGION} (free)`)
  console.log('  2. Vent til det er ACTIVE_HEALTHY')
  console.log(`  3. Kjør ${steg.length} SQL-filer i rekkefølge`)
  console.log('  4. Hent nye nøkler og skriv dem til .env.local')
  console.log('  5. Kontroller at tabellene og kolonnene står der\n')
  for (const s of steg) console.log(`     ${s.navn}`)

  if (!TOKEN) {
    console.error(`\n${manglerTokenMelding()}`)
    process.exit(1)
  }

  if (!JA) {
    console.log(
      '\nIngenting er opprettet. Dette provisjonerer en ekte database —\n' +
        'kjør med --ja når du vil at det skal skje:\n\n' +
        `  npm run nyttprosjekt -- --navn=${NAVN} --ja`
    )
    return
  }

  // --- 1. organisasjon ---
  const orger = await api<Org[]>('/organizations', TOKEN)
  if (!orger.ok) {
    console.error(`\nFikk ikke hentet organisasjoner: ${orger.feil}`)
    process.exit(1)
  }
  if (!orger.data.length) {
    console.error('\nIngen organisasjon på kontoen. Opprett én i Supabase-dashbordet først.')
    process.exit(1)
  }
  // Én organisasjon er det normale. Er det flere, må valget være bevisst —
  // prosjektet havner på en faktura, og gjetting her er feil sted å gjette.
  if (orger.data.length > 1 && !verdi('--org')) {
    console.error('\nFlere organisasjoner. Velg én med --org=<id>:')
    for (const o of orger.data) console.error(`  ${o.id}  ${o.name}`)
    process.exit(1)
  }
  const orgId = verdi('--org') ?? orger.data[0].id
  console.log(`\n  organisasjon: ${orger.data.find((o) => o.id === orgId)?.name ?? orgId}`)

  // --- 2. opprett ---
  const passord = lagPassord()
  const opprettet = await api<Prosjekt>('/projects', TOKEN, {
    metode: 'POST',
    kropp: { name: NAVN, organization_id: orgId, region: REGION, db_pass: passord, plan: 'free' },
  })
  if (!opprettet.ok) {
    console.error(`\nKlarte ikke å opprette prosjektet: ${opprettet.feil}`)
    process.exit(1)
  }
  const ref = opprettet.data.id
  console.log(`  opprettet: ${ref}`)

  if (!(await ventPaaProsjekt(ref, TOKEN))) process.exit(1)

  // --- 3. SQL ---
  console.log('\nKJØRER')
  if (!(await kjorSteg(ref, TOKEN, steg))) process.exit(1)

  // --- 4. nøkler ---
  const nokler = await api<Nokkel[]>(`/projects/${ref}/api-keys`, TOKEN)
  const url = `https://${ref}.supabase.co`
  const skriv: Record<string, string> = { SUPABASE_URL: url }

  if (nokler.ok) {
    const service = nokler.data.find((n) => n.name === 'service_role')?.api_key
    const anon = nokler.data.find((n) => n.name === 'anon')?.api_key
    if (service) skriv.SUPABASE_SERVICE_ROLE_KEY = service
    if (anon) skriv.SUPABASE_PUBLISHABLE_KEY = anon
  }
  skriv.SUPABASE_DB_PASSWORD = passord

  console.log('\nNØKLER')
  skrivEnv(skriv)
  console.log(`  skrevet til .env.local: ${Object.keys(skriv).join(', ')}`)
  if (!nokler.ok) {
    console.log(`  ⚠ fikk ikke hentet API-nøklene (${nokler.feil}) — hent dem i dashbordet`)
  }

  // --- 5. kontroll ---
  const alt = await kontroller(ref, TOKEN)

  console.log(`\nProsjekt: ${url}`)
  console.log(alt ? '\nDatabasen er satt opp.\n' : '\nNoe mangler — se kontrollen over.\n')
  console.log(GJENSTAAR)
  if (!alt) process.exit(1)
}

main().catch((err) => {
  console.error('\nUventet feil:', err instanceof Error ? err.message : err)
  process.exit(1)
})
