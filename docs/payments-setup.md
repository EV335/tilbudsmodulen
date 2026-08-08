# Betaling og fakturering — oppsett

Denne modulen legger til Stripe-betaling og fakturering på toppen av eksisterende
TilbudsMaskinen-funksjonalitet (kalkulator, historikk, innlogging). Alt er
skrevet og typesjekket, men **ikke live-testet mot en ekte Stripe-konto** —
det krever nøkler jeg ikke har tilgang til. Se "Testplan" nederst for nøyaktig
hva som gjenstår.

## 1. Env-vars (legg til i `.env.local` selv — jeg endrer den ikke automatisk)

```
# Stripe (test-modus)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STANDARD=price_...

# Kreves av Stripe.js på klienten for Bedrift-flyten (PaymentIntentForm).
# MERK: denne stod ikke i den opprinnelige env-var-listen i oppgaven, men er
# teknisk påkrevd for at Stripe Elements skal fungere i nettleseren — uten
# den vil PaymentIntentForm vise en tydelig feilmelding i stedet for å krasje.
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# App-URL brukt i success_url/cancel_url for Stripe Checkout.
# Faller tilbake til NEXTAUTH_URL (som allerede finnes i .env.local) hvis
# denne ikke er satt, så den er strengt tatt valgfri i sandbox.
APP_URL=http://localhost:3000

# Finnes allerede i .env.local fra før (Supabase-oppsettet):
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Om `STRIPE_PRICE_ID_STANDARD`**: koden bruker i praksis dynamisk
`price_data` (beløpet på hver faktura varierer jo per jobb), så denne
variabelen brukes ikke direkte av dagens implementasjon. Den er dokumentert
her fordi oppgaven ba om det — behold den for en fremtidig fastprisvare
(f.eks. et abonnement på selve TilbudsMaskinen-tjenesten), men den er ikke
en forutsetning for at betalingsflytene under skal virke.

**Om `SUPABASE_KEY`**: oppgaven listet denne, men prosjektets eksisterende
konvensjon (se `lib/supabase.ts`) bruker `SUPABASE_SERVICE_ROLE_KEY`, som
allerede finnes i `.env.local`. Jeg har brukt det eksisterende navnet
konsekvent i stedet for å innføre et nytt, overlappende navn.

**Om `RESEND_API_KEY`**: brukes **ikke**. Appen sender all e-post (magic-link
og nå fakturaer) via SMTP med `nodemailer` mot `smtp.resend.com`
(`EMAIL_SERVER_HOST/PORT/USER/PASSWORD/EMAIL_FROM`, som allerede finnes i
`.env.local`). Fakturamodulen gjenbruker akkurat den samme transporten
(`lib/invoice.ts` → `sendFakturaEpost`) i stedet for å legge til Resends
API-SDK som en ny, parallell integrasjon. Se punkt 4 for sandbox-begrensningen
dette medfører.

## 2. Kjør migrasjonen

Kjør `migrations/20260808_create_payments_invoices_customers.sql` i Supabase
Dashboard → SQL Editor, **etter** at `supabase/schema.sql` allerede er kjørt.
Den:
- legger `betalingsbetingelser_dager` og `bankkonto` til `public.firma`
- oppretter `public.customers`, `public.invoices`, `public.payments`
- oppretter en `invoice_seq`-sekvens + `next_invoice_number()`-funksjon
- oppretter en `invoices`-storage-bucket (public, samme mønster som `logos`)

Se kommentaren øverst i filen for hvorfor det finnes både `public.kunder`
(gammel, enkel) og `public.customers` (ny, for fakturering) — de overlapper
litt og bør slås sammen på sikt.

**Storage-personvern**: `invoices`-bucketen er satt `public: true`, samme
mønster som `logos`. URL-ene er ugjettbare (UUID-basert filnavn), men ikke
adgangskontrollert. For produksjon med ekte kunder bør dette byttes til en
privat bucket + signerte URL-er (`supabase.storage.from('invoices').createSignedUrl()`)
i stedet for `getPublicUrl()` i `lib/invoice.ts`.

## 3. Stripe CLI — lokal webhook-testing

```bash
# Installer Stripe CLI (https://stripe.com/docs/stripe-cli), deretter:
stripe login

# Videresend Stripe-events til din lokale dev-server:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` printer en `whsec_...`-nøkkel når den starter — det er
`STRIPE_WEBHOOK_SECRET` du skal bruke lokalt (den er forskjellig fra
webhook-secreten du får når du oppretter et permanent webhook-endepunkt i
Stripe Dashboard for staging/produksjon).

**Replay av et event manuelt** (nyttig for å teste idempotency uten å gjøre
en ny ekte betaling):

```bash
stripe events resend evt_xxx
```

**Eller** simuler et event direkte uten en ekte betaling:

```bash
stripe trigger checkout.session.completed
```

**Manuelt curl-eksempel** (krever at du selv regner ut en gyldig signatur —
i praksis er `stripe listen`/`stripe trigger` alltid enklere):

```bash
curl -X POST http://localhost:3000/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1699999999,v1=<utregnet_signatur>" \
  -d @event.json
```

## 4. Resend sandbox-begrensning (uendret av denne modulen)

