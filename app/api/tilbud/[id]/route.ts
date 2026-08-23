import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentTilbud, oppdaterTilbud, slettTilbud } from '@/lib/historikk'
import { TilbudInput, TilbudResult, verifiserPris } from '@/lib/ai'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tilbud = await hentTilbud(session.user.id, params.id)
    if (!tilbud) {
      return NextResponse.json({ error: 'Fant ikke tilbud.' }, { status: 404 })
    }
    return NextResponse.json(tilbud)
  } catch (err) {
    console.error('Feil i GET /api/tilbud/[id]:', err)
    return NextResponse.json({ error: 'Klarte ikke å hente tilbud.' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { input: TilbudInput; resultat: TilbudResult }

    if (!body.input || !body.resultat) {
      return NextResponse.json({ error: 'Mangler input eller resultat.' }, { status: 400 })
    }

    // Oppdatering: her kan tilbudet vaere eldre enn linjemodellen, og da finnes
    // det ingen linjer a kontrollere prisen mot. Se verifiserPris.
    const prisfeil = verifiserPris(body.input, body.resultat, { tillatUtenLinjer: true })
    if (prisfeil) {
      console.error('Avviste lagring av tilbud:', prisfeil)
      return NextResponse.json({ error: prisfeil }, { status: 400 })
    }

    const oppdatert = await oppdaterTilbud(session.user.id, params.id, body.input, body.resultat)
    if (!oppdatert) {
      return NextResponse.json({ error: 'Fant ikke tilbudet.' }, { status: 404 })
    }
    return NextResponse.json(oppdatert)
  } catch (err) {
    console.error('Feil i PATCH /api/tilbud/[id]:', err)
    return NextResponse.json({ error: 'Klarte ikke å oppdatere tilbud.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await slettTilbud(session.user.id, params.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feil i DELETE /api/tilbud/[id]:', err)
    return NextResponse.json({ error: 'Klarte ikke å slette tilbud.' }, { status: 500 })
  }
}
