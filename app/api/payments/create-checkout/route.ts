import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { hentFaktura, settFakturaCheckoutSession, fakturaBelop } from '@/lib/payments'
import { ikkeBetalbarGrunn } from '@/lib/fakturaStatus'
import { appUrl } from '@/lib/env'

// Privat-flyt: Stripe-hostet Checkout. Brukes for enkle engangsbetalinger der
// vi ikke trenger å lagre et betalingsmiddel eller en Stripe Customer.
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
    const ikkeBetalbar = ikkeBetalbarGrunn(faktura.status)
    if (ikkeBetalbar) {
      return NextResponse.json({ error: ikkeBetalbar }, { status: 400 })
    }

    const belop = fakturaBelop(faktura)
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
            // Totalen, ikke amount — legges mva på toppen er det totalen
            // kunden skylder. Uten mva er de to like.
            unit_amount: Math.round(belop.total * 100),
          },
          quantity: 1,
        },
      ],
      customer_email: faktura.kunde?.epost || undefined,
      metadata: { invoiceId: faktura.id },
      success_url: `${base}/historikk/invoices/${faktura.id}?betalt=1`,
      cancel_url: `${base}/historikk/invoices/${faktura.id}?avbrutt=1`,
    })

    await settFakturaCheckoutSession(faktura.id, checkoutSession.id)

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('Feil i /api/payments/create-checkout:', err)
    const message = err instanceof Error ? err.message : 'Klarte ikke å starte betaling.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
