// Setter opp et TOMT Supabase-prosjekt fra bunnen: schema.sql, deretter alle
// migrasjonene i datorekkefølge. Kjør med:
//
//   npm run oppsett -- --tort                 se hva som ville blitt kjørt
//   npm run oppsett                           kjør mot prosjektet i .env.local
//   npm run oppsett -- --prosjekt=abcd1234    kjør mot et annet prosjekt
//   npm run oppsett -- --kun-migrasjoner      hopp over schema.sql
//
// HVORFOR DEN FINNES: 1. oktober 2026 var Supabase-prosjektet borte —
// `zculzyarnamvrmmhibhn.supabase.co` ga «Non-existent domain», og alt i
// produksjon som rørte databasen svarte 500. Å sette opp på nytt betyr å kjøre
// åtte SQL-filer i riktig rekkefølge, og å gjøre det for hånd i SQL Editor er
// åtte sjanser til å hoppe over én.
//
// HVORFOR MANAGEMENT API OG IKKE service_role: service_role-nøkkelen går kun
// mot PostgREST, som er et data-API. Det kjører ikke `create table`. DDL krever
// enten et personal access token (som her) eller databasepassordet.
//
// SIKKERHET: skriptet har INGEN egen vakt mot å slette data. Den ligger der den
// hører hjemme — i `DEL -1` i supabase/schema.sql, som avbryter hele filen hvis
// `public.users` har rader. To vakter som skal si det samme er to vakter som
// kan komme i utakt; denne fila videreformidler bare feilmeldingen fra den ene.

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// --- Miljø ------------------------------------------------------------------

function lesEnvLokal(): void {
  let innhold: string
  try {
    innhold = readFileSync('.env.local', 'utf-8')
  } catch {
    return // helt gyldig: verdiene kan komme fra skallet i stedet
  }
  for (const linje of innhold.split('\n')) {
    const treff = linje.match(/^([A-Z_]+)=(.*)$/)
    if (treff && !process.env[treff[1]]) {
      process.env[treff[1]] = treff[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

const flagg = process.argv.slice(2)
const har = (navn: string) => flagg.includes(navn)
const verdi = (navn: string) =>
  flagg.find((f) => f.startsWith(`${navn}=`))?.slice(navn.length + 1)

lesEnvLokal()

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

// --- Filene, i rekkefølge ----------------------------------------------------

interface Steg {
  navn: string
  sti: string
  sql: string
}

function samleSteg(): Steg[] {
  const steg: Steg[] = []

  if (!KUN_MIGRASJONER) {
    const sti = join('supabase', 'schema.sql')
    steg.push({ navn: 'schema.sql', sti, sql: readFileSync(sti, 'utf-8') })
  }

  // Filnavnene er datoprefikset (20260808_...), så vanlig tekstsortering ER
  // kronologisk rekkefølge. Rekkefølgen er ikke pynt: 20260810 omnummererer
  // fakturaer som 20260808 opprettet, og 20260825 utvider en tabell 20260808
  // laget.
  const mapper = readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const fil of mapper) {
    const sti = join('migrations', fil)
    steg.push({ navn: fil, sti, sql: readFileSync(sti, 'utf-8') })
  }

  return steg
}

// --- Management API ----------------------------------------------------------

async function kjorSql(ref: string, sql: string): Promise<{ ok: true; data: unknown } | { ok: false; feil: string }> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })

  const tekst = await res.text()
  if (res.ok) {
    try {
      return { ok: true, data: JSON.parse(tekst) }
    } catch {
      return { ok: true, data: tekst }
    }
  }

  // Postgres-feilen ligger i kroppen. Den er det eneste nyttige her — en bar
  // «400 Bad Request» sier ingenting om hvilken setning som røk.
  let melding = `${res.status} ${res.statusText}`
  try {
    const j = JSON.parse(tekst) as { message?: string; error?: string }
    if (j.message || j.error) melding = String(j.message ?? j.error)
  } catch {
    if (tekst) melding += ` — ${tekst.slice(0, 400)}`
  }
  return { ok: false, feil: melding }
}

// --- Kontroll etterpå --------------------------------------------------------

