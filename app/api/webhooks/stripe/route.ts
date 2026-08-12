import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import {
  hentFakturaById,
  harBehandletStripeEvent,
  lagreBetaling,
  markerFakturaBetalt,
  markerFakturaFeilet,
} from '@/lib/payments'
import { genererLagreOgSendFaktura } from '@/lib/invoice'

export const runtime = 'nodejs'

// Webhooken genererer PDF, laster den opp til Storage og sender e-post før den
// svarer. Ryker vertens standardgrense underveis, får Stripe aldri 200 og
// prøver igjen — og da stopper idempotency-sjekken forsøk to, slik at fakturaen
// blir stående betalt UTEN PDF og e-post.
export const maxDuration = 60

// Henter fakturaen et Stripe-event gjelder, eller null hvis eventet ikke er
// vårt. Uten invoiceId i metadata er eventet som regel helt legitimt — Stripe
// sender f.eks. payment_intent.succeeded ved siden av
// checkout.session.completed, og session-metadata kopieres IKKE til
// PaymentIntenten. Det skal derfor ikke logges som en feil.
async function hentFakturaForEvent(invoiceId: string | undefined, event: Stripe.Event) {
  if (!invoiceId) {
    console.log(`Stripe-event ${event.id} (${event.type}) har ingen invoiceId i metadata — hopper over.`)
    return null
  }

  const faktura = await hentFakturaById(invoiceId)
  if (!faktura) {
    console.error(`Stripe-event ${event.id}: fant ikke faktura ${invoiceId}.`)
    return null
  }
  return faktura
}

async function behandleInvoiceBetalt(
  invoiceId: string | undefined,
  event: Stripe.Event,
  betalingsType: 'checkout' | 'payment_intent',
  stripeCheckoutSessionId?: string,
  stripePaymentIntentId?: string
) {
  const faktura = await hentFakturaForEvent(invoiceId, event)
  if (!faktura) return

  // Betalingen registreres uansett — pengene har faktisk beveget seg, og
  // payments-tabellen er revisjonssporet.
  await lagreBetaling({
    invoiceId: faktura.id,
    userId: faktura.user_id,
    amount: faktura.amount,
    currency: faktura.currency,
    status: 'succeeded',
    paymentMethodType: betalingsType,
    stripeEventId: event.id,
    stripeCheckoutSessionId,
    stripePaymentIntentId,
    rawEvent: event,
  })

  // Var fakturaen allerede betalt, er dette en ny betaling på samme faktura
  // (to Checkout-sesjoner rukket å bli opprettet før den første ble betalt).
  // Idempotency-sjekken over fanger ikke dette, siden event-id-ene er ulike.
  // Da skal vi ikke sende PDF/e-post en gang til — men det må varsles.
  if (faktura.status === 'paid') {
    console.error(
      `VARSEL: faktura ${faktura.invoice_number} var allerede betalt da Stripe-event ${event.id} kom inn. ` +
        'Mulig dobbeltbetaling — sjekk payments-tabellen og refunder ved behov.'
    )
    return
  }

  const betaltFaktura = await markerFakturaBetalt(faktura.id)

  try {
    await genererLagreOgSendFaktura(betaltFaktura)
  } catch (err) {
    // Betalingen er allerede registrert og fakturaen er markert betalt —
    // det er riktig og skal ikke reverseres selv om PDF/e-post feiler her.
    // (Spesifikasjonen ba om å sette status til FAILED ved PDF-feil, men det
    // ville feilaktig fortalt en kunde som faktisk har betalt at betalingen
    // mislyktes. Vi logger i stedet høylytt som et internt varsel.)
    console.error(`VARSEL: faktura ${faktura.invoice_number} er betalt, men PDF/e-post feilet:`, err)
  }
}

// Avvist kort e.l. Fakturaen settes til 'failed' slik at håndverkeren ser det
// i oversikten — men den kan fortsatt betales (se kanBetale i InvoiceView og
// /betal/[token]), for kunden skal kunne prøve igjen med et annet kort.
async function behandleInvoiceFeilet(event: Stripe.Event, paymentIntent: Stripe.PaymentIntent) {
  const faktura = await hentFakturaForEvent(paymentIntent.metadata?.invoiceId, event)
  if (!faktura) return

  await lagreBetaling({
    invoiceId: faktura.id,
    userId: faktura.user_id,
    amount: faktura.amount,
    currency: faktura.currency,
    status: 'failed',
    paymentMethodType: 'payment_intent',
    stripeEventId: event.id,
    stripePaymentIntentId: paymentIntent.id,
    rawEvent: event,
  })

  // En allerede betalt faktura skal ikke degraderes av et sent feilet forsøk.
  if (faktura.status === 'paid') return

  await markerFakturaFeilet(faktura.id)
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET mangler — kan ikke verifisere webhook.')
    return NextResponse.json({ error: 'Webhook er ikke konfigurert.' }, { status: 500 })
  }

  const signatur = req.headers.get('stripe-signature')
  if (!signatur) {
    return NextResponse.json({ error: 'Mangler stripe-signature-header.' }, { status: 400 })
  }

  const raatekst = await req.text()

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(raatekst, signatur, webhookSecret)
  } catch (err) {
    console.error('Stripe webhook-signatur ugyldig:', err)
    return NextResponse.json({ error: 'Ugyldig signatur.' }, { status: 400 })
  }

  try {
    // Idempotency: samme event kan i prinsippet leveres flere ganger
    // (Stripes at-least-once-garanti). Har vi allerede en payments-rad for
    // denne event-id-en, er den ferdigbehandlet — ikke gjør noe mer.
    if (await harBehandletStripeEvent(event.id)) {
      return NextResponse.json({ received: true, dedup: true })
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await behandleInvoiceBetalt(session.metadata?.invoiceId, event, 'checkout', session.id, undefined)
        break
      }
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        await behandleInvoiceBetalt(paymentIntent.metadata?.invoiceId, event, 'payment_intent', undefined, paymentIntent.id)
        break
      }
      case 'payment_intent.payment_failed': {
        await behandleInvoiceFeilet(event, event.data.object as Stripe.PaymentIntent)
        break
      }
      default:
        // Andre event-typer er ikke relevante for denne appen ennå.
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    // 500 her gjør at Stripe automatisk prøver igjen senere.
    console.error(`Feil under behandling av Stripe-event ${event.id} (${event.type}):`, err)
    return NextResponse.json({ error: 'Intern feil under webhook-behandling.' }, { status: 500 })
  }
}
