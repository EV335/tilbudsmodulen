import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import {
  hentFakturaByPublicToken,
  hentEllerOpprettStripeCustomerId,
  settFakturaPaymentIntent,
} from '@/lib/payments'

// Public motstykke til /api/payments/create-payment-intent — autentiserer
// via faktura.public_token i stedet for en innlogget sesjon, slik at
// Bedrift-sluttkunden kan betale (Stripe Elements) via en delt lenke.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: string }
    if (!body.token) {
      return NextResponse.json({ error: 'Mangler token.' }, { status: 400 })
    }

    const faktura = await hentFakturaByPublicToken(body.token)
    if (!faktura) {
      return NextResponse.json({ error: 'Fant ikke faktura.' }, { status: 404 })
    }
    if (!faktura.kunde) {
      return NextResponse.json({ error: 'Fakturaen mangler kundeinformasjon.' }, { status: 400 })
    }
    if (faktura.status === 'paid') {
      return NextResponse.json({ error: 'Fakturaen er allerede betalt.' }, { status: 400 })
    }

    const stripeCustomerId = await hentEllerOpprettStripeCustomerId(faktura.kunde)

    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(faktura.amount * 100),
      currency: faktura.currency,
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'off_session',
      metadata: { invoiceId: faktura.id },
    })

    await settFakturaPaymentIntent(faktura.id, paymentIntent.id)

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    console.error('Feil i /api/public/payments/create-payment-intent:', err)
    const message = err instanceof Error ? err.message : 'Klarte ikke å starte betaling.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
