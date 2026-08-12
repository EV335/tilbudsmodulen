import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { hentFakturaByPublicToken, settFakturaCheckoutSession } from '@/lib/payments'
import { ikkeBetalbarGrunn } from '@/lib/fakturaStatus'
import { appUrl } from '@/lib/env'

// Public motstykke til /api/payments/create-checkout — autentiserer via
// faktura.public_token i stedet for en innlogget sesjon, slik at
// sluttkunden kan betale via en delt lenke. Beløpet slås fortsatt opp
// server-side fra fakturaen, aldri fra klienten.
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
    const ikkeBetalbar = ikkeBetalbarGrunn(faktura.status)
    if (ikkeBetalbar) {
      return NextResponse.json({ error: ikkeBetalbar }, { status: 400 })
    }

    const stripe = getStripe()
    const base = appUrl()

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: faktura.currency,
            product_data: { name: `Faktura ${faktura.invoice_number}` },
            unit_amount: Math.round(faktura.amount * 100),
          },
          quantity: 1,
        },
      ],
      customer_email: faktura.kunde?.epost || undefined,
      metadata: { invoiceId: faktura.id },
      success_url: `${base}/betal/${faktura.public_token}?betalt=1`,
      cancel_url: `${base}/betal/${faktura.public_token}?avbrutt=1`,
    })

    await settFakturaCheckoutSession(faktura.id, checkoutSession.id)

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('Feil i /api/public/payments/create-checkout:', err)
    const message = err instanceof Error ? err.message : 'Klarte ikke å starte betaling.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