const FORVENTET: { tabell: string; kolonne?: string }[] = [
  { tabell: 'users' },
  { tabell: 'firma' },
  { tabell: 'tilbud' },
  { tabell: 'customers' },
  { tabell: 'invoices' },
  { tabell: 'payments' },
  { tabell: 'prissatser' },
  { tabell: 'etterkalkyler' },
  { tabell: 'invoices', kolonne: 'public_token' },
  { tabell: 'invoices', kolonne: 'mva_sats' },
  { tabell: 'firma', kolonne: 'standard_timepris' },
  { tabell: 'firma', kolonne: 'standard_fag' },
]

/**
 * Sjekker at det faktisk står igjen det som skulle stå igjen.
 *
 * Grunnen til at dette ikke er overflødig: Management API-et svarer 200 på en
 * kjøring som ikke gjorde noe, og en migrasjon som stilletiende ikke slo
 * gjennom er akkurat den feilen som oppdages først når appen er i bruk.
 */
async function kontroller(ref: string): Promise<boolean> {
  const sql = `select table_name, column_name from information_schema.columns where table_schema = 'public'`
  const svar = await kjorSql(ref, sql)
  if (!svar.ok) {
    console.log(`\nKontrollen kunne ikke kjøres: ${svar.feil}`)
    return false
  }

  const rader = (svar.data as { table_name: string; column_name: string }[]) ?? []
  const tabeller = new Set(rader.map((r) => r.table_name))
  const kolonner = new Set(rader.map((r) => `${r.table_name}.${r.column_name}`))

  console.log('\nKONTROLL')
  let alt = true
  for (const f of FORVENTET) {
    const navn = f.kolonne ? `${f.tabell}.${f.kolonne}` : f.tabell
    const finnes = f.kolonne ? kolonner.has(navn) : tabeller.has(f.tabell)
    if (!finnes) alt = false
    console.log(`  ${finnes ? 'ok  ' : 'MANGLER'}  ${navn}`)
  }
  return alt
}

// --- Kjøring -----------------------------------------------------------------

async function main() {
  const steg = samleSteg()
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
        'Ref-en er det første leddet i adressen: https://<ref>.supabase.co'
    )
    process.exit(1)
  }

  if (!TOKEN) {
    console.error(
      '\nMangler SUPABASE_ACCESS_TOKEN.\n\n' +
        'service_role-nøkkelen duger ikke — den går mot PostgREST, som ikke kjører DDL.\n' +
        'Lag et personal access token på https://supabase.com/dashboard/account/tokens\n' +
        'og legg det i .env.local som:\n\n' +
        '  SUPABASE_ACCESS_TOKEN=sbp_...\n\n' +
        'Lim det i fila, ikke i en chat. Skriptet skriver det aldri ut.'
    )
    process.exit(1)
  }

  console.log('\nKJØRER')
  for (const s of steg) {
    process.stdout.write(`  ${s.navn.padEnd(46)} `)
    const svar = await kjorSql(ref, s.sql)

    if (!svar.ok) {
      console.log('FEIL')
      console.error(`\n${svar.feil}\n`)
      // Vakten i schema.sql sin DEL -1 slår ut nøyaktig slik. Den er ikke en
      // feil i skriptet — den er den som gjør at ingen data gikk tapt.
      if (svar.feil.includes('STOPP: databasen er allerede i bruk')) {
        console.error(
          'Dette er sikringsvakten i supabase/schema.sql, ikke en feil i oppsettet.\n' +
            'Prosjektet har brukere fra før, og schema.sql ville slettet alt.\n\n' +
            'Skal du bare legge til det nyeste: npm run oppsett -- --kun-migrasjoner'
        )
      }
      console.error(`\nStoppet på ${s.sti}. Ingenting etter den er kjørt.`)
      process.exit(1)
    }

    console.log('ok')
  }

  const alt = await kontroller(ref)

  console.log(
    alt
      ? '\nDatabasen er satt opp.\n\nGjenstår, og skriptet kan ikke gjøre det for deg:\n' +
          `  1. SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY — i .env.local OG i Vercel\n` +
          '  2. Storage-bucket «logos» må være offentlig (Dashboard > Storage)\n' +
          '  3. Redeploy i Vercel, ellers kjører appen videre på de gamle nøklene'
      : '\nNoe mangler. Se kontrollen over — kjør filen som dekker det på nytt.'
  )
  if (!alt) process.exit(1)
}

main().catch((err) => {
  console.error('\nUventet feil:', err instanceof Error ? err.message : err)
  process.exit(1)
})
