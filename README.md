# TilbudsMaskinen

AI-drevet kalkulator, tilbudsgenerator og fakturering for norske håndverkere.

Next.js App Router + TypeScript + Tailwind, Supabase (Postgres + Storage) som
database, NextAuth med magic-link-innlogging, og Stripe for betaling.

## Ruter

**Offentlige** (krever ikke innlogging):
- `/` — landingsside
- `/logg-inn` — magic-link via e-post
- `/logg-inn/sjekk-e-post` — bekreftelse etter utsendt lenke
- `/betal/[token]` — **sluttkundens betalingsside**. Nås via lenken i
  faktura-e-posten/PDF-en. Tokenet (uuid på fakturaraden) *er*
  autentiseringen; siden er `noindex` og henter data fra
  `/api/public/invoices/[token]`, som kun returnerer et whitelistet utdrag av
  fakturaen — aldri hele raden.

**Beskyttede** (håndheves av `middleware.ts`):
- `/calc` — post-login-siden, dit brukeren sendes etter innlogging
- `/historikk` — lagrede tilbud
- `/historikk/invoices` — fakturaoversikt med statusfilter
- `/historikk/invoices/ny` — opprett faktura (fritt beløp eller fra et tilbud)
- `/historikk/invoices/[id]` — fakturadetalj, PDF, "send på nytt", betaling
- `/kunder` — kunderegister (privat/bedrift)
- `/innstillinger/firma` — firmanavn, logo, org.nr, adresse, kontonummer,
  betalingsfrist. `/innstillinger` redirecter hit.

`/result` er ikke middleware-beskyttet (leser kun `sessionStorage`), men
API-ene den bruker (`/api/calc`, `/api/tilbud`, `/api/firma`) krever gyldig
sesjon server-side.

## Betaling

To flyter, valgt automatisk ut fra kundetypen på fakturaen:
- **Privat → Stripe Checkout.** Redirect til Stripes egen hostede side.
- **Bedrift → Stripe Elements** (PaymentIntent) innebygd i appen.

Beløpet slås **alltid** opp server-side fra `invoices`-raden — aldri fra
klienten, heller ikke på de offentlige rutene. Betalingen bekreftes av
`/api/webhooks/stripe`, som verifiserer Stripe-signaturen, er idempotent på
`payments.stripe_event_id`, markerer fakturaen betalt, genererer PDF-en og
sender den på e-post.

Full oppskrift (env-vars, migrasjoner, Stripe CLI, kjente begrensninger):
[docs/payments-setup.md](docs/payments-setup.md).

## Database

- [supabase/schema.sql](supabase/schema.sql) — **oppsett for et tomt
  prosjekt**. Dropper `public.users cascade` og tar dermed med seg alt annet.
  Filen har en vakt som avbryter hvis det allerede finnes brukere.
- [migrations/](migrations/) — alt som kommer etterpå, i dato-rekkefølge.
  Kjøres manuelt i Supabase SQL Editor. Nye skjemaendringer skal inn her, ikke
  i `schema.sql`.

`20260808_create_payments_invoices_customers.sql` avsluttes med en
skjemakontroll som feiler høylytt hvis tabellene finnes fra før med feil
kolonner — den fellen har utløst i praksis én gang.

## Kom i gang

```bash
cp .env.local.example .env.local   # fyll inn egne nøkler
npm install
npm run dev
```

Uten `OPENAI_API_KEY` bruker kalkulatoren et lokalt estimat
([lib/priser.ts](lib/priser.ts)) i stedet for et AI-kall — appen fungerer
fullt ut uten nøkkelen.

For lokal webhook-testing må Stripe CLI kjøre samtidig:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`STRIPE_WEBHOOK_SECRET` må matche **den kjørende listen-sesjonen**, ikke
secreten fra Stripe-dashbordet.

## Merk

- Kjør aldri `next build` mens dev-serveren kjører — de deler `.next` og det
  korrupterer katalogen (sider henger på "Laster..." uten feil i loggen).
  Stopp dev-serveren, slett `.next`, start på nytt.
- Hemmeligheter hører kun hjemme i `.env.local` (gitignored). Både `.env.local`
  og den punktumløse varianten `env.local` er ignorert.
