import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentFaktura, kansellerFaktura } from '@/lib/payments'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const faktura = await hentFaktura(session.user.id, params.id)
    if (!faktura) {
      return NextResponse.json({ error: 'Fant ikke faktura.' }, { status: 404 })
    }
    return NextResponse.json(faktura)
  } catch (err) {
    console.error('Feil i GET /api/invoices/[id]:', err)
    return NextResponse.json({ error: 'Klarte ikke å hente faktura.' }, { status: 500 })
  }
}

// Eneste tillatte endring foreløpig er å kansellere. Beløp og kunde skal ikke
// kunne endres etter at fakturaen er opprettet — da er den allerede sendt eller
// har et betalingsforsøk knyttet til seg.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { status?: string }
    if (body.status !== 'cancelled') {
      return NextResponse.json({ error: 'Kun { "status": "cancelled" } støttes.' }, { status: 400 })
    }

    const faktura = await hentFaktura(session.user.id, params.id)
    if (!faktura) {
      return NextResponse.json({ error: 'Fant ikke faktura.' }, { status: 404 })
    }
    if (faktura.status === 'paid') {
      return NextResponse.json(
        { error: 'En betalt faktura kan ikke kanselleres. Refunder i Stripe og krediter i stedet.' },
        { status: 400 }
      )
    }

    const kansellert = await kansellerFaktura(session.user.id, params.id)
    if (!kansellert) {
      return NextResponse.json({ error: 'Klarte ikke å kansellere faktura.' }, { status: 409 })
    }
    return NextResponse.json(kansellert)
  } catch (err) {
    console.error('Feil i PATCH /api/invoices/[id]:', err)
    return NextResponse.json({ error: 'Klarte ikke å oppdatere faktura.' }, { status: 500 })
  }
}
