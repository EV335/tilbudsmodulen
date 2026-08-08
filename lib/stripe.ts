import Stripe from 'stripe'

// Server-only Stripe-klient. Importer ALDRI denne filen fra klientkomponenter.
// STRIPE_SECRET_KEY må settes i .env.local (se docs/payments-setup.md) — vi
// endrer ikke .env.local selv, så nøkkelen mangler helt til den er satt manuelt.
function hentStripeKlient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY mangler. Sett den i .env.local (se docs/payments-setup.md) før betalingsfunksjoner kan brukes.'
    )
  }
  // Ingen eksplisitt apiVersion satt — bruker SDK-pakkens innebygde
  // standardversjon, så vi slipper å vedlikeholde et versjonsnummer manuelt.
  return new Stripe(secretKey)
}

let cachedClient: Stripe | null = null

export function getStripe(): Stripe {
  if (!cachedClient) {
    cachedClient = hentStripeKlient()
  }
  return cachedClient
}
