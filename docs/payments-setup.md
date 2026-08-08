# Payments setup (Stripe + Supabase + Resend sandbox)

## Nødvendige env-vars (lokalt / staging)
- STRIPE_SECRET_KEY=sk_test_xxx
- STRIPE_WEBHOOK_SECRET=whsec_xxx
- STRIPE_PRICE_ID_STANDARD=price_xxx
- APP_URL=http://localhost:3000
- NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url
- SUPABASE_KEY=service_role_key_or_anon_key
- RESEND_API_KEY=key_xxx

## Migrasjoner
Kjør SQL i Supabase SQL Editor: `migrations/20260808_create_payments_invoices_customers.sql`

## Start dev og webhook testing
1. Start app: `npm run dev` eller `node node_modules/next/dist/bin/next dev`
2. Kjør Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Bruk testkort `4242 4242 4242 4242` i Checkout

## Resend sandbox
- Sandbox tillater kun sending til `tilbudsmaskinen.no@gmail.com`. Ikke bytt `EMAIL_FROM` før domenet er verifisert.

