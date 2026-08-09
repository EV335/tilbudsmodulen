# STATE — TilbudsMaskinen

Kort teknisk øyeblikksbilde. Utfyllende historikk ligger i `CURRENT_TASK.md`.
Sist oppdatert: 2026-08-09.

## Arkitektur

**Stack:** Next.js 14.2.5 (App Router) + TypeScript + Tailwind. `reactStrictMode: true`.

**Auth:** NextAuth med EmailProvider (magic-link) mot en egen Supabase-adapter i
`public`-skjemaet (`lib/supabaseAuthAdapter.ts`). Sesjonsstrategi: **JWT**, ikke
database-sesjoner. `middleware.ts` beskytter `/calc`, `/historikk`,
`/innstillinger`, `/kunder` — alt annet er åpent.

**Database:** Supabase Postgres, snakkes med **kun server-side** via
`service_role`-nøkkelen (`lib/supabase.ts`). RLS er slått på, men uten policyer —
appen bruker NextAuth, ikke Supabase Auth, så `auth.uid()` ville aldri truffet.
**All autorisasjon skjer i API-rutene** ved å scope spørringer på
`session.user.id`. Dette er det bærende sikkerhetsprinsippet i appen.

Tabeller: `customers`, `invoices`, `payments`, `firma`, `tilbud`, `kunder`,
`users`, `accounts`, `sessions`, `verification_tokens`.
(`kunder` er en gammel fritekst-tabell for tilbud; `customers` er den nye for
fakturering — de overlapper og bør slås sammen på sikt.)

**Betaling (Stripe), to flyter valgt ut fra `kunde.type`:**
- `privat` → Stripe Checkout (redirect til Stripes hostede side).
  `CheckoutButton` → `/api/payments/create-checkout`.
- `bedrift` → PaymentIntent + Stripe Elements inline i appen.
  `PaymentIntentForm` → `/api/payments/create-payment-intent`.

Beløp slås **alltid** opp server-side fra `invoices`-raden, aldri fra klienten.
Stripe-klienten lages i `lib/stripe.ts` uten eksplisitt `apiVersion`.

**Webhook:** `/api/webhooks/stripe` — eneste rute uten sesjon, autentisert via
`stripe.webhooks.constructEvent()` + `STRIPE_WEBHOOK_SECRET` på rå request-body.
Idempotens: unique-constraint på `payments.stripe_event_id` + sjekk før
behandling. Ved `checkout.session.completed`/`payment_intent.succeeded`:
lagre betaling → marker faktura betalt → generer PDF → last opp → send e-post.
PDF/e-post-feil ruller **ikke** tilbake betalt-status (logges i stedet).

**Faktura-PDF:** jsPDF kjørt server-side i Node (`lib/invoice.ts`), lastet opp
til Supabase Storage-bucket `invoices` (public bucket, uggjettbare URL-er).

**E-post:** nodemailer over SMTP mot `smtp.resend.com` — gjenbruker samme
transport som magic-link. Ikke Resend sin SDK. Domenet `tilbudsmaskinen.no` er
nå verifisert, `EMAIL_FROM=noreply@tilbudsmaskinen.no`.

**Offentlig betalingslenke (nyeste, se "Neste oppgave"):** `invoices.public_token`
(uuid) → siden `/betal/[token]` + rutene `/api/public/invoices/[token]`,
`/api/public/payments/create-checkout`, `/api/public/payments/create-payment-intent`.
**Tokenet ER autentiseringen** — lar en sluttkunde uten konto betale via delt
lenke. `CheckoutButton`/`PaymentIntentForm` tar nå enten `invoiceId` (innlogget)
eller `token` (offentlig). Lenken legges ved i faktura-e-posten og i PDF-en.

## Åpne feil / uavklart

0. **Next.js cacher `fetch` — gjelder alle fremtidige ruter uten sesjon.**
   supabase-js kaller global `fetch`, som Next.js patcher og cacher **til disk**
   (`.next/cache`) — den overlever server-restart. Alle GET-route-handlers som
   ikke leser cookies/headers må derfor ha `dynamic = 'force-dynamic'` +
   `fetchCache = 'force-no-store'`. De innloggede rutene slipper unna kun fordi
   `getServerSession()` leser cookies. Fikset for `/api/public/invoices/[token]`
   (kunden så "Utkast" etter å ha betalt, og kunne betalt to ganger) — men
   fellen står fortsatt der for neste sesjonsløse rute.

