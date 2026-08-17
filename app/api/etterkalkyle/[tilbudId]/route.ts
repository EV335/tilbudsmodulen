import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { erUuid } from '@/lib/uuid'
import { slettEtterkalkyle, MANGLER_TABELL } from '@/lib/etterkalkyleLager'

export async function DELETE(_req: Request, { params }: { params: { tilbudId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!erUuid(params.tilbudId)) {
    return NextResponse.json({ error: 'Ugyldig tilbud-id.' }, { status: 400 })
  }

  try {
    // Sletting er scopet på user_id, så en annens registrering blir ikke rørt.
    await slettEtterkalkyle(session.user.id, params.tilbudId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feil i DELETE /api/etterkalkyle/[tilbudId]:', err)
    const melding = err instanceof Error && err.message === MANGLER_TABELL
      ? MANGLER_TABELL
      : 'Klarte ikke å slette etterkalkylen.'
    return NextResponse.json({ error: melding }, { status: 500 })
  }
}
