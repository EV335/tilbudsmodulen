import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentPrissatser, lagrePrissats, erGyldigOperasjon } from '@/lib/prissatser'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await hentPrissatser(session.user.id))
  } catch (err) {
    console.error('Feil i GET /api/priser:', err)
    return NextResponse.json({ error: 'Klarte ikke å hente satser.' }, { status: 500 })
  }
}

// Tallgrenser: en operasjon som tar over 500 timer per enhet, eller koster over
// en million i materialer per enhet, er en tastefeil — ikke en jobb.
const MAKS_TIMER = 500
const MAKS_MATERIAL = 1_000_000

function lesTall(verdi: unknown, maks: number): number | null | 'ugyldig' {
  if (verdi === null || verdi === undefined || verdi === '') return null
  const tall = Number(verdi)
  if (!Number.isFinite(tall) || tall < 0 || tall > maks) return 'ugyldig'
  return tall
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      operasjonId?: string
      timerPerEnhet?: unknown
      materialPerEnhet?: unknown
    }

    const operasjonId = String(body.operasjonId ?? '')
    if (!erGyldigOperasjon(operasjonId)) {
      return NextResponse.json({ error: `Ukjent arbeidsoperasjon: ${operasjonId}` }, { status: 400 })
    }

    const timer = lesTall(body.timerPerEnhet, MAKS_TIMER)
    const material = lesTall(body.materialPerEnhet, MAKS_MATERIAL)

    if (timer === 'ugyldig' || material === 'ugyldig') {
      return NextResponse.json(
        { error: 'Satsene må være positive tall innenfor rimelige grenser.' },
        { status: 400 }
      )
    }

    await lagrePrissats(session.user.id, operasjonId, timer, material)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feil i PUT /api/priser:', err)
    return NextResponse.json({ error: 'Klarte ikke å lagre satsen.' }, { status: 500 })
  }
}
