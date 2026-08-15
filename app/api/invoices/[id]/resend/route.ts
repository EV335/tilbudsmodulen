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
    if (faktura.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Fakturaen er kansellert og kan ikke sendes til kunden.' },
        { status: 400 }
      )
    }

    const { pdfUrl, epost } = await genererLagreOgSendFaktura(faktura)

    // PDF-en er laget og lagret uansett, så pdfUrl blir med i begge svarene.
    // Men gikk ikke e-posten, skal ruten IKKE svare ok: dette er den manuelle
    // utveien håndverkeren bruker nettopp fordi kunden ikke fikk fakturaen.
    // Et falskt «Sendt på nytt» her er verre enn ingen knapp i det hele tatt.
    if (!epost.sendt) {
      return NextResponse.json(
        { error: epost.grunn, pdfUrl },
        { status: epost.kanProeveIgjen ? 502 : 400 }
      )
    }

    return NextResponse.json({ ok: true, pdfUrl })
  } catch (err) {
    console.error('Feil i POST /api/invoices/[id]/resend:', err)
    return NextResponse.json({ error: 'Klarte ikke å sende faktura på nytt.' }, { status: 500 })
  }
}
