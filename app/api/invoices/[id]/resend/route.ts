import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentFaktura } from '@/lib/payments'
import { genererLagreOgSendFaktura } from '@/lib/invoice'

// Genererer PDF-en på nytt (fanger opp evt. endringer i firmaoppsett siden
// sist) og sender den til kunden igjen. Fungerer for alle fakturastatuser —
// nyttig for både "jeg mistet e-posten" og "fikk aldri PDF-en generert".
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const faktura = await hentFaktura(session.user.id, params.id)
    if (!faktura) {
      return NextResponse.json({ error: 'Fant ikke faktura.' }, { status: 404 })
    }

    const pdfUrl = await genererLagreOgSendFaktura(faktura)
    return NextResponse.json({ ok: true, pdfUrl })
  } catch (err) {
    console.error('Feil i POST /api/invoices/[id]/resend:', err)
    return NextResponse.json({ error: 'Klarte ikke å sende faktura på nytt.' }, { status: 500 })
  }
}
