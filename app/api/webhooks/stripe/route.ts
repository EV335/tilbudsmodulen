import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-08-01' });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export async function POST(req: Request) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature') || '';
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: sjekk om stripe_event_id allerede behandlet
  const stripeEventId = event.id;
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const tilbudId = session.metadata?.tilbudId;
      const userId = session.metadata?.userId;
      const amount = session.amount_total ?? 0;
      // Sjekk om payment finnes
      const { data: existing } = await supabase.from('payments').select('*').eq('stripe_checkout_session', session.id).limit(1);
      if (existing && existing.length) {
        return NextResponse.json({ received: true });
      }
      await supabase.from('payments').insert({
        tilbud_id: tilbudId,
        user_id: userId,
        stripe_checkout_session: session.id,
        amount,
        currency: session.currency ?? 'NOK',
        status: 'succeeded',
        stripe_event_id: stripeEventId
      });
      // Optionally create invoice here or mark tilbud as paid
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const tilbudId = pi.metadata?.tilbudId;
      const userId = pi.metadata?.userId;
      const { data: existing } = await supabase.from('payments').select('*').eq('stripe_payment_intent', pi.id).limit(1);
      if (existing && existing.length) return NextResponse.json({ received: true });
      await supabase.from('payments').insert({
        tilbud_id: tilbudId,
        user_id: userId,
        stripe_payment_intent: pi.id,
        amount: pi.amount ?? 0,
        currency: pi.currency ?? 'NOK',
        status: 'succeeded',
        stripe_event_id: stripeEventId
      });
    }
  } catch (err) {
    console.error('Webhook handling error', err);
    return NextResponse.json({ error: 'Webhook handling error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

