// Felles maskineri mot Supabase Management API.
//
// Bor her og ikke i det ene skriptet som trengte det først: `oppsett.ts` kjører
// SQL mot et prosjekt som finnes, `nyttprosjekt.ts` oppretter først og kjører
// så nøyaktig de samme filene i nøyaktig samme rekkefølge. Hadde den andre
// skrevet sin egen kopi av stegene, ville rekkefølgen kunnet komme i utakt den
// dagen en migrasjon legges til — og det er en feil som først viser seg som en
// manglende kolonne i produksjon.
//
// Hvorfor Management API og ikke service_role: service_role-nøkkelen går mot
// PostgREST, som er et data-API. Det kjører ikke DDL.

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const API = 'https://api.supabase.com/v1'

/** Leser .env.local uten å overskrive det som allerede står i skallet. */
export function lesEnvLokal(): void {
  let innhold: string
  try {
    innhold = readFileSync('.env.local', 'utf-8')
  } catch {
    return
  }
  for (const linje of innhold.split('\n')) {
    const treff = linje.match(/^([A-Z_]+)=(.*)$/)
    if (treff && !process.env[treff[1]]) {
      process.env[treff[1]] = treff[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

export type Svar<T> = { ok: true; data: T } | { ok: false; feil: string }

/**
 * Kall mot Management API-et.
 *
 * Feilteksten plukkes ut av kroppen, ikke av statuskoden. En bar «400 Bad
 * Request» sier ingenting om hvilken SQL-setning som røk, og det er nettopp
 * den opplysningen man trenger når åtte filer kjøres etter hverandre.
 */
export async function api<T = unknown>(
  sti: string,
  token: string,
  init?: { metode?: string; kropp?: unknown }
): Promise<Svar<T>> {
  let res: Response
  try {
    res = await fetch(`${API}${sti}`, {
      method: init?.metode ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: init?.kropp === undefined ? undefined : JSON.stringify(init.kropp),
    })
  } catch (err) {
    return { ok: false, feil: `nådde ikke api.supabase.com (${err instanceof Error ? err.message : err})` }
  }

  const tekst = await res.text()

  if (res.ok) {
    try {
      return { ok: true, data: JSON.parse(tekst) as T }
    } catch {
      return { ok: true, data: tekst as unknown as T }
    }
  }

  let melding = `${res.status} ${res.statusText}`
  try {
    const j = JSON.parse(tekst) as { message?: string; error?: string }
    if (j.message || j.error) melding = String(j.message ?? j.error)
  } catch {
    if (tekst) melding += ` — ${tekst.slice(0, 400)}`
  }
  return { ok: false, feil: melding }
}

export function kjorSql(ref: string, sql: string, token: string): Promise<Svar<unknown>> {
  return api(`/projects/${ref}/database/query`, token, { metode: 'POST', kropp: { query: sql } })
}

// --- Filene, i rekkefølge ----------------------------------------------------

export interface Steg {
  navn: string
  sti: string
  sql: string
}

/**
 * Oppsettfilene i kjørerekkefølge.
 *
 * Filnavnene er datoprefikset, så vanlig tekstsortering ER kronologisk.
 * Rekkefølgen er ikke pynt: 20260810 omnummererer fakturaer som 20260808
 * opprettet, og 20260825 utvider en tabell 20260808 laget.
 */
export function samleSteg(kunMigrasjoner = false): Steg[] {
  const steg: Steg[] = []

  if (!kunMigrasjoner) {
    const sti = join('supabase', 'schema.sql')
    steg.push({ navn: 'schema.sql', sti, sql: readFileSync(sti, 'utf-8') })
  }

  for (const fil of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) {
    const sti = join('migrations', fil)
    steg.push({ navn: fil, sti, sql: readFileSync(sti, 'utf-8') })
  }

  return steg
}

/** Kjører stegene i rekkefølge og stopper på første feil. */
export async function kjorSteg(ref: string, token: string, steg: Steg[]): Promise<boolean> {
  for (const s of steg) {
    process.stdout.write(`  ${s.navn.padEnd(46)} `)
    const svar = await kjorSql(ref, s.sql, token)

    if (!svar.ok) {
      console.log('FEIL')
      console.error(`\n${svar.feil}\n`)
      // Sikringsvakten i DEL -1 i schema.sql slår ut nøyaktig slik. Den er
      // ikke en feil i skriptet — den er grunnen til at ingen data gikk tapt.
      if (svar.feil.includes('STOPP: databasen er allerede i bruk')) {
        console.error(
          'Dette er sikringsvakten i supabase/schema.sql, ikke en feil i oppsettet.\n' +
            'Prosjektet har brukere fra før, og schema.sql ville slettet alt.\n\n' +
            'Skal du bare legge til det nyeste: npm run oppsett -- --kun-migrasjoner'
        )
      }
      console.error(`\nStoppet på ${s.sti}. Ingenting etter den er kjørt.`)
      return false
    }

    console.log('ok')
  }
  return true
}

// --- Kontroll ----------------------------------------------------------------

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
 * Ikke overflødig: Management API-et svarer 200 på en kjøring som ikke gjorde
 * noe, og en migrasjon som stilletiende ikke slo gjennom oppdages ellers først
 * når appen er i bruk.
 */
export async function kontroller(ref: string, token: string): Promise<boolean> {
  const svar = await kjorSql(
    ref,
    `select table_name, column_name from information_schema.columns where table_schema = 'public'`,
    token
  )
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

// --- Felles hjelp ------------------------------------------------------------

export function manglerTokenMelding(): string {
  return (
    'Mangler SUPABASE_ACCESS_TOKEN.\n\n' +
    'service_role-nøkkelen duger ikke — den går mot PostgREST, som ikke kjører DDL.\n' +
    'Lag et personal access token på https://supabase.com/dashboard/account/tokens\n' +
    'og legg det i .env.local som:\n\n' +
    '  SUPABASE_ACCESS_TOKEN=sbp_...\n\n' +
    'Lim det i fila, ikke i en chat. Skriptene skriver det aldri ut.'
  )
}

export const GJENSTAAR =
  'Gjenstår, og skriptet kan ikke gjøre det for deg:\n' +
  '  1. Legg de nye nøklene inn i Vercel (Settings > Environment Variables)\n' +
  '  2. Storage-bucket «logos» må settes offentlig (Dashboard > Storage)\n' +
  '  3. Redeploy i Vercel, ellers kjører appen videre på de gamle nøklene'
