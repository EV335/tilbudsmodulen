import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { oppdaterTilbud, slettTilbud } from '@/lib/historikk'
import { TilbudInput, TilbudResult } from '@/lib/ai'

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

    const oppdatert = await oppdaterTilbud(session.user.id, params.id, body.input, body.resultat)
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
