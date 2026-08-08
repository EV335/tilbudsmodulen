import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { slettTilbud } from '@/lib/historikk'

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
