import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentFaktura } from '@/lib/payments'

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