Prosjektet er fortsatt i Resend sandbox-modus (`EMAIL_FROM=onboarding@resend.dev`).
Det betyr:
- Fakturaer kan kun sendes på e-post til **`tilbudsmaskinen.no@gmail.com`**
  (kontoens egen adresse). Kunder med andre e-postadresser vil få en logget
  feil i `sendFakturaEpost()`, men selve betalingen/fakturaen påvirkes ikke —
  PDF-en genereres og lagres uansett, bare utsendingen feiler stille (logget
  til server-konsollen).
- Jeg har **ikke** rørt Resend-domenet eller `.env.local`, som instruert.
- Når domenet `tilbudsmaskinen.no` er verifisert på resend.com/domains og
  `EMAIL_FROM` byttes tilbake til `noreply@tilbudsmaskinen.no`, fungerer
  fakturautsending til alle kunder uten kodeendringer.

## 5. Sikkerhet og autorisasjon

- Alle `/api/payments/*` og `/api/invoices/*`-ruter (unntatt selve webhooken)
  krever `getServerSession` og sjekker at fakturaen/kunden tilhører
  innlogget bruker (`user_id`), samme mønster som resten av appen.
- Webhooken (`/api/webhooks/stripe`) er den eneste ruten som IKKE bruker
  sesjon — den autentiseres i stedet via `stripe.webhooks.constructEvent()`
  med `STRIPE_WEBHOOK_SECRET`, og leser rå body (`req.text()`) siden Stripes
  signaturverifisering krever den eksakte, uparsede request-bodyen.
- Idempotency: `payments.stripe_event_id` har en unique-constraint i
  databasen, og webhooken sjekker `harBehandletStripeEvent()` før den gjør
  noe som helst. Samme event kan trygt leveres flere ganger (Stripes
  at-least-once-garanti) uten at det oppstår duplikate betalinger, dobbel
  PDF-generering eller dobbel e-postutsending.
- Stripe secret key (`STRIPE_SECRET_KEY`) brukes utelukkende i
  `lib/stripe.ts`, som kun importeres fra server-kode (API-ruter). Klienten
  ser kun `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (som per design er trygt å
  eksponere).

## 6. Avvik fra den opprinnelige spesifikasjonen (bevisste, dokumenterte valg)

1. **`customers` vs. `kunder`**: se punkt 2 over.
2. **PDF-feil ved betalt faktura setter IKKE status til `FAILED`**: hvis
   PDF-generering eller e-postutsending feiler etter en vellykket betaling
   (i `app/api/webhooks/stripe/route.ts`), beholdes fakturastatusen `paid`.
   Å sette den til `failed` her ville feilaktig fortalt en kunde som faktisk
   har betalt at betalingen mislyktes — det er en alvorligere feil enn en
   manglende PDF. Feilen logges i stedet høylytt til konsollen som et internt
   varsel, og fakturaen kan genereres/sendes på nytt manuelt via
   "Send på nytt"-knappen i `InvoiceView` (kaller `POST /api/invoices/[id]/resend`).
3. **`/innstillinger` er nå en redirect** til `/innstillinger/firma`. Det
   opprinnelige innholdet (org.nr/adresse/logo) er flyttet dit og utvidet med
   faktura-innstillinger (bankkonto, betalingsfrist i dager), i stedet for å
   duplisere firmaoppsettet på to steder.
4. **Ingen egen offentlig betalingsside for sluttkunden.** "Betal nå"
   (Checkout) og PaymentIntent-skjemaet vises i dag inne i den innloggede
   appen (`/historikk/invoices/[id]`), for håndverkeren selv å teste/demonstrere
   med. En fullverdig løsning der sluttkunden (som ikke har en
   TilbudsMaskinen-konto) betaler via en delt lenke uten innlogging, er en
   egen, større arkitekturbeslutning (tokenbasert offentlig rute) som ikke er
   del av dette passet.

## Testplan (hva som er gjort vs. hva som gjenstår)

**Gjort:**
- `tsc --noEmit` kjørt uten feil.
- Kodegjennomgang av alle nye filer for autorisasjon, idempotency og
  feilhåndtering.

**IKKE gjort — krever ting jeg ikke har tilgang til:**
1. Sett inn ekte Stripe-testnøkler i `.env.local` (`STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
2. Kjør migrasjonen i Supabase (se punkt 2).
3. Kjør `stripe listen --forward-to localhost:3000/api/webhooks/stripe` i en
   egen terminal.
4. I appen: opprett en kunde (Privat) i `/kunder`, opprett en faktura fra et
   lagret tilbud i `/historikk` ("Fakturér"), trykk "Betal nå", fullfør med
   testkort `4242 4242 4242 4242` (valgfri utløpsdato/CVC).
5. Bekreft at fakturaen får status "Betalt", at PDF-en er generert
   (`pdf_url` satt) og lastet ned korrekt, og at en e-post ble forsøkt sendt
   (vil kun faktisk ankomme innboks hvis kundens e-post er
   `tilbudsmaskinen.no@gmail.com`, jf. punkt 4 over).
6. Gjenta samme betaling for en Bedrift-kunde — bekreft at
   `PaymentIntentForm` (Stripe Elements) fungerer, og at kunden får en
   `stripe_customer_id` lagret.
7. Kjør `stripe events resend <event-id>` for et allerede behandlet event —
   bekreft at ingen ny rad opprettes i `payments`, og at fakturaen ikke
   sendes på nytt.