1. **"A processing error occurred." i Bedrift-flyten.** Vises i UI-et etter at
   kortet sendes inn — men betalingen går faktisk gjennom hver gang (webhook
   `200`, faktura blir `paid`, PDF generert). Mest sannsynlig Stripe.js sin
   HTTP-vs-HTTPS-begrensning for inline Elements i dev (Checkout unngår det ved
   å redirecte til Stripes egen HTTPS-side). **Ikke bekreftet** — må testes på en
   ekte HTTPS-deploy. Hvis den overlever HTTPS er det en ekte bug: se da på
   `error`-objektet fra `stripe.confirmPayment()`.
2. **Migrasjonen er ikke idempotent.** `create table` for
   `customers`/`invoices`/`payments` i `20260808_...sql` mangler `if not exists`.
   Mot et prosjekt der tabellene finnes fra før feiler de **stille**, mens resten
   av scriptet går gjennom — det så ut som en vellykket kjøring, men appen fikk
   feil skjema. Dette skjedde faktisk her (løst med drop + re-kjør). Fiks filen
   før den kjøres i et nytt miljø.
3. **E-post til en ekte kundeadresse er aldri verifisert** etter at domenet ble
   verifisert. Alt er hittil testet mot `tilbudsmaskinen.no@gmail.com`.
4. **`tilbudsmoduler.patch`, `extract-patch.ps1`, `apply-and-test.ps1` ligger
   fortsatt i repoet.** De overskriver betalingssystemet og auto-pusher hvis de
   kjøres. Bruker er enig i sletting, men `git rm` er blokkert for meg — må
   kjøres manuelt:
   `git rm tilbudsmoduler.patch extract-patch.ps1 apply-and-test.ps1`

## Status

Verifisert end-to-end lokalt (Stripe testmodus): begge betalingsflyter,
webhook, PDF-generering, faktura markeres betalt. `tsc --noEmit` og
`next build` rene (24 ruter).

Alle eksponerte nøkler er rotert (Supabase service_role, Stripe secret,
Stripe webhook, Resend). **Nye hemmeligheter limes aldri inn i chatten** —
bruker redigerer `.env.local` selv, verifisering skjer via `curl` som aldri
skriver ut verdien.

**Offentlig betalingslenke er ferdig og verifisert end-to-end** (INV-000004
betalt via `/betal/[token]` uten sesjon → webhook `200` → `Betalt` → PDF).
Committet på branchen `feat/public-payment-link` (`f09a5fd`) og pushet.
Migrasjonen er kjørt i Supabase. **PR ikke opprettet ennå** — bruker må åpne
den selv (`gh` er ikke installert):
https://github.com/EV335/tilbudsmodulen/pull/new/feat/public-payment-link

## Neste umiddelbare oppgave

1. **Åpne og merge PR-en** over.
2. **Fyll inn "Mitt firma"** (`/innstillinger/firma`) — det finnes ingen
   `firma`-rad i databasen ennå, så fakturaer/PDF-er viser "TilbudsMaskinen"
   som avsender i stedet for det ekte firmanavnet. Rask, men nødvendig før
   kolleger tester.
3. **Bekreft at betalingslenken faktisk står i e-posten** kunden mottar
   (e-post ble sendt for INV-000004, men innholdet er ikke lest/verifisert).
4. Rydd bort patch-scriptene (punkt 4 under "Åpne feil").

## Miljø-noter

- Node/npm er **ikke på PATH** i verktøy-shellet. Bruk full sti:
  `"/c/Program Files/nodejs/node.exe" node_modules/typescript/bin/tsc --noEmit`
- Stripe CLI: `C:\Users\event\AppData\Local\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe`
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` må kjøre for at
  webhooken skal nå lokal dev-server. Secreten den printer er en **annen** enn
  Dashboard-secreten og må stå i `STRIPE_WEBHOOK_SECRET`.
- `env.local` (uten punktum) er IKKE dekket av `.gitignore`-mønstrene — nå lagt
  inn eksplisitt. Ekte hemmeligheter hører hjemme i `.env.local`.
