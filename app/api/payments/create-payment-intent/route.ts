import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-08-01' });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { tilbudId, amount, currency = 'nok', customerEmail } = await req.json();
  if (!tilbudId || !amount) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  // Create or reuse Stripe Customer for business flows
  let customer;
  if (customerEmail) {
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    customer = customers.data[0] ?? await stripe.customers.create({ email: customerEmail, metadata: { tilbudId } });
  } else {
    customer = await stripe.customers.create({ metadata: { tilbudId } });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'nok',
    customer: customer.id,
    metadata: { tilbudId, userId: session.user.id }
  });

  return NextResponse.json({ client_secret: paymentIntent.client_secret, customer_id: customer.id });
}

