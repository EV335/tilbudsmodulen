// Server-only. Holder Supabase-prosjektet i live, og sier fra når det ikke er.
//
// Bakgrunn: free-planen pauser et prosjekt etter rundt én uke uten aktivitet.
// Det skjedde i slutten av august 2026, og appen lå nede i fem uker uten at
// noen merket det. Grunnen til at ingen merket det er verdt å feste seg ved:
// forsiden og /logg-inn er statiske og svarte 200 hele tiden. Det som var dødt
// var alt som rører databasen — altså betalingslenken en kunde kan ha
// liggende i innboksen i flere uker før han bruker den.
//
// To ting løses her, og de er ikke det samme:
//
//   1. Et daglig oppslag mot databasen holder prosjektet aktivt.
//      Planlagt i vercel.json, utført av app/api/cron/holdliv.
//   2. Feiler oppslaget, går det e-post. Uten punkt 2 ville neste pause vært
//      like usynlig som den forrige: en cron-jobb som slutter å virke sier
//      ingenting av seg selv, og det er nettopp i det tilfellet basen pauses.
//
// Punkt 1 uten punkt 2 er derfor en halv løsning — den fjerner den vanligste
// årsaken, og lar den stille feilmodusen stå igjen.

import nodemailer from 'nodemailer'
import { lesTilgangsliste } from '@/lib/tilgang'
import { appUrl } from '@/lib/env'

export type Livssjekk =
  | { oppe: true; ms: number }
  | { oppe: false; feil: string; ms: number }

// ---------------------------------------------------------------------------
// Hvem varselet går til
// ---------------------------------------------------------------------------

/**
 * `VARSEL_EPOST` om den er satt, ellers første konkrete adresse i
 * `ALLOWED_EMAILS`.
 *
 * Fallbacken er der med vilje: er den ikke, må man huske å sette ÉN
 * miljøvariabel mer for at varslingen skal virke — og glemmer man den, er
 * resultatet akkurat den tause feilen dette skulle fjerne.
 *
 * Men den er nest best, ikke god: `ALLOWED_EMAILS` inneholder kollegaer, og
 * rekkefølgen i den er tilfeldig. Treffer fallbacken en kollega, får han et
 * varsel han ikke kan gjøre noe med. Derfor sier docs/deploy.md at
 * `VARSEL_EPOST` skal settes — fallbacken skal berge varslingen, ikke være
 * oppsettet.
 *
 * Domeneregler (`@firma.no`) hoppes over; de er ikke en adresse man kan
 * sende til.
 */
export function varselMottaker(
  varselEpost = process.env.VARSEL_EPOST,
  allowedEmails = process.env.ALLOWED_EMAILS
): string | null {
  const direkte = (varselEpost ?? '').trim()
  if (direkte) return direkte

  const liste = lesTilgangsliste(allowedEmails)
  if (liste.modus !== 'liste') return null
  return liste.adresser[0] ?? null
}

// ---------------------------------------------------------------------------
// Varselet
// ---------------------------------------------------------------------------

export type Varselresultat =
  | { sendt: true; til: string }
  | { sendt: false; grunn: string }

export function nedeMelding(sjekk: Extract<Livssjekk, { oppe: false }>): string {
  return [
    'Databasen til TilbudsMaskinen svarer ikke.',
    '',
    `Feil: ${sjekk.feil}`,
    `Tid brukt før det ga seg: ${sjekk.ms} ms`,
    `Appen: ${appUrl()}`,
    '',
    'Mest sannsynlige årsak er at Supabase-prosjektet er pauset. Free-planen',
    'pauser etter rundt én uke uten aktivitet, og da svarer alt som rører',
    'databasen med feil — mens forsiden og /logg-inn fortsatt laster som',
    'normalt. Gå til dashbordet i Supabase og trykk «Resume» hvis det står',
    'som pauset. Dataene er i behold.',
    '',
    'Merk at dette varselet kommer fra den daglige cron-jobben. Slutter den å',
    'virke, slutter varslene også — så en base som har vært nede en stund uten',
    'at det har kommet e-post er verdt å se nærmere på.',
  ].join('\n')
}

export async function sendNedevarsel(
  sjekk: Extract<Livssjekk, { oppe: false }>
): Promise<Varselresultat> {
  const til = varselMottaker()
  if (!til) {
    return {
      sendt: false,
      grunn:
        'Ingen mottaker. Sett VARSEL_EPOST, eller en konkret adresse i ALLOWED_EMAILS.',
    }
  }

  if (!process.env.EMAIL_SERVER_HOST) {
    return { sendt: false, grunn: 'EMAIL_SERVER_HOST er ikke satt — kan ikke sende e-post.' }
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  })

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: til,
      subject: 'TilbudsMaskinen: databasen svarer ikke',
      text: nedeMelding(sjekk),
    })
    return { sendt: true, til }
  } catch (err) {
    const grunn = err instanceof Error ? err.message : String(err)
    console.error('Klarte ikke å sende nedevarsel:', grunn)
    return { sendt: false, grunn }
  }
}

// ---------------------------------------------------------------------------
// Adgang til cron-ruten
// ---------------------------------------------------------------------------

/**
 * Vercel sender `Authorization: Bearer $CRON_SECRET` på cron-kall når
 * `CRON_SECRET` er satt i prosjektet.
 *
 * Er hemmeligheten IKKE satt, slipper kallet gjennom. Det er et bevisst valg,
 * og det er verdt å begrunne: alternativet — avvis alltid uten hemmelighet —
 * betyr at en glemt miljøvariabel gir 401 hver dag, ingen oppslag mot basen,
 * og en pause ingen får varsel om, siden varselet sendes av samme rute.
 * Feilen ville altså slått ut i presis den retningen vi prøver å unngå.
 * Ruten leser ingenting hemmelig og returnerer ingen data, så en åpen variant
 * er til å leve med; en satt hemmelighet håndheves fullt ut.
 */
export function cronGodkjent(
  authHeader: string | null,
  hemmelighet = process.env.CRON_SECRET
): boolean {
  const forventet = (hemmelighet ?? '').trim()
  if (!forventet) return true
  return (authHeader ?? '').trim() === `Bearer ${forventet}`
}
