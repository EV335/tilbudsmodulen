import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentFaktura, klargjorPaymentIntent } from '@/lib/payments'

// Bedrift-flyt: PaymentIntent + Stripe Customer, for bruk med Stripe Elements
// på klienten (kort eller lagret betalingsmetode).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { invoiceId?: string }
    if (!body.invoiceId) {
      return NextResponse.json({ error: 'Mangler invoiceId.' }, { status: 400 })
    }

    const faktura = await hentFaktura(session.user.id, body.invoiceId)
    if (!faktura) {
      return NextResponse.json({ error: 'Fant ikke faktura.' }, { status: 404 })
    }
    if (!faktura.kunde) {
      return NextResponse.json({ error: 'Fakturaen mangler kundeinformasjon.' }, { status: 400 })
    }
    if (faktura.status === 'paid') {
      return NextResponse.json({ error: 'Fakturaen er allerede betalt.' }, { status: 400 })
    }

    const clientSecret = await klargjorPaymentIntent(faktura)

    return NextResponse.json({ clientSecret })
  } catch (err) {
    console.error('Feil i /api/payments/create-payment-intent:', err)
    const message = err instanceof Error ? err.message : 'Klarte ikke å starte betaling.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
