import { NextRequest, NextResponse } from 'next/server'
import { hentFakturaByPublicToken, klargjorPaymentIntent } from '@/lib/payments'
import { ikkeBetalbarGrunn } from '@/lib/fakturaStatus'

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
    const ikkeBetalbar = ikkeBetalbarGrunn(faktura.status)
    if (ikkeBetalbar) {
      return NextResponse.json({ error: ikkeBetalbar }, { status: 400 })
    }

    const clientSecret = await klargjorPaymentIntent(faktura)

    return NextResponse.json({ clientSecret })
  } catch (err) {
    console.error('Feil i /api/public/payments/create-payment-intent:', err)
    // Se create-checkout: uautentisert rute, detaljene hører hjemme i loggen.
    return NextResponse.json({ error: 'Klarte ikke å starte betaling.' }, { status: 500 })
  }
}
