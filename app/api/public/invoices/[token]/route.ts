import { NextRequest, NextResponse } from 'next/server'
import { hentFakturaByPublicToken } from '@/lib/payments'
import { hentFirmaForBruker } from '@/lib/invoice'

// MÅ være dynamisk. Next.js cacher GET-route-handlers statisk med mindre de
// leser cookies/headers — og denne har med vilje ingen sesjon, så uten dette
// ville en kunde som nettopp betalte fortsatt se "Utkast"/"Ubetalt" (og i
// verste fall betale to ganger). De innloggede /api/invoices-rutene slipper
// unna dette kun fordi getServerSession() leser cookies.
export const dynamic = 'force-dynamic'
// supabase-js kaller global fetch, som Next.js patcher og cacher til disk
// (.next/cache) — den cachen overlever til og med en server-restart.
export const fetchCache = 'force-no-store'
export const revalidate = 0

// Ingen sesjon her — public_token (uuid, uggjettbar) ER autentiseringen.
// Brukes av /betal/[token] slik at en sluttkunde uten konto kan se og
// betale egen faktura.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const faktura = await hentFakturaByPublicToken(params.token)
  if (!faktura) {
    return NextResponse.json({ error: 'Fant ikke faktura.' }, { status: 404 })
  }

  const firma = await hentFirmaForBruker(faktura.user_id)

  return NextResponse.json({ ...faktura, firma })
}
