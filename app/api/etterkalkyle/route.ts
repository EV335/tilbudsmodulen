import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentTilbud } from '@/lib/historikk'
import { erUuid } from '@/lib/uuid'
import {
  hentEtterkalkyler,
  lagreEtterkalkyle,
  linjerFraResultat,
  MANGLER_TABELL,
} from '@/lib/etterkalkyleLager'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await hentEtterkalkyler(session.user.id))
  } catch (err) {
    console.error('Feil i GET /api/etterkalkyle:', err)
    return NextResponse.json({ error: 'Klarte ikke å hente etterkalkyler.' }, { status: 500 })
  }
}

// Samme grenser som check-constrainten i migrasjonen. Står de to fra hverandre,
// er det databasen som avviser — og da får brukeren en Postgres-melding i
// stedet for en setning han kan gjøre noe med.
const MAKS_TIMER = 100_000
const MAKS_MATERIAL = 10_000_000
const MAKS_NOTAT = 2000

function lesTall(verdi: unknown, maks: number): number | null | 'ugyldig' {
  if (verdi === null || verdi === undefined) return null
  if (typeof verdi === 'string' && verdi.trim() === '') return null
  // Number([]) og Number(true) gir 0 og 1. Bare tall og tallstrenger godtas.
  if (typeof verdi !== 'number' && typeof verdi !== 'string') return 'ugyldig'
  const tall = Number(verdi)
  if (!Number.isFinite(tall) || tall < 0 || tall > maks) return 'ugyldig'
  return tall
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      tilbudId?: unknown
      faktiskeTimer?: unknown
      faktiskMaterialKr?: unknown
      notat?: unknown
    }

    if (!erUuid(body.tilbudId)) {
      return NextResponse.json({ error: 'Ugyldig tilbud-id.' }, { status: 400 })
    }

    const timer = lesTall(body.faktiskeTimer, MAKS_TIMER)
    if (timer === 'ugyldig' || timer === null || timer <= 0) {
      return NextResponse.json(
        { error: 'Oppgi hvor mange timer jobben faktisk tok — et positivt tall.' },
        { status: 400 }
      )
    }

    const material = lesTall(body.faktiskMaterialKr, MAKS_MATERIAL)
    if (material === 'ugyldig') {
      return NextResponse.json({ error: 'Materialkostnaden må være et positivt beløp.' }, { status: 400 })
    }

    const notat =
      typeof body.notat === 'string' && body.notat.trim() !== ''
        ? body.notat.trim().slice(0, MAKS_NOTAT)
        : null

    // Eierskapssjekken. Den er ikke bare tilgangskontroll: upserten i
    // etterkalkyleLager treffer på tilbud_id alene, så uten denne kunne en
    // innlogget bruker skrevet over etterkalkylen til en annens jobb — og
    // samtidig flyttet raden over på seg selv.
    const tilbud = await hentTilbud(session.user.id, body.tilbudId)
    if (!tilbud) {
      return NextResponse.json({ error: 'Fant ikke tilbudet.' }, { status: 404 })
    }

    const lagret = await lagreEtterkalkyle(
      session.user.id,
      body.tilbudId,
      timer,
      material,
      notat,
      linjerFraResultat(tilbud.resultat)
    )
    return NextResponse.json(lagret)
  } catch (err) {
    console.error('Feil i POST /api/etterkalkyle:', err)
    // Kun vår egen tekst slipper ut til klienten. Postgres-meldinger hører
    // hjemme i serverloggen, ikke i grensesnittet.
    const melding = err instanceof Error && err.message === MANGLER_TABELL
      ? MANGLER_TABELL
      : 'Klarte ikke å lagre etterkalkylen.'
    return NextResponse.json({ error: melding }, { status: 500 })
  }
}
