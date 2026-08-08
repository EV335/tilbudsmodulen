import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-08-01' });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { tilbudId, amount, currency = 'nok' } = body;
  if (!tilbudId || !amount) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const sessionObj = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'nok',
        product_data: { name: `Tilbud ${tilbudId}` },
        unit_amount: amount
      },
      quantity: 1
    }],
    success_url: `${process.env.APP_URL}/betaling/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/betaling/cancel`,
    metadata: { tilbudId, userId: session.user.id }
  });

  return NextResponse.json({ url: sessionObj.url });
}

