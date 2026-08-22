# TilbudsMaskinen — status

## Hva appen er
Next.js App Router + TypeScript + Tailwind. Kalkulator (AI + lokalt fallback-estimat),
PDF-eksport, historikk (full CRUD), NextAuth-innlogging (EmailProvider/magic-link mot
en lokal Supabase-adapter i `public`-skjemaet), og — nyest — Stripe-betaling og
fakturering for Privat/Bedrift-kunder.

## Kronologi og status

### 1. Auto-mode stabilisering — commit `e31d29a`
Full gjennomgang av Historikk, PDF, Kalkulator, Innlogging og UI. Fant og fikset flere
reelle bugs, blant annet:
- `middleware.ts` sendte uinnloggede brukere til NextAuths stygge `/api/auth/signin`
  i stedet for appens egen `/logg-inn` (manglet `pages`-config i `withAuth`).
- Historikk hadde ingen ekte "oppdater" — å åpne et tilbud og lagre på nytt laget en
  duplikat i stedet for å oppdatere raden. Lagt til `PATCH /api/tilbud/[id]`.
- Sletting i historikk viste "vellykket" i UI selv om server-kallet feilet.
- PDF-logo ble strukket ut av proporsjon; lange tilbudstekster kunne renne av arket
  uten sideskift.
- `error.tsx`/`global-error.tsx`/`not-found.tsx` var helt ustylte, matchet ikke
  designsystemet.
- Diskplass-krise løst tidligere i økten (CapCut-cache tok 28,9 GB) — se git-historikk
  for detaljer, ikke lenger aktuelt.

### 2. Betaling og fakturering — commit `138022e` (mitt opprinnelige arbeid)
Bygget fra bunnen: Stripe Checkout (Privat) + PaymentIntent/Customer (Bedrift),
webhook med signaturverifisering og idempotency (`payments.stripe_event_id`
unique-constraint), server-side fakturagenerering (jsPDF kjører faktisk i Node),
opplasting til Supabase Storage, e-post via eksisterende SMTP-transport (ikke en ny
Resend-SDK-integrasjon), kunderegister, fakturaoversikt, faktura-detaljvisning.
Migrasjon: `migrations/20260808_create_payments_invoices_customers.sql`
(`customers`, `invoices`, `payments`, `invoice_seq`). Full dokumentasjon (nå delvis
overskrevet, se punkt 4) var i `docs/payments-setup.md`.

`tsc --noEmit` var rent på dette tidspunktet. Ikke live-testet mot en ekte
Stripe-konto (ingen testnøkler tilgjengelig da).

### 3. ⚠️ Eksterne patch-commits overskrev deler av arbeidet — commits `863a4f6`, `20ac58b`, `933a1dd`
Etter min commit `138022e` ble **7 filer overskrevet av en ekstern prosess** (ikke
meg — skjedde mellom mine svar i samme økt, flagget av systemet som filendringer
"av bruker eller linter"). Disse commitene er allerede pushet til `origin/master`.

**Overskrevne filer** (ny versjon er enklere, men **inkompatibel** med resten av
systemet jeg bygget):
- `docs/payments-setup.md` — kortere versjon, feil env-var-navn (`SUPABASE_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL` i stedet for prosjektets faktiske
  `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL`).
- `app/innstillinger/firma/page.tsx` — redusert til kun firmanavn-felt (mistet
  logo/org.nr/adresse/bankkonto/betalingsfrist). Oppretter en Supabase-klient i
  **klientkomponenten** med `process.env.SUPABASE_KEY` — denne er ikke
  `NEXT_PUBLIC_`-prefikset og vil alltid være `undefined` i nettleseren (klienten
  brukes faktisk ikke i komponenten, men mønsteret er farlig hvis noen senere bruker
  den — ville i verste fall eksponert service_role-nøkkelen i nettleserbunten).
  Kaller også `/api/firma/me`, en rute som ikke finnes.
- `app/historikk/invoices/page.tsx` — mistet statusfilter og designsystem-styling,
  bruker klasser (`card`, `btn`) som ikke finnes i Tailwind-oppsettet. Lenker til
  `/invoices/${id}` — en rute som ikke finnes (min er `/historikk/invoices/[id]`).
- `components/invoice/InvoiceView.tsx` — endret props-signatur fra `{ faktura }` til
  `{ invoiceId }`. **`app/historikk/invoices/[id]/page.tsx` (ikke overskrevet) kaller
  fortsatt `<InvoiceView faktura={faktura} />`** → dette er nå en TypeScript-feil /
  ødelagt prop-kontrakt. Ny versjon viser PDF i en iframe, men har **ingen
  betalingsknapp i det hele tatt** (CheckoutButton/PaymentIntentForm er ikke lenger
  koblet inn her).
- `components/payments/CheckoutButton.tsx` — endret fra `{ invoiceId }` til
  `{ tilbudId, amount }`, sender `amount` fra klienten. Matcher ikke lenger
  `create-checkout`-ruten sin nye kontrakt heller (se under) på en trygg måte.
- `components/payments/PaymentIntentForm.tsx` — endret til `{ tilbudId, amount }`,
  og **bruker ikke Stripe Elements i det hele tatt** — henter kun en client secret og
  viser en tekst ("Fullfør betaling i klient"). Betalingen fullføres aldri. Dette er
  en funksjonell regresjon fra min versjon (som brukte `@stripe/react-stripe-js`).
- `app/api/payments/create-checkout/route.ts` — leser nå `{ tilbudId, amount }` fra
  klienten og **stoler på klient-oppgitt beløp** i stedet for å slå opp
  `faktura.amount` server-side. Dette er en reell sikkerhetssvakhet (en ondsinnet
  klient kan sette `amount: 1`). Redirecter til `/betaling/success`/`/betaling/cancel`
  — ruter som ikke finnes. Bruker `getServerSession(authOptions)` med feil import
  (`from 'next-auth'` i stedet for `'next-auth/next'` som resten av prosjektet — bør
  sjekkes om dette faktisk fungerer i App Router).
- `app/api/payments/create-payment-intent/route.ts` — samme mønster: stoler på
  klient-oppgitt `amount`, oppretter Stripe Customer direkte fra e-post uten å gå via
  `customers`-tabellen/`hentEllerOpprettStripeCustomerId`. Hardkoder
  `apiVersion: '2024-08-01'`.
- `app/api/webhooks/stripe/route.ts` — hardkoder `apiVersion: '2024-08-01'` (den
  installerte `stripe`-pakken sin `apiVersion`-felt er typet som en streng literal
  låst til SDK-ens innebygde versjon — dette **ga en TS-kompileringsfeil tidligere i
  økten**, som jeg fjernet ved å ikke sette `apiVersion` i det hele tatt; denne nye
  versjonen kan ha reintrodusert akkurat den feilen). Bruker `SUPABASE_KEY` (finnes
  ikke — appen bruker `SUPABASE_SERVICE_ROLE_KEY`). Skriver til `payments`-tabellen
  med kolonnenavn som **ikke matcher migrasjonen** (`tilbud_id`/`stripe_checkout_session`
  i stedet for `invoice_id`/`stripe_checkout_session_id`). Går ikke via
  `invoices`-tabellen i det hele tatt — ingen `markerFakturaBetalt`, ingen
  PDF-generering, ingen e-postutsending.

**Konsekvens:** systemet er nå en blanding av to inkompatible design (mitt
faktura/kunde-baserte, og et enklere tilbud-direkte design fra patchen) som **ikke
fungerer sammen**. Jeg har ikke rettet dette ennå — venter på brukerens avgjørelse
(se "Åpne spørsmål" nederst).

**RETTELSE (2026-08-08, ny økt):** Punktet over ("ikke overskrevet") var **feil**.
Verifiserte på nytt med `git diff --stat 138022e HEAD`: `lib/payments.ts`,
`lib/invoice.ts` og migrasjonen `migrations/20260808_...sql` ble **også**
overskrevet av samme patch (commit `933a1dd`), ikke bare de 8 filene listet over.

Fant også kilden til "den eksterne prosessen": to nye PowerShell-script i
repo-roten, `extract-patch.ps1` og `apply-and-test.ps1`, pluss en fil
`tilbudsmoduler.patch` (custom pseudo-diff-format, ikke ekte `git diff`) — disse
ble lagt til av samme patch og er fortsatt i repoet. `extract-patch.ps1` skriver
filene fra `tilbudsmoduler.patch` til disk; `apply-and-test.ps1` kjører
`git add -A && git commit && git push` automatisk etterpå. Det er MEKANISMEN bak
commits `863a4f6`/`20ac58b`/`933a1dd` — ikke et mysterium, men et script som
committer og pusher uten gjennomgang. **`tilbudsmoduler.patch` er det komplette,
selvstendige "enkle design"** — alt i punkt 3 sin overskrevet-liste kommer
bokstavelig talt derfra.

**Konsekvens — bygget er nå faktisk ødelagt, ikke bare inkonsistent:**
`lib/payments.ts`/`lib/invoice.ts` eksporterer nå kun `recordPayment`,
`createInvoiceRow`, `generateInvoicePdf`, `uploadInvoicePdf`. Men disse filene
importerer fortsatt det gamle rike API-et som ikke lenger finnes:
- `app/api/invoices/route.ts` — `hentFakturaer, hentKunde, opprettFaktura, FakturaStatus`
- `app/api/invoices/[id]/route.ts` — `hentFaktura`
- `app/api/invoices/[id]/resend/route.ts` — `hentFaktura`, `genererLagreOgSendFaktura`
- `app/api/customers/route.ts` — `hentKunder, opprettKunde, KundeType`
- `app/kunder/page.tsx` — type `Kunde, KundeType`
- `app/historikk/invoices/ny/page.tsx` — type `Kunde`
- `app/historikk/invoices/[id]/page.tsx` — type `Faktura`

Alle disse importene feiler nå (funksjonene/typene finnes ikke lenger i
`@/lib/payments`/`@/lib/invoice`). Kunne ikke kjøre `tsc --noEmit` for å få
eksakt feilliste — Node/npm er ikke på PATH i dette shell-miljøet — men dette er
garantert kompileringsfeil, ikke bare en runtime-risiko. `npm run build` vil
etter all sannsynlighet feile akkurat nå.

**Fortsatt uendret (ikke i diffen mellom `138022e` og `HEAD`):** `lib/stripe.ts`,
`lib/fakturaStatus.ts`, `lib/supabase.ts`, `lib/auth.ts`.

**Ekstra bug funnet i patch-versjonen av `lib/invoice.ts`:**
`uploadInvoicePdf` destrukturerer `{ publicURL }` fra
`supabase.storage.from(...).getPublicUrl(...)` — i supabase-js v2 er
returformen `{ data: { publicUrl } }` (lowercase `url`, nøstet i `data`, ingen
`error`). Denne funksjonen returnerer alltid `undefined`.

### 4. ⚠️ Sikkerhetsfunn: `env.local` med ekte hemmeligheter i klartekst
Brukeren limte inn Stripe test-nøkler i chatten. Et untracked filfunn viste at det
finnes en fil **`env.local`** (uten innledende punktum — altså IKKE dekket av
`.gitignore`, som kun ignorerer `.env.local`/`.env`) med følgende i klartekst:
- Stripe publishable + secret key (test-modus)
- Stripe webhook secret
- Supabase publishable key
- **Supabase service_role-nøkkel** (JWT — full databasetilgang, omgår RLS)
- Resend API-nøkkel

Denne filen ville blitt committet og pushet til GitHub (`EV335/tilbudsmodulen`,
offentlig eller privat — ikke sjekket) hvis en `git add -A` hadde kjørt. Jeg har
**ikke** lagt den til, committet eller pushet noe. Brukeren har ikke svart på hva de
vil gjøre med filen ennå.

**LØST (2026-08-08, ny økt):** Flyttet de reelle verdiene (Stripe secret/publishable
key, webhook secret, Supabase publishable key) inn i `.env.local`
(`SUPABASE_SERVICE_ROLE_KEY` lå der fra før med samme verdi som i `env.local` —
ikke duplisert). Lagt til `env.local` (uten punktum) i `.gitignore` som ekstra
sikring — filen selv er IKKE slettet ennå (brukeren limte den inn manuelt, så jeg
lot den ligge fremfor å slette noe jeg ikke opprettet; den kan nå ikke lenger
committes ved et uhell). Ikke rotert Supabase service_role-nøkkelen — det er en
handling brukeren må gjøre selv i Supabase-dashbordet, anbefales fortsatt siden
nøkkelen har ligget ubeskyttet i klartekst i repo-mappen.

### 6. Gjenoppretting til rikt design (Option A) — branch `fix/restore-invoice-payment-system`
Bruker valgte **Option A** og "branch + jeg pusher, du åpner PR på GitHub.com".

Gjenopprettet fra commit `138022e` (verifisert `tsc --noEmit`-ren på det
tidspunktet) med `git checkout 138022e -- <filer>`, 12 filer:
`lib/payments.ts`, `lib/invoice.ts`,
`migrations/20260808_create_payments_invoices_customers.sql`,
`app/innstillinger/firma/page.tsx`, `app/historikk/invoices/page.tsx`,
`components/invoice/InvoiceView.tsx`, `components/payments/CheckoutButton.tsx`,
`components/payments/PaymentIntentForm.tsx`,
`app/api/payments/create-checkout/route.ts`,
`app/api/payments/create-payment-intent/route.ts`,
`app/api/webhooks/stripe/route.ts`, `docs/payments-setup.md`.

Verifisert manuelt (Node/npm ikke tilgjengelig i shell-miljøet, se punkt 3 —
kunne ikke kjøre `tsc`) at alt henger sammen igjen:
- `InvoiceView` bruker `{ faktura }`-prop igjen, matcher kalleren i
  `app/historikk/invoices/[id]/page.tsx`.
- `CheckoutButton`/`PaymentIntentForm` bruker `{ invoiceId }`, matcher
  `create-checkout`/`create-payment-intent`-rutenes kontrakt.
- Begge betalingsrutene slår opp `faktura.amount` server-side via
  `hentFaktura()` — sikkerhetshullet med klient-oppgitt beløp er borte.
- `getServerSession` importeres fra `'next-auth/next'` (prosjektkonvensjonen)
  i begge rutene igjen, ikke `'next-auth'`.
- Ingen hardkodet `apiVersion` — bruker `getStripe()` fra `lib/stripe.ts`.
- `docs/payments-setup.md` har korrekte env-var-navn
  (`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL`, ikke `SUPABASE_KEY`).
- `app/innstillinger/firma/page.tsx` kaller `/api/firma` (finnes, uendret hele
  tiden) — ikke den oppdiktede `/api/firma/me`.
- Grep-sjekk i hele repoet for `SUPABASE_KEY`, hardkodet `apiVersion: '2024`,
  og `tilbudId`/`amount` fra klient i betalingsrutene — ingen treff igjen.
- De 7 filene som aldri ble overskrevet (`app/api/invoices/*`,
  `app/api/customers/route.ts`, `app/kunder/page.tsx`,
  `app/historikk/invoices/ny/page.tsx`) trengte ingen endring — de forventet
  allerede dette API-et.

**Oppdatering 2026-08-09 — bygget faktisk verifisert:** fant at Node *er*
installert, bare ikke på PATH i verktøy-shellet — full sti står i
`.claude/launch.json` (`C:\Program Files\nodejs\node.exe`). Kjørte:
- `tsc --noEmit` → **0 feil.**
- `next build` (full produksjonsbygg) → feilet første forsøk på
  `/historikk/invoices/ny`: `useSearchParams() should be wrapped in a
  suspense boundary`. Dette er en **egen, allerede eksisterende bug**, ikke
  relatert til patch-restaureringen — filen var en av de 7 som aldri ble
  overskrevet, og var aldri build-testet før (kun `tsc`, se punkt 2). Fikset
  ved å splitte siden i en `<Suspense>`-wrapper + en indre
  `NyFakturaInnhold`-komponent. Etter fiksen: **`next build` rent, alle 22
  routes kompilerer/typesjekker/lintes/prerendres uten feil.**
- Dev-server (`next dev` via `.claude/launch.json`) verifisert i nettleser:
  forsiden laster, middleware redirecter korrekt uinnlogget bruker fra
  beskyttede ruter (`/kunder`, `/historikk/invoices/ny`) til `/logg-inn`,
  ingen konsoll-/serverfeil.

Begge fiksene er committet på branchen: `428ae6c` (restaurering + env-sikring)
og `12a1f2c` (Suspense-fiks), og pushet til origin.

**Oppdatering 2026-08-09 — PR merget, migrasjon kjørt:** Bruker merget PR #2
(`fix/restore-invoice-payment-system` → `master`, commit `2f82a8d`) på
GitHub.com. Lokal `master` fast-forwardet til samme commit, lokal
feature-branch slettet. Bruker kjørte migrasjonen i Supabase SQL Editor uten
feil — bekreftet med skjermbilde av Table Editor: `customers`, `invoices`,
`payments`, `firma` finnes alle i `public`-skjemaet sammen med de
eksisterende tabellene (`accounts`, `sessions`, `tilbud`, `kunder`, `users`,
`verification_tokens`). Databasen er nå klar for betalingsmodulen.

### 7. ✅ Full golden path kjørt og bekreftet — 2026-08-09
Brukeren logget inn via ekte magic-link (klikket selv i egen nettleser, delte
lenken slik at jeg kunne følge den i min egen). Underveis dukket det opp to
uavhengige, tidligere ukjente problemer, begge løst:

**Migrasjonen hadde faktisk ikke kjørt riktig.** Da jeg testet `/kunder` fikk
jeg `column customers.user_id does not exist` — verifiserte direkte mot
Supabase REST API (service_role-nøkkel, forbi appen) at de live tabellene
`customers`/`invoices`/`payments` hadde et **helt tredje skjema** (delvis
norske kolonnenavn: `navn`, `epost`, `belop`, `valuta`, `kunde_id`,
`stripe_event`) som ikke finnes definert noe sted i repoet — sannsynligvis
fra et enda eldre, ukjent oppsett. Siden migrasjonens `create table`-
setninger for disse tre tabellene mangler `IF NOT EXISTS`, feilet de trolig
stille mens resten av scriptet (firma-alter, storage-bucket) gikk gjennom,
som ga inntrykk av en vellykket kjøring. Bekreftet tabellene var tomme (0
rader) via REST, ba bruker kjøre
`drop table if exists public.payments, public.invoices, public.customers cascade;`
og re-kjøre migrasjonsfilen — verifisert etterpå at live-skjemaet nå matcher
koden nøyaktig.

**Resend sandbox-begrensningen gjaldt også innlogging**, ikke bare
fakturautsending som opprinnelig dokumentert — første magic-link-forsøk (med
den nye Resend-nøkkelen brukeren limte inn) kom aldri frem. Testet ved å
bytte tilbake til den gamle nøkkelen — den fungerte. Brukeren verifiserte
samtidig at `tilbudsmaskinen.no`-domenet nå er verifisert på Resend, så
`EMAIL_FROM` er byttet fra `onboarding@resend.dev` til
`noreply@tilbudsmaskinen.no` — fakturautsending til ekte kunder skal nå
fungere uten sandbox-begrensningen (ikke separat verifisert ennå).

**Stripe CLI**: installert via `winget install Stripe.StripeCli`. `stripe
login` krevde brukerens eksplisitte OAuth-godkjenning (kunne ikke gjøres av
meg) — fullført via device-auth-flyt. `stripe listen --forward-to
localhost:3000/api/webhooks/stripe` kjører nå i bakgrunnen (PID kan variere
mellom økter — se `%TEMP%\stripe-listen-*.log` for output). Webhook-secreten
fra CLI-en (`whsec_980dc118...`) er ulik dashboard-secreten og er satt i
`.env.local`.

**Fullstendig verifisert flyt** (Privat-kunde, Checkout-betaling):
opprettet kunde → opprettet fristående faktura (kr 1500) → "Betal nå" →
ekte Stripe Checkout-side → betalt med testkort `4242...` → redirect tilbake
→ webhook mottok 5 Stripe-events (`charge.succeeded`,
`payment_intent.succeeded`, `checkout.session.completed`,
`payment_intent.created`, `charge.updated`), alle `200` → faktura markert
**Betalt**, PDF generert og lastet opp til Supabase Storage, nedlastingslenke
fungerer. Ingen feil i noe steg.

### 8. Bedrift-flyten (PaymentIntentForm/Stripe Elements) testet — 2026-08-09
Opprettet Bedrift-kunde + faktura (INV-000002, kr 2500), fylte ut ekte
Stripe Elements-kortskjema, trykte Betal.

**Fant en reell bug**: `useEffect` i `PaymentIntentForm.tsx` hadde ingen
guard mot React 18 StrictMode sin dobbelt-kjøring av effekter i dev — hver
sidevisning opprettet **to separate PaymentIntents** (og potensielt to
Stripe-kunder via `hentEllerOpprettStripeCustomerId`-racen). Fikset med en
`useRef`-guard i `76a8af8` som sikrer fetch kun skjer én gang. Verifisert
med ny faktura (INV-000003): kun én `POST /api/payments/create-payment-intent`
denne gangen.

**Uavhengig av det**: begge betalingsforsøkene (før og etter fiksen) viste
**"A processing error occurred."** i UI-et etter at kortdetaljene ble sendt
inn — MEN Stripe CLI-loggen viste at betalingen faktisk gikk gjennom hver
gang (`charge.succeeded`, `payment_intent.succeeded`, alle webhooks `200`),
og fakturaen ble korrekt markert **Betalt** med PDF generert, akkurat som i
Checkout-flyten. Årsaken er trolig **ikke** en kodefeil, men en kjent
Stripe.js-begrensning: konsollen logger hver gang
`"You may test your Stripe.js integration over HTTP. However, live
Stripe.js integrations must use HTTPS."` — Checkout-flyten unngår dette
siden den redirecter til Stripes egen HTTPS-hostede side, mens
PaymentIntentForm kjører Stripe Elements-iframes direkte inne i vår egen
usikrede `http://localhost:3000`-side. **Bør IKKE oppstå i produksjon**
(HTTPS), men er ikke bekreftet — verdt å teste på en ekte HTTPS-deploy før
man stoler på at Bedrift-flyten er feilfri for sluttkunder. Hvis feilen
dukker opp igjen i produksjon, undersøk `stripe.confirmPayment()` sitt
returnerte `error`-objekt nærmere (kode/type), siden vi kun har sett den
generiske meldingen så langt.

**Fortsatt IKKE gjort:**
- Bekrefte at "A processing error occurred."-symptomet faktisk forsvinner
  på en ekte HTTPS-deploy (se punkt 8).
- Faktisk e-postutsending til en ekte kunde-adresse (nå som domenet er
  verifisert) — ikke separat bekreftet at kunden mottar fakturaen på e-post.
- `tilbudsmoduler.patch`, `extract-patch.ps1`, `apply-and-test.ps1` ligger
  fortsatt i repoet (sporet, committet). Bruker er enig i å slette dem, men
  `git rm` er **blokkert av auto-mode-klassifisereren** (filsletting av
  sporede filer krever at brukeren kjører kommandoen selv — ga brukeren
  kommandoen `git rm tilbudsmoduler.patch extract-patch.ps1
  apply-and-test.ps1 && git commit -m "..." && git push`). Ikke bekreftet
  utført ennå.

### 9. Full nøkkelrotasjon gjennomført — 2026-08-09
Bruker roterte alle nøkler som hadde ligget eksponert (`env.local`-funnet i
punkt 4 + limt inn i chatten flere ganger): Supabase `service_role`, Stripe
secret key, Stripe webhook secret (Dashboard-versjonen), og Resend API-nøkkel.

Viktig arbeidsprinsipp innført underveis: **nye nøkkelverdier limes ALDRI inn
i chatten** — bruker redigerer `.env.local` direkte selv, og verifisering
skjer via `curl` mot hver tjenestes API med verdien lest rett fra filen inn i
en shell-variabel, uten at verdien noensinne skrives ut/vises. Dette bør
være standard fremgangsmåte for all fremtidig nøkkelhåndtering i dette
prosjektet.

Underveis oppsto to reelle feil, begge rettet:
1. Første rotasjonsforsøk "tok ikke" — filen var ikke faktisk lagret (siste
   endring var fortsatt min egen fra tidligere økt). Løst ved å be bruker
   bekrefte filsti og faktisk lagre.
2. Etter lagring: Resend-nøkkelen hadde havnet i `NEXTAUTH_SECRET` ved en
   feil (så ut som `re_...`), mens `EMAIL_SERVER_PASSWORD` fortsatt hadde den
   gamle, nå ugyldige nøkkelen. Rettet automatisk (uten å vise verdiene i
   chatten): flyttet den feilplasserte verdien til `EMAIL_SERVER_PASSWORD`,
   genererte en ny tilfeldig `NEXTAUTH_SECRET`. Bekreftet med `curl` mot
   Resend API at nøkkelen nå er gyldig.

`STRIPE_WEBHOOK_SECRET` i `.env.local` er satt tilbake til den lokale
`stripe listen`-sesjonens egen secret (`whsec_980dc118...`, fortsatt kjørende
som PID 33000) — IKKE den nye Dashboard-secreten brukeren rullet. Den nye
Dashboard-secreten er trygt lagret på Stripe sin side og trengs først når en
ekte produksjons-webhook-endepunkt settes opp.

**Bivirkning (forventet, ikke en feil):** å rotere `NEXTAUTH_SECRET` ugyldig-
gjorde alle eksisterende innloggingssesjoner (JWT signert med gammel secret
kan ikke dekrypteres med ny). Bruker må logge inn på nytt.

Alle tre nøkler bekreftet fungerende via direkte API-kall (Stripe
`/v1/balance`, Resend `/domains`) etter fiksen.

### 10. ✅ Offentlig betalingslenke bygget, testet og merget — 2026-08-09 (PR #3, `25ecc31`)
**Hvorfor:** før dette kunne kun den innloggede håndverkeren åpne og betale en
faktura — sluttkunden hadde ingen vei inn. Det gjorde Stripe-integrasjonen til en
demo av en betalingsfunksjon, ikke en fungerende en. Bruker valgte å bygge det.

**Design:** `invoices.public_token` (uuid, unique, `default gen_random_uuid()`) +
siden `/betal/[token]` + rutene `/api/public/invoices/[token]`,
`/api/public/payments/create-checkout`, `/api/public/payments/create-payment-intent`.
**Tokenet ER autentiseringen** — samme mønster som Stripe/Xero sine payment links.
Beløp slås fortsatt opp server-side fra `invoices`-raden, aldri fra klienten, så
de offentlige rutene har ikke mer tillit enn de autentiserte.
`CheckoutButton`/`PaymentIntentForm` tar nå enten `invoiceId` (innlogget) eller
`token` (offentlig). Lenken legges ved i faktura-e-post og PDF, og håndverkeren
får en "Kopier betalingslenke til kunden"-knapp.
Migrasjon: `migrations/20260809_add_invoice_public_token.sql` (kjørt i Supabase).

**⚠️ Viktig bug funnet under live-testing — gjelder ALLE fremtidige sesjonsløse ruter:**
Etter betaling fortsatte kunden å se "Utkast" **med betalingsknappen fortsatt
synlig** — altså kunne de betalt to ganger. Databasen sa `paid` hele tiden; det
var lesestien som var råtten. Årsak: supabase-js kaller global `fetch`, som
Next.js patcher og cacher — **til disk i `.next/cache`**, så cachen overlevde både
server-restart og mitt første fiksforsøk. De innloggede `/api/invoices`-rutene har
aldri hatt problemet, men kun flaks: `getServerSession()` leser cookies, noe som
gjør ruten dynamisk og dermed opt-out av fetch-cachen automatisk.
**Fiks:** `export const dynamic = 'force-dynamic'` + `fetchCache = 'force-no-store'`
+ `revalidate = 0` på `/api/public/invoices/[token]`, samt `cache: 'no-store'` på
klient-fetchen. **Enhver ny GET-route-handler som ikke leser cookies/headers må
gjøre det samme** — fellen står fortsatt der for neste sesjonsløse rute.

**Verifisert end-to-end:** opprettet INV-000004 (kr 1750, Privat) → åpnet
`/betal/[token]` **uten sesjon** → betalte med testkort → webhooks alle `200` →
faktura `Betalt` → PDF generert. Public-API-en bekreftet å fungere helt uten
cookies (curl) og gir `404` på ukjent token. `tsc` og `next build` rene (26 ruter).

### 11. Firmaoppsett + småfunn — 2026-08-09
- **`firma`-rad opprettet** for brukerens konto: `firmanavn = "Tilbudsmaskinen AS"`
  (resten av feltene står tomme — bruker har ikke org.nr/adresse/kontonummer klart
  ennå). Dette er **per-bruker-data**: `firma` er scopet på `user_id`, så hvert
  firma som registrerer seg fyller ut sitt eget. Riktig modellert allerede.
- **Jeg logget ved et uhell ut brukeren.** Jeg klikket "lagre" via en selector som
  traff første `type="submit"` på siden — det var "Logg ut" i headeren. Opprettet
  derfor firma-raden direkte via Supabase REST i stedet for enda en
  magic-link-runde. **Konsekvens: lagre-knappen på `/innstillinger/firma` er
  fortsatt ikke klikk-testet.**
- **Sjekket en mulig felle som ville rammet alle nye brukere:** `POST /api/firma`
  bruker `upsert(..., { onConflict: 'user_id' })`, som krever unique-constraint på
  `firma.user_id`. Uten den ville lagring feilet for alle. Testet den faktiske
  upsert-veien via REST — den merget inn i samme rad (samme `id`), så constrainten
  finnes. **Ingen bug.**
- **Merk:** `.next` ble korrupt av at jeg kjørte `next build` (produksjon) inn i
  samme katalog som dev-serveren bruker → statiske chunks 404-et og sider hang på
  "Laster...". Løsning: stopp dev-server, `rm -rf .next`, start igjen. Verdt å vite
  neste gang en side henger uten feil i loggen.

### 12. ✅ Migrasjonen gjort idempotent + skjemavakt — 2026-08-09 (`1649204`)
**Problemet:** `20260808_...sql` kunne ikke kjøres om igjen (`relation already
exists`), og verre — mot et prosjekt der tabellene fantes fra før med et ANNET
skjema, gikk resten av skriptet gjennom mens tabellene ble stående feil.
Editoren meldte "Success", og appen knakk først senere med
`column customers.user_id does not exist`. Det skjedde faktisk her (punkt 7).

**Viktig innsikt:** å bare legge til `if not exists` ville gjort det **verre**,
ikke bedre — da blir en tabell med feil skjema *stille* hoppet over, som er
nøyaktig feilmodusen vi ville bli kvitt. Idempotens alene løser ingenting her.

**Løsningen, to deler:**
1. `create table if not exists` + `create index if not exists` — skriptet er nå
   trygt å kjøre om igjen.
2. **DEL 7, en `do $$`-sluttkontroll** som sammenligner faktisk skjema
   (`information_schema.columns`) mot de 40 kolonnene koden krever, og kaster
   `raise exception` med nøyaktig hvilke kolonner som mangler + oppskriften
   (`drop table ... cascade;` og kjør på nytt). Stille feil er dermed gjort om
   til en høylytt, handlingsrettet feil.

**Begge veier verifisert mot den levende databasen** (ikke bare antatt):
- Riktig skjema → skriptet kjører gjennom, "Success", ingen exception.
- Bevisst manglende kolonne → `ERROR: P0001: ... kontrollen fanger feil skjema.`
  med `DETAIL: Manglende: customers.denne_kolonnen_finnes_ikke`.

### 13. Firma-lagring og betalingslenke i PDF verifisert — 2026-08-09
- **Lagre-knappen på `/innstillinger/firma` er nå klikk-testet** (gjenstående
  punkt fra 11). Testet ordentlig: endret betalingsfrist 14 → 30, lagret,
  bekreftet i databasen at verdien faktisk ble persistert **og at rad-id-en var
  den samme** (`ea1867c0…`, altså oppdatering, ikke duplikat) — så
  `upsert(onConflict: 'user_id')` virker i praksis, ikke bare i teorien. Satte
  deretter tilbake til 14. GET-veien (utfylling av skjemaet) virker også.
- **Betalingslenken i faktura-PDF-en er verifisert objektivt**, ikke antatt:
  opprettet INV-000005 (ubetalt — betalte fakturaer får bevisst en annen tekst
  uten lenke), trykket "Generer og send", lastet ned PDF-en fra Supabase Storage
  og pakket ut tekststrømmene. PDF-en inneholder:
  `Betal enkelt med kort: http://localhost:3000/betal/1eb590ac-…` med token som
  matcher fakturaraden. Avsender står nå som "Tilbudsmaskinen AS".

**⚠️ Deploy-felle oppdaget:** lenken bygges av `appUrl()` i `lib/invoice.ts`,
som faller tilbake på `APP_URL` → `NEXTAUTH_URL` → `http://localhost:3000`.
**Settes ikke `APP_URL` (eller `NEXTAUTH_URL`) ved deploy, vil hver eneste
faktura-PDF og faktura-e-post sende kunden til `localhost:3000`** — altså en
død lenke hos kunden, uten noen feilmelding noe sted. Må settes før appen
brukes utenfor denne maskinen.

### 14. Faktura-e-post bekreftet visuelt i innboksen — 2026-08-09
Bruker delte skjermbilder av den faktisk mottatte e-posten for INV-000005:
- **Avsender: `TilbudsMaskinen <noreply@tilbudsmaskinen.no>`** — altså det
  verifiserte domenet, ikke `onboarding@resend.dev`. Domenebyttet fungerer.
- **Landet i Innboks**, ikke spam (magic-link-e-poster havnet i spam tidligere —
  verdt å følge med på).
- Emne: "Faktura INV-000005 fra Tilbudsmaskinen AS" — firmanavnet slår gjennom.
- Brødteksten har betalingslenken som **klikkbar hyperlenke**.
- PDF-vedlegget åpner og rendrer korrekt: FAKTURA / INV-000005 /
  Tilbudsmaskinen AS / Fakturers til / beløp / status / betalingsinformasjon.

**Ikke bevist av dette:** mottakeren var fortsatt `tilbudsmaskinen.no@gmail.com`
(kundens registrerte e-post), så levering til en *annen* adresse er fremdeles
utestet — se "Gjenstår" punkt 2.

### 15. Full bug-gjennomgang, optimalisering og opprydding — 2026-08-09
Systematisk gjennomlesing av hele kodebasen (alle 60 kildefiler), ikke bare
betalingsmodulen. Baseline før arbeidet: `tsc --noEmit` ren.

**Reelle bugs funnet og fikset:**

1. **`PaymentIntentForm` ga ingen tilbakemelding ved vellykket betaling.**
   `onSuccess` var en valgfri prop som **ingen av de to kallerne**
   (`InvoiceView`, `/betal/[token]`) faktisk sendte inn. Etter en godkjent
   kortbetaling uten redirect ble `status` bare satt til `idle` — skjemaet sto
   igjen uendret med "Betal"-knappen, og kunden kunne betalt på nytt. Nå
   sendes brukeren til `?betalt=1`-visningen (som allerede fantes på begge
   sider) hvis ingen `onSuccess` er gitt.
2. **`confirmPayment()` manglet `return_url`.** PaymentIntenten opprettes med
   `automatic_payment_methods: { enabled: true }`, så Stripe kan tilby
   metoder som krever redirect (3D Secure, Klarna, iDEAL). Uten `return_url`
   feiler `confirmPayment` for alle slike. Dette er **en mulig forklaring på
   "A processing error occurred."** fra punkt 8 — ikke bevist, men det var en
   ekte feil uansett. Feilobjektet logges nå med `type`/`code`/`decline_code`,
   og koden vises i UI-teksten, slik at neste forekomst faktisk kan
   diagnostiseres (etterspurt i punkt 8).
3. **Ny PaymentIntent ble opprettet ved HVER visning av betalingsskjemaet.**
   `useRef`-guarden fra punkt 8 stoppet bare StrictMode-dobling innenfor én
   sidevisning — hver reload lagde en ny. Ny `klargjorPaymentIntent()` i
   `lib/payments.ts` gjenbruker en eksisterende intent når status fortsatt er
   betalbar og beløp/valuta matcher, og kansellerer den hvis beløpet er
   endret. **Verifisert mot live-databasen:** `stripe_payment_intent_id` på
   INV-000005 var identisk før og etter reload.
4. **Webhooken kunne sende faktura-PDF og e-post to ganger.** Idempotency-
   sjekken er på `stripe_event_id`, men to *ulike* events på samme faktura
   (to Checkout-sesjoner opprettet før den første ble betalt) har ulike
   id-er og slapp derfor gjennom. Nå registreres betalingen fortsatt
   (pengene har jo beveget seg — `payments` er revisjonssporet), men er
   fakturaen allerede `paid`, logges et høylytt varsel om mulig
   dobbeltbetaling i stedet for å markere betalt og sende på nytt.
5. **Webhooken logget `console.error` for helt legitime events.** Stripe
   sender `payment_intent.succeeded` ved siden av
   `checkout.session.completed`, og session-metadata kopieres ikke til
   PaymentIntenten — så hver eneste Checkout-betaling ga en falsk feillinje
   i loggen. Nedgradert til en informativ `console.log`.
6. **`payment_intent.payment_failed` ble ikke håndtert i det hele tatt.**
   `markerFakturaFeilet()` fantes i `lib/payments.ts`, men var død kode — en
   faktura ble stående `pending` for alltid etter et avvist kort. Nå
   registreres det feilede forsøket og fakturaen settes `failed`. Viktig
   detalj: `failed` er lagt til i `kanBetales()` slik at kunden fortsatt kan
   prøve igjen med et annet kort — ellers hadde et avvist kort **låst**
   fakturaen.
7. **`kanBetale` var duplisert** i `InvoiceView` og `/betal/[token]` med hver
   sin kopi av samme betingelse. Flyttet til `kanBetales()` i
   `lib/fakturaStatus.ts` — de to visningene kan ikke lenger drifte fra
   hverandre om hvorvidt betalingsknappen skal vises.
8. **`/api/public/invoices/[token]` returnerte hele faktura- og firmaraden**
   til en uinnlogget klient: `user_id`, `customer_id`, `tilbud_id`,
   `stripe_payment_intent_id`, `stripe_checkout_session_id`, samt
   håndverkerens org.nr og bankkonto. Erstattet med en whitelistet DTO
   (`tilOffentligFaktura()`). **Verifisert med curl:** svaret inneholder nå
   kun fakturanummer, beløp, valuta, status, datoer, PDF-url, kundetype og
   firmanavn. Ukjent token gir fortsatt 404.
9. **`/betal/[token]` kunne indekseres av søkemotorer.** Ny
   `app/betal/layout.tsx` setter `robots: noindex, nofollow`. Lenkene deles
   på e-post og er uautentiserte — en indeksert betalingslenke ville lagt en
   kundes faktura åpent ut.
10. **`/result` krasjet med hvit skjerm** på ødelagt `sessionStorage`
    (`JSON.parse` uten `try/catch`). **Verifisert i nettleser:** plantet
    ugyldig JSON, siden viser nå "Ingen beregning funnet" og rydder opp.
11. **`ResultCard` kalte `/api/firma` uten sesjon.** `/result` er ikke
    middleware-beskyttet, så et garantert 401-kall fyrte av på hver visning.
    Gated på `useSession()`.
12. **Beløpsvalidering i `POST /api/invoices`**: `!amount || amount <= 0`
    slapp `Infinity` gjennom. Nå `Number.isFinite` + øvre grense.

**`supabase/schema.sql` var den farligste filen i repoet.** Den starter med
`drop table public.users cascade` — og alt henger på `users` via
fremmednøkler: `tilbud`, `firma`, `kunder`, `customers`, `invoices`,
`payments`. Å kjøre den i dag ville slettet **hele databasen inkludert
betalingshistorikken**, uten advarsel. Filen har nå en DEL -1-vakt som
avbryter hele skriptet hvis det finnes brukere fra før (SQL Editor kjører alt
i én transaksjon, så ingenting utføres). Fikset samtidig at `drop trigger ...
on next_auth.users` feilet i et helt nytt prosjekt (`IF EXISTS` gjelder
triggeren, ikke tabellen).

**Fjernet "ikke kjør next build mens dev-serveren kjører"-fellen** (punkt 11)
i stedet for bare å dokumentere den: `next.config.js` har nå
`distDir: process.env.NEXT_DIST_DIR || '.next'`, så et produksjonsbygg kan
kjøres side om side med dev-serveren:
`NEXT_DIST_DIR=.next-build npx next build`.

**Slettede filer:**
- `DEBUG.json` — en VS Code `launch.json` som lå i repo-roten under feil navn.
  VS Code leser aldri den stien; `.claude/launch.json` dekker dev-serveren.
  Ingen referanser til den i koden.
- `data/` — tom katalog igjen etter demo-JSON-lagringen. `lib/historikk.ts`
  har vært ren Supabase lenge. Fjernet sammen med `/data/tilbud.json`-linjen
  i `.gitignore`.

**Dokumentasjon brakt i samsvar med koden:**
- `.env.local.example` manglet **alle** Stripe-variablene og `APP_URL`. Den
  som satte opp prosjektet fra malen ville fått en app uten betaling og med
  døde betalingslenker. Alle fire lagt inn, med deploy-advarselen på `APP_URL`.
- `docs/payments-setup.md` beskrev `APP_URL` som "strengt tatt valgfri" —
  direkte feil, det er deploy-fellen fra punkt 13. Omskrevet.
- `README.md` var fra før betalingsmodulen: beskrev `/innstillinger` som
  firmaoppsett, nevnte verken fakturaer, kunder, `/betal/[token]` eller
  Stripe, og påsto at backend var uendret. Skrevet om.

**Verifisering:** `tsc --noEmit` 0 feil. Fullt `next build` rent — 26 ruter,
24 statiske sider. Live-testing mot dev-serveren av `/betal/[token]`
(både ubetalt bedrift-faktura med Elements og betalt faktura uten
betalingsknapp), `/historikk/invoices`, fakturadetalj og `/result` — ingen
konsollfeil noe sted.

### 16. Andre gjennomgang — funn første runde ikke fanget — 2026-08-09
Branch `fix/bug-sweep-cleanup` (pushet). Punkt 15 var én lesning av koden;
dette er det en runde til fant.

**⚠️ Alvorligst: betalingsskjemaet kom tilbake rett etter at kunden hadde
betalt.** Min egen fiks i punkt 15 (redirect til `?betalt=1` ved vellykket
Elements-betaling) gjorde dette **mer sannsynlig**, ikke mindre: siden lastet,
hentet fakturaen, og webhooken hadde som regel ikke rukket å markere den
betalt ennå — så status var fortsatt `pending`, `kanBetale` ble sann, og
kunden fikk «Betaling gjennomført» **sammen med et fullt betalingsskjema**.
Nøyaktig samme dobbeltbetalings-felle som punkt 10 beskrev for den offentlige
siden, bare med en annen årsak. Gjelder også Checkout, som returnerer til
`/historikk/invoices/[id]?betalt=1`.
**Fiks:** begge sidene skjuler nå betalingsseksjonen så lenge `?betalt=1` står
i URL-en og status ikke er `paid`, viser «Bekrefter betalingen hos Stripe...»,
og poller hvert 2. sekund i inntil 20 sekunder. Gir polleren opp, slippes
knappen fram igjen — ellers ville en bokmerket `?betalt=1`-lenke låst en
ubetalt faktura for alltid.

**Fakturanummer var én global sekvens for hele installasjonen.**
`next_invoice_number()` brukte `public.invoice_seq`, mens appen er flerbruker
(`invoices`, `firma`, `customers` er alle scopet på `user_id`). To håndverkere
som fakturerer om hverandre ville fått hver sin hullete serie — A: INV-000001,
INV-000003; B: INV-000002. Bokføringsforskriften krever fortløpende
nummerering per utsteder. Med bare én bruker i basen har dette aldri vist seg;
det slår først inn i det bruker nummer to lager sin første faktura — altså
nøyaktig ved «klart for kolleger».
**Fiks:** ny migrasjon `20260810_per_user_invoice_numbering.sql` — teller per
bruker, ny `next_invoice_number(uuid)`, og unikhet flyttet fra global
`invoice_number` til `(user_id, invoice_number)` (ellers ville både A og B sin
INV-000001 kollidert). Telleren settes til høyeste eksisterende nummer per
bruker + 1, ikke `count(*)+1`, som ville truffet et nummer brukeren allerede
har hvis serien hadde hull.
**Koden har en fallback:** kjøres migrasjonen ikke, faller
`nesteFakturanummer()` tilbake på den gamle sekvensen og logger et varsel, i
stedet for at fakturering stopper opp. Verifisert mot live-basen at den nye
signaturen gir `PGRST202` i dag, altså at fallbacken faktisk trigges.

**En kansellert faktura kunne fortsatt betales.** Statusen `cancelled` fantes i
databasen og i statusfilteret, men **ingenting satte den noen gang** — en
blindvei i UI-et. Verre: de fire betalingsrutene sjekket bare `status ===
'paid'`, så hadde noe først satt `cancelled`, kunne kunden betalt via en gammel
lenke likevel.
**Fiks:** `PATCH /api/invoices/[id]` med kansellering (en BETALT faktura kan
ikke kanselleres — `.neq('status','paid')` gjør det til en databasebetingelse,
ikke bare en sjekk i ruten), knapp i `InvoiceView`, og ny delt
`ikkeBetalbarGrunn()` som alle fire betalingsrutene bruker.
«Send på nytt» blokkerer også kansellerte fakturaer.
**Verifisert live:** kansellerte INV-000005 → begge offentlige betalingsruter
svarte `400 "Fakturaen er kansellert og kan ikke betales."` → kundens side
skjulte betalingen → forsøk på å kansellere en betalt faktura ga `400` →
`{"status":"paid"}` i payloaden ga `400`. Satt tilbake til `pending` etterpå.

**`formatKr`/`formatDato` var kopiert ut i sju filer.** En retting måtte gjøres
sju steder for å slå gjennom. Samlet i `lib/format.ts` — og i samme slengen
rettet at beløp ble vist med `Math.round()`: en faktura på 1500,50 sto som
«kr 1 500,-» i både UI og PDF, mens Stripe trakk 1500,50.

**Mindre, men reelle:**
- `hentLogo()` hadde ingen timeout, og kjører inne i Stripe-webhooken. Henger
  Storage, henger webhook-svaret; Stripe gir opp og prøver igjen, og da
  stopper idempotency-sjekken andre forsøk — fakturaen blir stående betalt
  **uten** PDF og e-post. Nå 5 sekunders `AbortController`.
- `hentFirmaForBruker()` slukte databasefeil helt. Konsekvensen var stille:
  faktura generert med avsender «TilbudsMaskinen» i stedet for firmanavnet,
  uten spor av hvorfor.
- Kommentaren i `sendFakturaEpost` forklarte fortsatt feilhåndteringen med
  Resend sandbox-begrensningen, som ikke lenger gjelder (punkt 14). Byttet til
  den faktiske grunnen: kaster vi videre her, svarer webhooken 500, Stripe
  prøver igjen, og idempotency-sjekken stopper forsøk to uansett.

**Verifisering:** `tsc --noEmit` 0 feil, fullt `next build` rent (24 sider).
Live-testet kansellering, betalingsblokkering, DTO-en og formateringen.
`env.local` (uten punktum) er slettet — identisk nøkkelsett med `.env.local`,
og Next.js leste den aldri.

**Bevisst IKKE gjort — krever din avgjørelse:**
- **MVA/moms mangler helt.** Fakturaene har ingen mva-linje og ingen
  mva-sats. Er du mva-registrert, er en faktura uten mva-spesifikasjon ikke
  gyldig. Å legge det til er ikke en bugfiks: det må avgjøres om prisene
  kalkulatoren gir er inkl. eller eks. mva, og det endrer hele prismodellen.
- **Kunder kan ikke redigeres eller slettes.** `/kunder` er bare opprett +
  list. Feil e-post på en kunde kan i dag ikke rettes.
- **Storage-bucketene er offentlige.** Faktura-PDF-er ligger på gjettbare
  (men uuid-baserte) URL-er. Dokumentert som et bevisst valg i migrasjonen —
  for ekte kunder bør det byttes til privat bucket med signerte URL-er.

### 17. Ytelse og brukeropplevelse — 2026-08-09 (etter PR #4)
Egen runde med bare to spørsmål: hva er tregt, og hva er unødvendig tungvint.

**⚠️ Appen var i praksis ubrukelig på mobil.** Headeren trengte **865 px**
minimum (målt: logo 167 px + seks lenker + e-postadressen alene på 203 px),
mot 375 px på en vanlig telefon. Resultatet var sidelengs scroll på hver
eneste side, og **«Logg ut» lå helt utenfor skjermen** — det var ingen måte å
logge ut på fra telefon. For en app som skal brukes av håndverkere ute på jobb
er dette det viktigste enkeltfunnet i hele gjennomgangen.
**Fiks:** ekte mobilmeny (hamburger under `md`, full nav over), e-posten
flyttet inn i menyen. Verifisert i 375 px: dokumentbredde = viewport, null
overflow-elementer, menyen åpner/lukker og inneholder alle sju punkter
inkludert «Logg ut».

**Sluttkunden fikk håndverkerens meny.** `/betal/[token]` arvet hele
app-rammen — «Nytt tilbud», «Mine tilbud», «Kunder», «Mitt firma» — til en
person som ikke har konto og aldri får bruk for dem, pluss en «Logg inn»-lenke
rett inn i en blindvei. `AppLayout` renderer nå bare innholdet for `/betal/*`.
Verifisert: siden har verken header eller footer, og **null interne lenker**.

**Knapper som ikke var lesbare.** `variant="secondary"` var hvit tekst på
`bg-white/10` — laget for den mørke sidebakgrunnen, men brukt inne i de lyse
kortene seks av åtte steder. Målt kontrast **1.1** mot kortbakgrunnen, der
WCAG AA krever 4.5. «Last ned PDF», «Send på nytt», «Kopier betalingslenke»
og «Kanseller faktura» var alle i praksis usynlige. Varianten er nå navngitt
etter underlaget (`secondary` = lyst kort, `secondaryDark` = mørk bakgrunn).
Målt etterpå: **14.16**. Fylte varianter fikk `border-2 border-transparent` så
høyden matcher, ellers ble «Lagre» og «Avbryt» 4 px ulike.

**`/result` var appens tyngste side med god margin** — 238 kB First Load JS,
fordi hele jsPDF lå i startbunten for en knapp de fleste aldri trykker. Nå
`await import('jspdf')` inne i nedlastingshandleren: **238 kB → 108 kB**.

**Kunder kunne ikke redigeres eller slettes** (flagget i punkt 16). Ny
`PATCH`/`DELETE /api/customers/[id]` og inline redigering i `/kunder`. Sletting
av en kunde som har fakturaer gir 409 med forklaring i stedet for en rå
databasefeil — verifisert mot live-basen at constrainten faktisk gir `23503`.
Begge rutene svarer 401 uten sesjon. **Ikke klikk-testet i UI**: sesjonen gikk
tapt da dev-serveren startet på nytt, og ny innlogging krever magic-link.

**Mindre:**
- `/historikk/invoices/ny` lastet ned **hele** tilbudshistorikken for å finne
  ett tilbud med `.find()` på klienten. Ny `GET /api/tilbud/[id]`.
- `/api/firma` ble hentet to ganger på `/result` (headeren + ResultCard). Ny
  `FirmaProvider` deler resultatet.
- Tilbudskortene i historikken var klikkbare `div`-er med en lenke og en knapp
  nøstet inni — umulig å nå med tastatur. Nå er tilbudet en `button` som fyller
  raden (like stort trykkmål), med handlingene ved siden av.
- Beløp i fakturalisten brøt til «kr» / «999,-» på mobil.

**Verifisering:** `tsc` 0 feil, `next build` rent (24 sider). Mobil målt i
375 px iframe for `/`, `/logg-inn`, `/betal/[token]` og `/historikk/invoices`
— ingen sidelengs scroll noe sted.

### 18. Klargjort for deploy og kollega-test — 2026-08-09
Branch `ux/mobil-ytelse-kunderedigering`.

**Erkjennelsen:** hele «Gjenstår»-lista henger på én ting — appen finnes bare
på `localhost:3000`. Kollegaer kan ikke nå den, HTTPS-spørsmålet (punkt 8) kan
ikke avgjøres, og `APP_URL` kan ikke settes riktig før appen har en ekte
adresse. Deploy er ikke ett punkt på lista; det er forutsetningen for resten.

**`docs/deploy.md`** er skrevet som en rekkefølge, ikke en liste: migrasjonen
først (før bruker nummer to lager sin første faktura), så deploy, så `APP_URL`
når adressen finnes, så Stripe-webhooken mot den adressen. Med full env-tabell
og en avkryssingsliste å kjøre før noen inviteres.

**Ny bruker fikk ingen beskjed om firmaoppsett.** En kollega som logger inn har
ingen `firma`-rad. Ingenting i appen sa fra — og fakturaene deres ville gått ut
med «TilbudsMaskinen» som avsender i stedet for deres eget firmanavn, uten at
de oppdaget det før kunden hadde fått den. Nå vises et gult varsel med lenke til
firmaoppsettet, skjult på selve innstillingssiden. `FirmaProvider` skiller
«har ikke firma» fra «vet ikke ennå», ellers ville varselet blinket til på hver
sidelast mens kallet pågikk.

**Miljøvariabler feilet uleselig.** `lib/supabase.ts` og `lib/auth.ts` castet
`process.env.X as string`. Manglet en av dem på en fersk deploy, feilet bygget
med `supabaseUrl is required` fra inni supabase-js — uten å si hvilken
variabel eller hvor den skulle settes. Ny `paakrevdEnv()` i `lib/env.ts`.
**Verifisert** ved å kjøre `next build` med `SUPABASE_URL` tom:
`Error: Miljøvariabelen SUPABASE_URL mangler. Se .env.local.example ...`

**`appUrl()` lå i tre identiske kopier** (begge checkout-rutene +
`lib/invoice.ts`). Den bygger betalingslenken kunden får i PDF og e-post — en
retting som bare traff to av tre ville vært verre enn ingen. Samlet i
`lib/env.ts`, og den logger nå et varsel i produksjon hvis verken `APP_URL`
eller `NEXTAUTH_URL` er satt, i stedet for stille å falle tilbake på localhost.

**`maxDuration = 60` på webhooken.** Den genererer PDF, laster opp til Storage
og sender e-post før den svarer. Ryker vertens standardgrense underveis, får
Stripe aldri 200 og prøver igjen — og da stopper idempotency-sjekken forsøk to,
slik at fakturaen blir stående betalt uten PDF og e-post.

### 19. Merverdiavgift — 2026-08-09
Bruker valgte: **inkl./eks. mva velges per faktura**, med standardvalg i
firmaoppsettet, og **ikke mva-registrert i dag** — støtten bygges, men er av
til den slås på.

**Modell:**
- `firma.mva_sats` — 0 betyr ikke mva-registrert. Ingen egen boolean: satsen
  ER av/på-bryteren, så de to kan ikke komme i utakt.
- `invoices.mva_sats` — **snapshot** av satsen da fakturaen ble laget. Endrer
  firmaet sats senere, skal en allerede sendt faktura stå urørt.
- `invoices.mva_inkludert` — om `amount` allerede inneholder mva.

**Alle defaults er 0/false med vilje.** Eksisterende fakturaer får dermed
`total = amount` — nøyaktig beløpet de allerede krever. Migrasjonen endrer
ikke hva én eneste eksisterende faktura koster.

**Det viktigste skiftet i koden:** Stripe trekker nå `fakturaBelop(f).total`,
ikke `f.amount`. Legges mva på toppen er de to ulike, og `amount` ville
trukket for lite. Samme funksjon brukes av PDF, alle tre visningene og
`payments`-raden — én kilde, så de ikke kan spa fra hverandre.

**PDF-en** viser nå Grunnlag / Merverdiavgift X % / Å betale når satsen er over
0, og org.nr får MVA-suffiks — begge deler kreves av en mva-registrert
utsteder. Uten mva ser fakturaen ut som før.

**Avrunding:** `mva` rundes først, og `total` utledes av grunnlag + mva.
Regner man total for seg kan linjene bomme med ett øre, og en faktura som ikke
går opp er en faktura kunden ringer om. **Enhetstestet** (kompilert
`lib/mva.ts` og kjørt mot syv tilfeller): ingen mva, 25 % på toppen, 25 %
inkludert, øre-brøk, at grunnlag + mva === total eksakt i begge retninger, og
at "inkludert" er den eksakte inversen av "på toppen". Alle OK.

**⚠️ `migrations/20260811_mva.sql` MÅ kjøres før den nye koden er i drift** —
uten `invoices.mva_sats` feiler oppretting av faktura med
`column "mva_sats" does not exist`. Til forskjell fra nummerering-migrasjonen
har denne ingen fallback: feilen er høylytt og øyeblikkelig, ikke stille.

### 20. Migrasjonene kjørt mot produksjonsbasen — 2026-08-09
Kjørt via Supabase SQL Editor i brukerens egen Chrome (Claude har ingen
DDL-vei: PostgREST er et lag over tabeller og funksjoner, ikke en SQL-konsoll,
og verken `psql`, Supabase CLI eller databasepassord finnes på maskinen).
SQL-en ble lagt inn i Monaco-editoren og kjørt mot `main PRODUCTION`.

- `20260810_per_user_invoice_numbering.sql` → Success
- `20260811_mva.sql` → Success

**Verifisert uavhengig via REST etterpå**, ikke bare på editorens «Success»:

| Sjekk | Resultat |
|---|---|
| `invoice_counters` seedet | `neste_nummer = 6` for eksisterende bruker — høyeste faktura er INV-000005, så neste blir INV-000006 uten hull |
| `next_invoice_number(uuid)` | finnes og kjører (kall med falsk bruker gir FK-feil mot `users`, altså at funksjonen faktisk utfører insertet) |
| Alle 5 eksisterende fakturaer | `mva_sats = 0`, `mva_inkludert = false` → `total = amount` |
| `firma` | `mva_sats = 0` — ikke mva-registrert, som valgt |

**Ingen eksisterende faktura endret beløp.** Appen svarer 200 på alle ruter og
det offentlige faktura-API-et leser nå de ekte mva-kolonnene
(`"mva":{"sats":0,...}`) i stedet for å degradere.

Appen bruker fra nå av per-bruker-nummerering — fallback-varselet i
`nesteFakturanummer()` skal ikke lenger dukke opp i loggen.

### 21. ⚠️ APPEN ER DEPLOYET — 2026-08-12

**Adresse: https://tilbudsmodulen-ev335s-projects.vercel.app**

`tilbudsmodulen.vercel.app` var opptatt av et annet prosjekt, så Vercel ga
den lengre varianten med team-slug.

**Hvordan det ble gjort:** bruker forsto ikke stegene, så vi gikk gjennom det
klikk for klikk i deres egen Chrome. Jeg navigerte og fylte ut alt jeg kunne;
bruker gjorde de to tingene jeg ikke skal gjøre — GitHub-innloggingen (som
oppretter Vercel-kontoen) og innlimingen av nøklene.

**Nøklene:** `.env.local` ble åpnet i Notepad og limt inn i Vercels Key-felt.
Vercel deler et helt `.env`-innhold automatisk i separate variabler. Alle 14
kom inn. Merk at "Import .env"-knappen åpner en filvelger som ikke tok imot en
innlimt sti — innliming av selve innholdet er veien som virker.

**⚠️ Deployment Protection måtte slås av.** Vercel slår på "Vercel
Authentication" som standard: alle besøkende ble sendt til en Vercel-innlogging.
Det ville stoppet kollegaene — og verre, **kundenes betalingsside
`/betal/[token]` ville vært utilgjengelig**, altså hele betalingsflyten død.
Slått av under Settings → Deployment Protection (krever at man skriver
"disable vercel authentication" som bekreftelse). Verifisert etterpå:
`/` svarer 200 med forsiden.

**Miljøvariabler rettet etter første deploy:**
- `NEXTAUTH_URL` sto som `http://localhost:3000` fra `.env.local`. Første
  forsøk på å endre verdien gikk ikke gjennom, uten at UI-et sa fra —
  Vercels lagrede verdier er skrivebeskyttet, så feilen ble først synlig da
  `/api/auth/providers` fortsatt svarte localhost etter to deploys.
  **Løst ved å slette variabelen helt.** På Vercel utleder NextAuth adressen
  fra forespørselen, så den retter seg selv når domenet kobles på senere.
  **Verifisert:** `signinUrl` og `callbackUrl` peker nå på vercel-adressen.
- `APP_URL` fantes ikke i `.env.local` — lagt til med samme adresse. Uten den
  peker betalingslenken i hver faktura-PDF og faktura-e-post til localhost.

**Vercel-UI-et er tungt å automatisere.** Verdifeltene er ikke `input`-elementer,
tastetrykk med `/` i havner i søkefeltet (Vercel bruker `/` som snarvei), og
lagrede verdier er skrivebeskyttet så de ikke kan leses tilbake for
verifisering. Bruk heller en git-push for å utløse deploy enn Redeploy-knappen.

### 22. ✅ Stripe-webhook satt opp mot produksjon — 2026-08-12

Endepunktet **`tilbudsmaskinen-vercel-prod`** (`we_1U3hPYGmxqihrRSkawIf9plO`)
opprettet i Stripe Workbench mot
`https://tilbudsmodulen-ev335s-projects.vercel.app/api/webhooks/stripe`,
med nøyaktig de tre eventene ruta faktisk håndterer. Ny `whsec_...` limt inn i
`STRIPE_WEBHOOK_SECRET` i Vercel av bruker (jeg hverken leser eller limer inn
hemmeligheter), deretter redeploy.

**Verifisert, ikke antatt:** `stripe trigger payment_intent.succeeded` fra
Workbench-shellen ga **200 OK / Delivered**. Det beviser tre ting på én gang —
Stripe når fram (ingen Deployment Protection i veien), signaturen verifiseres
med den nye secreten, og ruta svarer riktig. Med den gamle `stripe listen`-
secreten ville svaret vært `400 Ugyldig signatur`.

Detaljer verdt å huske:

- **Kontoen er en Stripe *sandbox*** (`acct_1U2D7zGmxqihrRSk`,
  «TILBUDSMASKINEN sandbox»). Bekreftet via `GET /v1/account` med appens egen
  nøkkel at det er *samme* konto — ellers hadde webhooken havnet i feil miljø.
- **Payload style må være «Snapshot», ikke «Thin».**
  `stripe.webhooks.constructEvent` forventer v1-payloaden.
- **Vercel: verdien lot seg endre denne gangen.** Punkt 21 sa at lagrede
  verdier er skrivebeskyttet — det stemmer for *lesing* («Copy to Clipboard» er
  låst på Sensitive-variabler), men «… → Edit» lar deg skrive en ny verdi.
  Vercel varsler selv at ny deploy trengs, med Redeploy-knapp i meldingen.
- **Vercel-UI-et hopper.** Etter Save scroller siden til toppen, så et
  oppfølgingsklikk på gamle koordinater treffer feil rad — i verste fall en
  «Delete» i en «…»-meny. Les av siden på nytt før hvert klikk.
- **Prosjektet har to vercel.app-adresser**: `tilbudsmodulen-one.vercel.app`
  (den Vercel viser i prosjektlista) og
  `tilbudsmodulen-ev335s-projects.vercel.app` (den `APP_URL` og webhooken
  bruker). Begge peker på samme deploy.

**Ryddet samtidig:** to eldre event-destinasjoner pekte på
`https://tilbudsmaskinen.no/` — `we_1U2DWx...` med **alle 241** event-typer og
100 % feilrate, pluss en «Thin»-variant (`ed_test_61VBbUJ...`, 24 events).
Begge satt til **Disabled**, bevisst ikke slettet: deaktivering er reversibel
og gir samme effekt. De måtte tas nå, ikke senere — når `tilbudsmaskinen.no`
kobles på Vercel, ville de begynt å POSTe hele event-strømmen mot forsiden.
Verifisert via `GET /v1/webhook_endpoints` og `/v2/core/event_destinations`:
de to gamle står `disabled`, vår står `enabled` med 3 events.

### 22b. Kalkulatoren bygget om — prismodellen matchet ikke virkeligheten — 2026-08-13

Kollegatest ga tilbakemelding om at tallene var feil: en jobb til ca. 34 000 kr
kom ut på 100 000. Flere kollegaer, ulike fag. Reproduserte og fant **tre feil**,
ikke én feiljustert sats:

1. **AI-en regnet prisen, og kunne ikke regne.** Sju av sju testkall mot
   `gpt-4o-mini` ga aritmetisk umulige svar — `pris` stemte ikke med
   `timer × timepris + materialer + margin` i et eneste tilfelle, med avvik opp
   til 52 500 kr. Samme jobb ga 0,34x eller 1,45x av husmodellen. Marginen appen
   viste håndverkeren var oppdiktet. Ingenting validerte AI-svaret før det gikk
   ut til kunden.
2. **Alle fag delte ett `romstørrelse i m²`-felt.** Maler prises per m²
   veggflate, gulvlegger per m² gulv, elektriker per punkt, rørlegger som
   fastpris per jobb, bilpleie per bil. Feltet sa heller ikke om m² var gulv
   eller vegg — en faktor 2,5 helt alene. (Bruker påpekte selv at tak og vegg må
   kunne oppgis hver for seg; det er nå egne linjer.)
3. **Håndverkeren så ingen utregning** — bare en pris, umulig å ettergå.

**Målt mot marked før ombygging:** maler 511 kr/m² mot marked 140–280, gulv
1 361 kr/m² mot 150–350 i arbeid, mens rørlegger lå 2–3x for LAVT (38 929 kr for
et bad der markedet er 65 000–125 000).

**Ny modell (valgt av bruker: enhetspris per fag + AI kun til tekst):**
- Et tilbud er nå **linjer**, hver med egen enhet: m² vegg, m² tak, m² gulv,
  punkt, stk, løpemeter, time.
- Det som er kalibrert er `timerPerEnhet` — produktivitet, ikke pris. Timepris og
  margin er håndverkerens egne, så tallet blir deres eget.
- `markedLav/markedHoy` brukes ikke i utregningen, kun til å varsle når prisen
  havner utenfor det kunden finner andre steder — begge veier.
- AI-en får det ferdige regnestykket og skriver kun teksten. Gjengir teksten et
  annet totalbeløp enn det som ble regnet ut, forkastes den og malen tar over.
- Skjemaet viser regnestykket live, og resultatsiden viser det per linje.
- `marginSomPaaslag()` viser at 25 % margin = 33 % påslag, så ingen blir
  overrasket av dekningsgrad-formelen.

**Verifisert:** `tsc --noEmit` rent, `next build` rent, dev-server kjører uten
feil. Kalibreringstest kjørt mot alle operasjoner: **alle markedsforankrede
satser lander innenfor båndet** (maler vegg 173 kr/m² mot 140–280, flis
1 432 mot 900–1 600, elektrisk punkt 1 786 mot 1 200–2 000, rørleggerdel bad
107 857 mot 65 000–125 000).

**Ikke gjort:** ingen har klikket gjennom skjemaet ennå — `/calc` krever
innlogging, og jeg utløser ikke magic-link til brukerens innboks. Malervennen
skal ta en runde i praksis.

**Trenger fagperson:** sju satser står som `anslag` uten markedsdata (sparkling,
lister, membran, bytte WC/servant, bilpleie). De gir varsel i appen. Se
`docs/priser.md`.

**Bakoverkompatibelt:** gamle tilbud i historikken har `romstorrelseM2` og ingen
linjer. `omfangTekst()` faller tilbake på det gamle feltet, så historikken
fortsetter å vise riktig.

### 23. Prismodellen ute i produksjon, OpenAI-nøkkelen fjernet — 2026-08-13

**`OPENAI_API_KEY` slettet fra Vercel** (Production og Preview) på brukerens
beskjed, og redeploy kjørt. Verifisert: søk på «OPENAI» i variabellista gir
«No Results Found». Nøkkelen brukes kun i `lib/ai.ts` med trygg fallback og står
ikke i `lib/env.ts` sine påkrevde variabler, så bygget tåler at den er borte.

Merk to ting Vercel selv sier i slettedialogen og som lett misforstås:
- Sletting fjerner nøkkelen fra appen, **ikke fra OpenAI**. Vil den være ugyldig,
  må den trekkes tilbake på platform.openai.com. Den ligger fortsatt i brukerens
  lokale `.env.local`.
- Den redeployen tok 2 min 54 s mot 32–58 s på alle tidligere bygg — kaldt bygg
  uten cache etter env-endring. Ikke en feil, men ikke la deg lure til å tro at
  den henger.

**Pushet og deployet:** `9683094..52b0609`. Deploy `52b0609` er Ready (37 s) og
markert Production.

**Verifisert mot den live appen etter deploy:** forsiden og `/logg-inn` svarer
200, `/calc` redirecter (307) uten innlogging, og Stripe-webhooken svarer
fortsatt `400 Mangler stripe-signature-header` — betalingsflyten er urørt av
kalkulator-ombyggingen.

**Tilstanden kollegaene møter nå:** ny linjemodell, regnestykket synlig i
skjemaet og per linje på resultatsiden, markedsvarsel begge veier, og malbasert
tilbudstekst (siden nøkkelen er borte). Tallene er identiske med eller uten
AI — den rører dem ikke lenger.

### 24. Bug-runde etter klikk-testing i produksjon — 2026-08-13 (`e9243f7`)

Kjørte hele flyten innlogget i produksjon: skjema → server → historikk → PDF.
Tallene stemte overalt (48 133 kr på tre uavhengige beregninger), men runden
fant **seks feil** som bare viste seg ved å lese den genererte PDF-en og teste
grensetilfeller — ingen av dem ga typefeil eller byggfeil.

1. **jsPDF slettet stille tegn utenfor WinAnsi.** Tankestreken i tilbudslinjene
   var rett og slett borte i PDF-en: «130 m² veggflate  kr 26 433,-». Ikke
   erstattet med noe synlig — bare vekk. **Gjelder også faktura-PDF-en som
   sendes til kundene**, der firmanavn, adresse og kundenavn er frie tekstfelt.
   En kunde som heter «Kjell–Ove» ville fått navnet feilstavet på fakturaen.
   Ny `lib/pdftekst.ts` vasker teksten. All tekst i faktura-PDF-en går nå gjennom
   én `skriv()`-funksjon, ikke `doc.text` direkte, så neste kall ikke gjeninnfører
   feilen.
2. **Margin 100 % ga `pris = Infinity`** i forhåndsvisningen (divisjon på null),
   over 100 % ga negativ pris. API-et avviste det, men skjemaet regnet videre og
   viste «Sum: kr Infinity». Stoppet i `beregnLinje`, ikke bare i validering.
3. **Timepris 0 eller negativ** slapp gjennom til utregningen.
4. **Linjer brukte indeks som React-key.** Slettet du linje 1 av 3, arvet neste
   linje inputfeltene til den slettede — verdier hoppet mellom rader.
5. **To like linjer ga duplikate React-keys** i forhåndsvisning, advarsler og
   regnestykket på resultatsiden.
6. **Serveren stolte blindt på prisen klienten sendte inn** — og den prisen
   havner på en kundefaktura. `verifiserPris()` regner nå etter ved POST og
   PATCH. Gamle tilbud uten linjer hoppes over, så de fortsatt kan lagres.

**`scripts/pristest.ts`** dekker alle seks. Kjør med `npm run test:pris`.
Ti tester, ingen testrammeverk — vanlig skript med exit-kode, klart for CI.

**Verifisert etter deploy:** samme tilbud, ny PDF hentet fra den deployede
appen — tankestreken er nå på plass: «130 m² veggflate - kr 26 433,-».

**Lærdom verdt å ta med:** alle seks bugene overlevde `tsc --noEmit` og
`next build`. De ble funnet ved å bruke appen og lese output-filen. Den
PDF-feilen hadde gått rett til kundene uten at noen så den før en kunde med
bindestrek i navnet klaget.

### 25. Markedsanalyse og egen prisbok — 2026-08-13

**Markedet er delt i to, med et tomrom i midten:**

| Segment | Hva de gjør | Pris |
|---|---|---|
| Fagsystemer (Cordel, Håndverksdata, Ordrestyring) | Full kalkulasjon med Norsk Prisbok, prosjektstyring, FDV | **1 290–2 499 kr per bruker per måned** |
| Fakturaprogrammer (MinFaktura, Conta, Debet, Fiken) | Sender faktura, fører regnskap | 0–229 kr/mnd |

**Hullet:** fakturaprogrammene starter *etter* at prisen er bestemt. Verktøyet
som svarer på «hva skal jeg ta betalt?» koster 1 290 kr i måneden og er bygget
for firmaer med ansatte. Enkeltpersonforetaket står igjen med kalkulatoren i
hodet — og underpriser. Rørlegger-funnet vårt viste det svart på hvitt:
modellen lå 2–3x for LAVT mot marked før ombyggingen.

**Posisjonering:** prisbeslutning for enkeltpersonforetak, til
fakturaprogram-pris. Cordels vollgrav er Norsk Prisbok. Vår må være
**håndverkerens egen prisbok** — og den kunne ikke engang redigeres før nå.

**Bygget: egne satser per bruker.**
- Migrasjon `20260813_prissatser.sql` — ny tabell `prissatser` (idempotent).
  **Må kjøres i Supabase SQL Editor.**
- `/innstillinger/priser` — «Mine satser». Hver operasjon kan justeres, viser
  hva satsen gir per enhet mot markedsbåndet mens du skriver, og har
  «Tilbake til standard».
- Kun endrede verdier lagres. Rører du ikke en sats, følger du fortsatt
  oppdaterte markedstall i koden. Nullstilling sletter raden.
- **Satsen lagres MED tilbudet** som et øyeblikksbilde (`timerPerEnhet` per
  linje). Endrer håndverkeren satsen i morgen, kan et tilbud sendt i dag
  fortsatt etterregnes og gi samme sum — og `verifiserPris()` fortsetter å
  virke.
- Uten migrasjonen kjørt: appen faller tilbake på standardsatsene i stedet for
  å feile. Lagring vil da gi feilmelding.

**Neste steg for vollgraven — etterkalkyle.** Registrer faktisk tidsbruk etter
endt jobb, sammenlign med estimatet, og la appen foreslå justering av
`timerPerEnhet`. Da blir prisboken selvlærende, og det er noe ingen i det
billige segmentet har. Fundamentet er på plass: satsen ligger allerede per
bruker og per operasjon, og tilbudet bærer med seg satsen det ble laget med.

**To ting som fortsatt stopper ekte pengebruk:** alle betalinger går til
eierens Stripe-konto uansett hvem som fakturerer (krever Stripe Connect), og
det finnes ingen regnskapseksport til Fiken/Tripletex.

### 26. Migrasjonen kjørt — og RLS-hullet den hadde — 2026-08-14

**Skjemaet ble revidert mot produksjon før noe ble kjørt.** Alle fem
migrasjoner sjekket enkeltvis mot live-basen i stedet for mot notatene her:
20260808, 20260809, 20260810 og 20260811 var alle inne. Kun `prissatser`
manglet.

**Funn: migrasjonen manglet RLS.** Hver eneste andre tabell i basen — alle 12
— står med `relrowsecurity = true` og null policyer, slik at all tilgang må gå
via service_role på serveren. `20260813_prissatser.sql` slo aldri på RLS.
Tabellen ville dermed ligget åpen for lesing og skriving gjennom PostgREST for
den som har anon-nøkkelen, og innholdet er håndverkerens egen prisbok — det
punkt 25 kaller vollgraven. Lagt til før kjøring, mens tabellen ennå ikke
fantes; etterpå hadde det krevd en ny migrasjon.

Migrasjonen fikk samtidig en **sluttkontroll** i samme mønster som 20260810 og
20260811 (som begge har en; denne hadde ingen). Den verifiserer tabellen, de
fem kolonnene appen faktisk skriver til, unique-constrainten som
`onConflict: 'user_id,operasjon_id'` er avhengig av, og at RLS er på — og
kaster `exception` hvis noe mangler.

**Kjørt i Supabase SQL Editor 2026-08-14.** `Success. No rows returned`, altså
passerte alle fire kontrollene. Verifisert etterpå på to uavhengige måter:
REST-API-et svarer 200 på `prissatser` med service_role, og en spørring mot
`pg_class` viser at tabellen nå står likt med de elleve andre
(`rls_pa = true`, `antall_policyer = 0`).

**Skrivebanen er rundtur-testet** mot produksjon med nøyaktig den formen
`lagrePrissats` bruker — ikke bare skjemaet:

| Test | Resultat |
|---|---|
| Upsert med appens kolonnesett | 201, raden lagt inn |
| Samme upsert om igjen | 200, **samme `id`** — `onConflict` treffer, ingen duplikat |
| Antall rader etter to upserts | 1 |
| Negativ `timer_per_enhet` | 400, avvist av `prissatser_ikke_negative` |
| Delete, som «Tilbake til standard» | 204, tabellen tom igjen |

Testradene er slettet. `prissatser` står tom slik den skal før første bruk.

**Gjenstår fortsatt:** selve UI-et på `/innstillinger/priser` er ikke klikket
gjennom. Innlogging manglet i nettleserprofilen, og magic-link-flyten er ikke
noe som skal kjøres på brukerens vegne. Alt under UI-et — API-rutens
kolonnekontrakt, constrainten, upserten og slettingen — er verifisert.

**Lærdom, samme klasse som punkt 24:** RLS-hullet ga verken typefeil,
byggfeil eller kjøretidsfeil. Det ble funnet ved å sammenligne migrasjonen med
hva de andre tabellene faktisk gjør i basen. Migrasjoner bør leses mot
produksjonsskjemaet, ikke bare mot seg selv.

### 27. Bug-runde i prislaget — 2026-08-14

**Halvparten av en fiks fra punkt 24 var aldri fullført.** I `beregnLinje` står
de to satsene ved siden av hverandre. `timerPerEnhet` var vaktet mot NaN,
Infinity og negative verdier. `materialPerEnhet` var ikke vaktet i det hele
tatt.

| Inndata | Før | Nå |
|---|---|---|
| `materialPerEnhet: NaN` | `prisKr = NaN` | linja avvises |
| `materialPerEnhet: Infinity` | `prisKr = Infinity` | linja avvises |
| `materialPerEnhet: -5000` | `prisKr = -325 833` | linja avvises |
| `antall: Infinity` | `prisKr = Infinity`, `prisPerEnhet = NaN` | linja avvises |

**Den negative varianten var den farlige.** NaN og Infinity blir `null` i JSON,
så `verifiserPris` fanget dem ved lagring. En negativ materialsats gjør det
ikke: serveren regner ut nøyaktig det samme negative tallet som klienten
sendte, de matcher, og **tilbudet lagres**. Derfra kan det faktureres. Det er
det samme hullet punkt 24 lukket for prisen, latt stå åpent for satsen den
regnes av.

`antall: Infinity` slapp gjennom fordi vakten var `antall > 0`, som er sant for
Infinity. Krever nå et endelig tall.

**Én ugyldig linje forgiftet hele summen** — `beregnTilbud` la NaN til totalen i
stedet for å la linja falle ut. Nå faller den ut, og de øvrige linjene består.

**Seks nye tester i `scripts/pristest.ts`, 16 totalt.** Alle passerer, `tsc` er
rent. Den normale utregningen gir fortsatt 48 133 kr — samme tall som ble
verifisert tre ganger i produksjon i punkt 24.

**Sjekket og funnet rent i samme runde:** mva-modulen (`grunnlag + mva === total`
holder i begge grener, negativ og NaN-sats faller til 0), og betalingslaget —
alle tre veiene til Stripe bruker `fakturaBelop(...).total`, ingen bruker
`amount` direkte, og øre-konverteringen er identisk alle tre steder.

**Ikke fikset, verdt en avgjørelse:** en materialsats på f.eks. `1e21` er et
endelig, ikke-negativt tall og slipper fortsatt gjennom til en absurd pris.
Gjennom UI-et er den utilgjengelig — `/api/priser` klamper satsene til 500
timer og 1 000 000 kr per enhet — men tilbuds-API-et har ingen øvre grense.
Å sette en der er en forretningsbeslutning: hva er det største beløpet et
enkelttilbud skal kunne lyde på?

### 28. De offentlige token-rutene — 2026-08-14

`invoices.public_token` er en **uuid**-kolonne, men `hentFakturaByPublicToken`
sendte hva som helst rett videre til Postgres. Testet mot produksjon:

| Token | Før | Nå |
|---|---|---|
| Gyldig uuid, ukjent | 404 «Fant ikke faktura.» | uendret |
| `abc`, `1`, `not-a-token` | **500** | 404 «Fant ikke faktura.» |

På POST-rutene var svaret dessuten
`{"error":"Klarte ikke å hente faktura: invalid input syntax for type uuid: \"abc\""}`
— **rå databasefeil til en uautentisert kaller.** De innloggede rutene
returnerer generiske meldinger; de offentlige gjorde det ikke.

Vakten ligger i `hentFakturaByPublicToken`, altså det ene stedet alle tre
offentlige rutene går gjennom. De to POST-rutene logger nå detaljene og svarer
generisk utad.

**Presisering:** `/betal/[token]` fanger alle feil i én `catch` og viste
«Fant ikke fakturaen. Sjekk at du har hele lenken.» også før. **Kunden så aldri
500-en.** Det som faktisk var galt var statuskoden — 500 sier «serveren er
ødelagt» når ingenting er det, og støyer i overvåkingen — og informasjons-
lekkasjen mot den som kaller API-et direkte.

**Verifisert mot en kjørende dev-server, ikke bare resonnert:** alle fire
feilformede token gir 404 på alle tre rutene, et ekte token gir fortsatt 200
med whitelistet DTO (ingen `user_id`, `customer_id` eller Stripe-id-er), og
`/betal/[token]` viser samme melding som før.

**Sjekket og funnet rent:** beløpet slås opp server-side i begge de offentlige
betalingsrutene, status vaktes med `ikkeBetalbarGrunn`, og
`tilOffentligFaktura` er en ekte whitelist.

### 29. Tredje bug-runde — webhook og «Mine satser» — 2026-08-14

**Den viktigste: å tømme et felt i «Mine satser» satte satsen til 0.**
Feltene er `type="number"`, og lagre-knappen sendte `Number(timer)`. Tømmer du
feltet blir `e.target.value` en tom streng, og **`Number('') === 0`**. Brukeren
som tømte «Timer per enhet» for å nullstille, fikk i stedet satsen 0 lagret —
altså **null arbeid i alle framtidige tilbud på den operasjonen**, uten at noe
så galt ut.

Det er retningen punkt 25 sier hele produktet finnes for å forhindre:
håndverkeren underpriser. Her ville appen gjort det for ham.

Tomt felt betyr nå «bruk standarden» (`null`), som er kontrakten
`lagrePrissats` allerede hadde: begge null sletter raden og faller tilbake på
`lib/priser.ts`. Forhåndsvisningen bruker samme tolkning, så den viser det som
faktisk blir lagret. `lesTall` server-side trimmer nå også blanke strenger, og
avviser typer som ikke er tall eller tallstreng (`Number([])` er 0,
`Number(true)` er 1).

**Webhooken markerte betalt uten å sjekke `payment_status`.**
`checkout.session.completed` betyr at kunden fullførte sesjonen, ikke at
pengene er kommet. For metoder med forsinket oppgjør leverer Stripe eventet med
`payment_status: 'unpaid'` og sender `checkout.session.async_payment_succeeded`
når oppgjøret er i havn. Begge Checkout-rutene er kort-bare i dag, så i praksis
er status alltid `paid` — men dagen noen slår på Vipps eller bankdebet ville
fakturaen blitt markert betalt og kunden fått kvittering før pengene fantes.

Vakten er lagt inn, og `async_payment_succeeded` håndteres nå av samme gren —
uten det ville vakten innført en ny bug: en forsinket betaling som aldri ble
registrert. **Merk:** Stripe-endepunktet i dashboardet lytter på tre eventer
(se punkt 22). Skal en forsinket betalingsmetode tas i bruk, må
`checkout.session.async_payment_succeeded` legges til der — koden er klar, men
abonnementet mangler.

**Verifisert:** `tsc` rent, 16/16 tester, og alle endrede ruter kjørt mot en
dev-server uten serverfeil — `/innstillinger/priser` gir 307, `/api/priser`
gir 401, `/betal/abc` gir 200 med vennlig melding, `/api/public/invoices/abc`
gir 404.

**Ikke verifisert:** selve klikket i «Mine satser» — tøm felt, lagre, se at
satsen faller tilbake på standarden. Krever innlogging. Endringen er lest og
kompilerer, men flyten er ikke kjørt.

**Sjekket og funnet rent i webhooken:** idempotency via `stripe_event_id`,
betaling registreres før statusendring (revisjonsspor), dobbeltbetaling
varsles, en allerede betalt faktura degraderes ikke av et sent feilet forsøk,
og PDF/e-post-feil reverserer ikke en reell betaling. Den kjente svakheten står
igjen og er dokumentert i koden: ryker `maxDuration` under PDF/e-post, stopper
idempotency-sjekken Stripes nye forsøk, og fakturaen blir stående betalt uten
PDF. Manuell utvei finnes: `/api/invoices/[id]/resend`.

### 30. Fjerde bug-runde — den manuelle utveien feilet stille — 2026-08-14

**Autorisasjonsrevisjon først, ingen funn.** Alle `[id]`-ruter — kunder,
fakturaer, tilbud, resend — og begge de innloggede betalingsrutene henter
scopet på `session.user.id`, og alle ti lib-funksjonene bak dem har
`eq('user_id', ...)` i spørringen. Ingen IDOR. De to rutene uten
sesjonssjekk er NextAuth selv og den token-autentiserte offentlige ruten,
begge som tiltenkt.

**Funnet: «Send på nytt» meldte suksess selv når e-posten aldri gikk.**

`sendFakturaEpost` svelger alle feil med vilje, og det er riktig i webhooken:
betalingen har allerede skjedd, og kaster den videre svarer webhooken 500,
Stripe prøver igjen, og idempotency-sjekken stopper forsøk to. Men **samme
funksjon brukes av `/api/invoices/[id]/resend`** — som er nettopp den utveien
punkt 29 peker på når webhooken ikke fikk sendt fakturaen.

Kjeden var: kunden sier «jeg fikk aldri fakturaen» → håndverkeren trykker
«Send på nytt» → SMTP feiler, eller kunden mangler e-postadresse → funksjonen
logger og returnerer `void` → ruten svarer `{ ok: true }` → UI-et viser
**«Sendt på nytt»**. Kunden får fortsatt ingenting, og håndverkeren tror
saken er ordnet. Sikkerhetsnettet hadde hull.

`sendFakturaEpost` returnerer nå et `EpostResultat`. Webhooken oppfører seg
nøyaktig som før (svelger, logger), mens resend-ruten svarer 502 ved
sendefeil og 400 når kunden mangler e-postadresse. Skillet er `kanProeveIgjen`:
SMTP-trøbbel går som regel over, en manglende e-postadresse gjør ikke det — der
må kundekortet fikses, og «prøv igjen» er feil råd.

**PDF-en lages og lagres uansett**, så `pdfUrl` følger med i begge svarene, og
UI-et oppdaterer nedlastingslenken også når e-posten feilet — da kan
håndverkeren laste ned og sende manuelt. Feilteksten vises nå i grensesnittet;
før sto det bare «Feilet — prøv igjen», som er direkte feil råd i det ene av
de to tilfellene.

**Verifisert:** `tsc` rent, 16/16 tester, alle berørte ruter kjørt mot
dev-server uten serverfeil i loggen — resend gir 401 uten sesjon, webhooken
400 uten signatur, `/betal/abc` 200, `/historikk/invoices` 307.

**Ikke verifisert:** selve feilstien med en ekte SMTP-feil. Krever innlogging
og en faktura, og at e-postutsending faktisk feiler.

**Sjekket og funnet rent i samme runde:** `lib/fakturaStatus.ts` (én
definisjon av «kan betales» delt av UI og alle fire betalingsrutene), og
`lastOppFakturaPdf` som bruker riktig supabase-js v2-form
(`data.publicUrl`) — i motsetning til patch-versjonen omtalt i punkt 3.
**`lib/format.ts` ble erklært ren her. Det var feil — se punkt 31.**

### 31. Femte bug-runde — begge funnet ved å LESE fakturaen — 2026-08-14

Begge bugene i denne runden satt i den ferdige PDF-en kunden mottar. Ingen av
dem ga typefeil, byggfeil eller kjøretidsfeil. Samme lærdom som punkt 24: den
eneste måten å finne dem på var å generere filen og lese hver linje.

**1. `kr 12 033,25,-` — misdannet beløp på kundefakturaen.**
`,-` er norsk kortform for «og null øre». Da ørevisningen ble innført (så
PDF-en skulle stemme med det Stripe faktisk trekker) ble suffikset stående på
**begge** grener. Resultatet: mva-linjen på fakturaen sto som
«kr 12 033,25,-».

Det traff **de fleste mva-fakturaer** — 25 % av en ujevn sum gir nesten alltid
øre — i PDF, e-post og UI samtidig, siden alle tre går gjennom `formatKr`.
Jeg erklærte denne fila ren i forrige runde ved å lese koden. Den ble avslørt
først da jeg dumpet tekstlinjene fra en generert PDF.

**2. Betalingslenken rant ut av margen.** Målt: 530 pt mot 483 pt tilgjengelig.
Den lå 47 pt inne i høyremargen og **9 pt fra å bli kuttet av arkkanten**. Et
lengre domene, og lenken ville blitt avkortet — og en avkortet betalingslenke
er ubrukelig. jsPDF bryter ikke tekst selv; den tegner videre og sier ikke fra.

Ny `skrivBrutt()` bryter mot tilgjengelig bredde. Brukt på betalingslenken og
på de frie tekstfeltene (firmaadresse, kundenavn, kundeadresse), som har samme
svakhet — korte i dagens data, men ingenting hindrer en lang verdi.

**Verifisert ved å generere en ekte faktura-PDF og måle hver linje:** 24 av 24
innenfor margen, lenken hel og ubrutt på egen linje (487 pt), `kr 12 033,25`
uten suffiks og `kr 48 133,-` med.

**En feil jeg gjorde underveis, verdt å notere:** første måling brukte
`localhost:3000`, fordi `.env.local` ikke har `APP_URL`. Den korte lenken ville
aldri rent ut, så «ingen linje utenfor margen» beviste ingenting. Målte om med
produksjonsdomenet. **Verifisering som ikke reproduserer produksjonsdata er
ikke verifisering.**

**Fem nye tester, 21 totalt.** De sjekker oppførsel, ikke eksakte strenger:
nb-NO bruker hardt mellomrom (U+00A0) som tusenskille, og min første versjon
feilet på riktig kode fordi den hardkodet vanlig mellomrom.

**Sjekket og funnet rent:** `lib/env.ts`, `lib/pdftekst.ts`, og
miljøvariablene i Vercel — `APP_URL` **er** satt (ellers ville hver
betalingslenke pekt til localhost), og alle fem `EMAIL_*` finnes. To av dem så
først ut til å mangle; det var lazy-rendering i Vercels liste, ikke fravær.

### 32. Sjette runde — før testdagen på tvers av fag — 2026-08-15

Alt tidligere arbeid har brukt **Maler**. Denne runden gikk gjennom alle sju
fagene, siden testdagen skal dekke dem alle.

**Prisdataene er rene.** Alle 17 operasjoner i alle sju fag ble regnet ut og
holdt mot sitt eget markedsbånd: **null feil, og hver eneste operasjon med
markedsdata lander inne i båndet.** De åtte med advarsel er de sju kjente
anslagene pluss `annet_timer`, som er en ren timesats uten marked.

**Bug 1 — AI-teksten ble alltid forkastet.** Vakten som sjekker at
AI-teksten gjengir prisen sammenlignet mot `toLocaleString('nb-NO')`, som
skiller tusener med **hardt mellomrom (U+00A0)**. En AI skriver vanlig
mellomrom, punktum eller ingenting. Alle fire realistiske skrivemåter feilet.

Vakten var altså usann for enhver pris over 1000 — nesten alle tilbud. Appen
falt alltid tilbake på malen, og loggen sa «AI-teksten gjengir ikke prisen»,
som peker mistanken mot modellen i stedet for mot sammenligningen.

Latent i dag siden `OPENAI_API_KEY` er fjernet fra Vercel (punkt 23), men den
ville slått til i det noen skrur AI-teksten på igjen — og de ville betalt for
et kall som aldri ble brukt. Sammenligningen går nå på sifre.

**Bug 2 — fagbytte slettet jobben uten varsel.** Operasjonene tilhører hvert
sitt fag, så linjene må nullstilles ved bytte. Men et feilklikk i
nedtrekkslista slettet en ferdig utfylt jobb uten et ord. Nå spørres det —
men **bare** når det faktisk står arbeid der, så tomme skjemaer ikke maser.
Dette treffer testdagen direkte, der dere med vilje hopper mellom fag.

**Opprydding:** `lib/ai.ts` hadde en privat `formatKr` som formaterer tallet,
ikke beløpet — samme navn som pengeformatereren i `lib/format.ts`, men en helt
annen funksjon. Jeg trodde først dette var en dobbel-prefiks-bug og verifiserte
før jeg meldte fra; teksten var riktig. Den heter nå `formatTall`, slik at
ingen «rydder opp» ved å bytte inn feil av dem og gir kunden «kr kr 10 167,-,-».

Prisvakten er trukket ut som `tekstNevnerPrisen()` — den lå begravd i en
try-blokk som bare nås med API-nøkkel, og var dermed umulig å teste.

**Seks nye tester, 27 totalt.** `tsc` rent. Alle ruter kjørt mot dev-server med
tom feillogg.

**Ikke verifisert:** selve bekreftelsesdialogen ved fagbytte. `/calc` krever
innlogging, som ikke finnes i nettleserprofilen. Koden er lest og kompilerer.

### 33. Tilgangsliste — hvem som får lage konto — 2026-08-17

Veikartets punkt 2, og den siste av de tre tingene på blokkerlista som var ren
kode. Til nå kunne **hvem som helst som kjente adressen** be om en magic link,
få konto, og sende fakturaer fra `noreply@tilbudsmaskinen.no` — vårt verifiserte
domene, vårt navn på avsenderen. Adressen er offentlig og skal deles med
kollegaer, så det var ikke en teoretisk åpning.

**`ALLOWED_EMAILS`** er nå porten. Kommaseparert; en oppføring som starter med
`@` slipper inn et helt domene:

```
ALLOWED_EMAILS=deg@firma.no, maler@annetfirma.no, @tilbudsmaskinen.no
```

Sjekken ligger i `lib/tilgang.ts` og treffer to steder:
- `signIn`-callbacken i `lib/auth.ts`. next-auth kaller den **både** når lenken
  bes om og når den klikkes, så én sjekk dekker hele løpet — den avviste får
  verken e-post eller sesjon.
- `authorized` i `middleware.ts`. Uten den ville en som fjernes fra lista
  beholdt tilgangen til token-et gikk ut av seg selv — **30 dager**.

**Den viktigste avgjørelsen: hva skjer ved skrivefeil.** Er variabelen tom,
står appen åpen som før (ellers ville et deploy uten variabelen låst ute eieren
selv). Men står det noe i den som ikke gir én eneste gyldig oppføring —
`ALLOWED_EMAILS=firma.no`, uten krøllalfa — så **stenger** appen for alle og
logger hvorfor. Tom liste betyr «ikke konfigurert», og uten dette skillet ville
en typo i hele variabelen åpnet døra på vidt gap, helt stille.

**«Prøv igjen» var feil svar** til den som ikke står på lista — den kan prøve så
mye den vil. `/logg-inn` skiller nå mellom tre ting: ikke invitert, utløpt lenke,
og ekte sendefeil. Samtidig fikk `pages.error` en verdi: en avvist eller utløpt
magic link havnet før på next-auths egen `/api/auth/error` — ustylt, engelsk,
uten vei tilbake — og kommer nå til vårt eget skjema med meldingen på norsk.

**Verifisert mot dev-server, ikke bare lest:**

| Test | Resultat |
|---|---|
| Adresse utenfor lista ber om lenke | `AccessDenied`, ingen e-post sendt |
| `angriper@ikke-tilbudsmaskinen.no` mot regelen `@tilbudsmaskinen.no` | avvist — domenet må matche helt |
| Adresse på lista, og `Kollega@Tilbudsmaskinen.NO` via domeneregel | slipper gjennom porten |
| Gyldig sesjonstoken for adresse **utenfor** lista mot `/calc` | 307 ut til `/logg-inn` |
| Samme token for adresse **på** lista | 200 |

De to som slapp gjennom ble testet med SMTP pekt mot en død port, så ingen
e-post gikk ut — serverloggen viser nøyaktig to `ECONNREFUSED`, og ingenting
annet. `.env.local` ble tatt kopi av og lagt tilbake bit for bit etterpå
(samme md5).

**Ni nye tester, 36 totalt.** `tsc` rent, `next build` grønt (middleware
kompilerer for edge, `/logg-inn` er fortsatt statisk).

⚠️ **Koden alene stenger ingenting.** `ALLOWED_EMAILS` må settes i Vercel og
appen deployes på nytt — Vercel plukker ikke opp nye env-verdier i en kjørende
deploy. Skjer ikke det, står døra like åpen som før.

**API-laget — funnet og tettet i samme runde.** Middleware-matcheren dekker
`/calc`, `/historikk`, `/innstillinger` og `/kunder`, men ikke `/api`. De 13
API-rutene vokter i stedet på `session.user.id`. En som ble fjernet fra lista
var derfor stengt ute av sidene, men kunne fortsatt kalt `/api/invoices` direkte
med cookien sin — og sendt fakturaer fra avsenderdomenet — i inntil 30 dager, til
token-et gikk ut av seg selv. Altså nøyaktig det lista finnes for å hindre.

Tettet ett sted: `session`-callbacken i `lib/auth.ts` slutter å sette
`session.user.id` når adressen ikke lenger har tilgang. Alle 13 rutene arver
sjekken uten at én eneste av dem er rørt. Skal alle logges ut samtidig uansett
årsak, er `NEXTAUTH_SECRET` fortsatt bryteren.

**Kjørt og bekreftet 2026-08-17.** Egen dev-server på port 3001 med
`ALLOWED_EMAILS=tillatt@lov.no` og egen build-katalog, slik at hverken `.env.local`
eller serveren på 3000 ble rørt. Sesjons-token minte med `encode()` fra
`next-auth/jwt` og sendt som cookie:

| Adresse i token | `/api/invoices` | `/calc` |
|---|---|---|
| `tillatt@lov.no` | **200** `[]` | **200** |
| `  TILLATT@LOV.NO  ` (store bokstaver og mellomrom) | **200** | — |
| `avvist@fremmed.no` | **401** | **307** |
| `x@lov.no` (samme domene, ikke på lista) | **401** | **307** |
| `tillatt@lov.no.no` (nesten-treff) | **401** | — |
| ingen cookie | 401 | 307 |

Avvisningen skjer før databasen: 401-ene kom på 5–40 ms, mens den tillatte gikk
hele veien inn i `hentFakturaer`. Første forsøk ga 500 fordi test-brukerens id
ikke var en UUID — en feil i testen, ikke i appen, men den bekreftet i seg selv
at den tillatte adressen kom forbi vakten og inn i handleren.

### 34. Etterkalkyle — prisboka som lærer — 2026-08-17

Veikartets punkt 1, og det eneste i appen som ikke finnes hos de billige
konkurrentene. Til nå var **alt** i prismodellen anslag: markedstallene i
`lib/priser.ts`, og brukerens egne satser i `prissatser`. Ingenting visste hva
jobben faktisk tok. En håndverker kunne ligge 30 % feil på hver eneste jobb i
et år uten at noe fanget det opp.

**Løkka som nå er lukket:** jobb ferdig → før timene → avviket vises →
etter tre jobber foreslår «Dine satser» en ny `timerPerEnhet` → ett klikk
skriver den til prisboka hans.

**Det som ble bygget:**
- `migrations/20260817_etterkalkyle.sql` — tabellen `etterkalkyler`, én rad per
  jobb, med samme RLS- og sluttkontroll-mønster som de øvrige migrasjonene.
- `lib/etterkalkyle.ts` — all regning, uten database og uten React, slik at
  server, skjema og tester bruker nøyaktig samme tall.
- `lib/etterkalkyleLager.ts` + `/api/etterkalkyle` — lagring, med eierskapssjekk.
- `/historikk/etterkalkyle/[tilbudId]` — skjemaet. Viser avviket mens du skriver.
- `/historikk` — avviksmerke rett i lista («20 t brukt · +33 % mot estimat»).
- `/innstillinger/priser` — forslaget, med hvor mange jobber det bygger på.

**Tre avgjørelser som er verdt å kjenne til:**

1. **Timene fordeles i forhold til estimatet.** En jobb på «45 m² vegg + 12 m²
   tak» som tok 14 timer sier ikke hvilken av de to som tok den ekstra tida. Vi
   antar at bommen er like stor på begge. Det er en antakelse, ikke en måling —
   derfor teller appen hvor mange av jobbene bak et forslag som hadde **bare én**
   operasjon, og viser det. En jobb med én operasjon er et rent signal, en med
   fire er et rykte.
2. **Terskler før noe foreslås:** minst tre jobber, og minst 10 % avvik. Et
   forslag som viser seg å være støy én gang, blir ignorert for alltid.
3. **Linjene lagres som øyeblikksbilde** med registreringen. Uten det ville en
   senere redigering av tilbudet (45 m² blir til 60) stille endret grunnlaget
   for et forslag som allerede er gitt, og satsen drevet i en retning ingen ba om.

Estimatoren er `sum(timer) / sum(antall)`, ikke snittet av jobbenes satser — det
vekter etter størrelse, så en jobb på 200 m² sier mer om produktiviteten enn en
på 5 m². Det er testet.

**Verifisert mot dev-server:** alle tre rutene svarer 401 uten sesjon; ugyldig
tilbud-id gir 400 og ikke en Postgres-feil; timer som mangler, er tomme eller
negative gir 400; en `tilbudId` som ikke tilhører deg gir 404 **før** noe
skrives — den sjekken er ikke bare tilgangskontroll, for upserten treffer på
`tilbud_id` alene og kunne ellers flyttet en annens rad over på deg. Siden er
bak innlogging (307 til `/logg-inn`). `tsc` rent, `next build` grønt.

**Fjorten nye tester, 50 totalt.**

✅ **Migrasjonen er kjørt — 2026-08-20.** Kjørt i Supabase SQL Editor mot
prosjektet `zculzyarnamvrmmhibhn` (det `SUPABASE_URL` faktisk peker på — org-en
har to prosjekter, så ref-en ble slått opp først). Svaret var «Success. No rows
returned». Det ER verifiseringen: sluttkontrollen i skriptet kaster exception
hvis tabellen, kolonnene, unik-constrainten på `tilbud_id` eller RLS mangler.

Bekreftet fra app-siden etterpå: `GET /api/etterkalkyle` gir 200 med tom liste
og **ingen feillinje i loggen**. Samme kall loggførte «Could not find the table
public.etterkalkyler» før migrasjonen, så forskjellen er selve beviset.

**To ting gikk galt underveis og er verdt å huske til neste migrasjon:**
1. Utklippstavla inneholdt **mva-migrasjonen**, ikke etterkalkylen — noe hadde
   overskrevet den mellom kopiering og liming. Oppdaget fordi innholdet ble lest
   i editoren før Run. Å kjøre den ville vært ufarlig (idempotent), men det var
   ikke det som var bedt om.
2. `Get-Content -Raw` i Windows PowerShell leser UTF-8-filer som ANSI. Første
   liming ga `pÅ¥` i stedet for `på` inne i `raise exception`-tekstene og i
   `comment on table`. Rettet med `-Encoding UTF8` og verifisert i editoren før
   Run. **Bruk alltid `-Encoding UTF8` på disse filene.**

**Grensesnittet er sett med data i.** Siden migrasjonen ikke er kjørt, ble det
gjort ved å legge midlertidige fixtures i GET-rutene lokalt, se på hver skjerm,
og deretter reversere dem (`git checkout` — arbeidstreet er rent, ingenting av
det er committet). Det som faktisk ble observert:

| Skjerm | Sett |
|---|---|
| Historikk | «20 t brukt · +33 % mot estimat» på jobben med timer ført, «Før timer» på den uten |
| Etterkalkyle, én operasjon | forhåndsutfylt, knappen sier «Oppdater», «Slett registreringen» dukker opp, ingen fordelingsboks |
| Etterkalkyle, to operasjoner | avviket oppdateres mens du skriver, og 14 timer fordeles til 9,7 t vegg + 4,3 t tak — summerer til 14 |
| Dine satser | «Timene dine sier 0,202 t per enhet — +35 % mot satsen din på 0,15», «3 jobber · alle med bare denne operasjonen · 250 enheter» |
| «Bruk 0,202» | fyller feltet og sender lagringen |

Regnestykkene stemmer med testene: 50,5 timer på 250 m² = 0,202, og
6,75/9,75 × 14 = 9,7.

Lagringen fra «Bruk 0,202» ble avvist av databasen med brudd på fremmednøkkelen
— testbrukeren finnes ikke i `users` — så ingenting ble skrevet til basen.
Klikk-kjeden er dermed bevist helt fram til skrivingen, og produksjonsdataene
er urørt.

**Det som gjenstår å se:** selve lagringen av en registrering mot en ekte rad.
Det krever migrasjonen.

**Gjennomgang av egen kode etterpå — to funn, begge rettet:**

1. **Nevneren i fordelingen** ble regnet av alle linjene, mens bare linjene med
   `antall > 0` fikk timer tildelt. En linje uten antall ville dermed tatt med
   seg sin andel av nevneren, og de timene ville forsvunnet. Konsekvensen er
   ikke en synlig feil, men et satsforslag som er for **lavt** — appen ville
   foreslått at jobben går raskere enn den gjør, og håndverkeren ville priset
   seg ned på sin egen erfaring. Test lagt til.
2. **Avviksmerket i historikken** målte mot tilbudet slik det ser ut **i dag**,
   mens satsforslaget bygger på øyeblikksbildet fra da timene ble ført.
   Redigeres tilbudet etterpå, viste de to ulike tall om samme jobb. Merket
   måler nå mot øyeblikksbildet, med estimatet som fallback for gamle tilbud
   uten linjer.

### 35. Materialavviket — den andre halvparten av kostnaden — 2026-08-18

Etterkalkylen lærte bare av tida. Materialfeltet i skjemaet ble lagret og aldri
brukt til noe — håndverkeren skrev inn et tall som forsvant. Materialer er
typisk en tredel til halvparten av kostnaden i et tilbud, så prisboka lærte av
halve virkeligheten.

**Nå fordeles materialene også**, og de fordeles etter **estimert materialkost**
— ikke etter timer. Maling og parkett koster ikke i forhold til hvor lenge man
holder på med dem: fordeles kronene etter tid, får en arbeidsintensiv og
materialfattig operasjon skylda for materialer den aldri brukte. Fordelingen er
trukket ut i én felles `fordelEtterVekt`, slik at tid og kroner ikke kan drifte
fra hverandre i hver sin kopi.

**Timer og materialer telles hver for seg.** Materialfeltet er valgfritt, så en
operasjon kan ha fem jobber med timer og to med kostnad. Slås de sammen, deles
kronene på kvadratmeter ingen har ført kostnad for — og materialsatsen blir for
lav. Terskelen på tre jobber gjelder derfor hver side for seg.

`estimertMaterialKr` er lagt til i øyeblikksbildet. Kolonnen er `jsonb`, så det
krever ingen ny migrasjon, og det er gjort **før** det finnes en eneste rad i
produksjon — feltet er valgfritt i typen, så en gammel registrering uten det
teller fortsatt på timesiden.

**Verifisert i nettleseren** med samme fixture-metode som punkt 34 (reversert
etterpå, arbeidstreet er rent):

| Sett | |
|---|---|
| Dine satser, 3 tidsjobber + 2 materialjobber | «Materialene kostet 61 kr per enhet — +53 % mot 40 · 2 jobber», **uten** knapp |
| Samme, med en tredje materialjobb | «60 kr per enhet — +50 % · 3 jobber · kr 18 000,- til sammen» og knappen «Bruk 60 kr» |
| Skjemaet | «Materialene ble 50 % dyrere enn estimert» under materialfeltet |

Tallene stemmer med testene: 18 000 kr på 300 m² = 60 kr, mot standarden 40.

**Åtte nye tester, 61 totalt.** `tsc` rent, `next build` grønt.

**Kollisjon underveis, verdt å merke seg:** `lib/etterkalkyle.ts` ble endret av
en parallell økt mens jeg jobbet i den. Den endringen fant en ekte feil i min
`samleErfaring`: linjer med samme operasjon ble talt som hver sin jobb, så én
jobb med tre veggmaling-linjer passerte terskelen på tre jobber alene. Jeg
beholdt den rettelsen og bygget materialdelen oppå den — med samme sammenslåing
per operasjon, av nøyaktig samme grunn.

## Status før lansering — 2026-08-20

Verifisert denne økten, ikke antatt:

| | Status | Grunnlag |
|---|---|---|
| Koden i produksjon | ✅ ute | `/historikk/etterkalkyle/<id>` gir 307 til innlogging på `tilbudsmodulen-ev335s-projects.vercel.app`, `/api/etterkalkyle` gir 401, en ukjent rute gir 404 |
| Etterkalkyle-tabellen | ✅ finnes | migrasjonen kjørt, og appen leser fra den uten feillinje |
| Tilgangslista i kode | ✅ merget | punkt 33 |
| `ALLOWED_EMAILS` i Vercel | ❓ **ikke bekreftet** | Vercel krevde 2FA-oppsett før innstillingene kunne leses. Den avgjørelsen er eierens, så sjekken ble ikke fullført |
| Timer ført på en ekte jobb | ❌ ikke gjort | krever innlogget bruker med et lagret tilbud |
| Materialavvik | ✅ i kode | punkt 35, sett med fixtures |

**Rekkefølgen som gjenstår:** bekreft `ALLOWED_EMAILS` (og deploy på nytt hvis
den legges inn nå), før timer på én ekte jobb, og se at avviksmerket dukker opp
i historikken. Da er hele løkka kjørt på ekte data for første gang.

### 36. Tilgangslista er aktiv i produksjon — og domenet er ikke koblet — 2026-08-20

`ALLOWED_EMAILS` er satt i Vercel og appen deployet på nytt. Fra punkt 33 var
dette det som gjensto: koden alene stengte ingenting.

**Verifisert utenfra, mot den kjørende appen:**

| Test | Resultat |
|---|---|
| Appen svarer | 200 |
| `/calc` uten innlogging | 307 → `/logg-inn` |
| `ikke-invitert@example.com` ber om innloggingslenke | **`AccessDenied`** |
| Gikk det ut e-post til den avviste? | **Nei** |
| Hvor den avviste havner | `/logg-inn?error=AccessDenied` — appens eget norske skjema |

Avvisningstesten brukte `@example.com` med vilje: domenet er IANA-reservert og
har ingen MX, så selv om lista hadde vært feil satt, kunne ingen e-post nådd en
ekte innboks. Kjeden `/api/auth/error` → 302 → `/logg-inn` ble fulgt hele veien,
så `pages.error` fra punkt 33 virker også i produksjon.

**Dermed er blokker 2 på modenhetslista borte.** Hvem som helst kan ikke lenger
lage konto og fakturere fra det verifiserte avsenderdomenet.

## ⚠️ Funn: `tilbudsmaskinen.no` står fortsatt parkert

Oppdaget mens jeg lette etter riktig adresse å teste mot. Domenet er **ikke
koblet til Vercel**:

- DNS peker på `185.134.245.113` — Vercels IP er `76.76.21.21`
- HTTPS på 443: connection refused, både med og uten `www`
- HTTP på 80 svarer med nginx og siden «tilbudsmaskinen.no is parked»

Appen lever kun på `tilbudsmodulen-ev335s-projects.vercel.app`.

**Hvorfor det er alvorlig:** betalingslenkene i faktura-PDF og faktura-e-post
bygges av `appUrl()` fra `APP_URL`. Peker den på `https://tilbudsmaskinen.no`,
får hver eneste kunde en lenke som ikke svarer — og **ingenting feiler synlig
noe sted**. Det er nøyaktig fellen `.env.local.example` advarer mot, bare med et
parkert domene i stedet for `localhost:3000`.

E-postutsending er ikke rammet: `noreply@tilbudsmaskinen.no` hviler på MX/TXT
hos registraren, uavhengig av A-pekeren.

To veier ut — koble domenet i Vercel → Domains og legge om A-pekeren hos
registraren, eller sette `APP_URL` til vercel.app-adressen inntil videre. Det
siste tar to minutter og gjør lenkene levende med én gang.

Migrasjonen `20260817_etterkalkyle.sql` var allerede kjørt samme dag, så
etterkalkylen er aktiv i produksjon. Jeg bekreftet den ikke utenfra —
`/api/etterkalkyle` krever innlogging, og å minte en produksjonssesjon gikk
lenger enn det var bedt om.


### 37. `APP_URL` satt, og betalingslenkene er levende — 2026-08-20

Punkt 36 fant at `tilbudsmaskinen.no` står parkert. Det åpne spørsmålet var om
`APP_URL` pekte dit — for da ville hver kunde fått en død betalingslenke i
faktura-PDF og e-post, uten at noe feilet synlig noe sted.

Spørsmålet lot seg ikke besvare: variabelen er merket **Sensitive** i Vercel,
og da er verdien skrivebeskyttet. Verken jeg eller du kan lese hva den står til,
bare overskrive den. Den ble lagt inn 12. august, samme dag som første deploy,
mens domenet var under oppsett — som passer med at den pekte på det parkerte
domenet, men det er en slutning, ikke et bevis.

**Satt til vercel.app-adressen** og appen redeployet. Redigeringsskjemaet i
Vercel hang på «Loading…» og lagret ikke — bekreftet ved at `updatedAt` fortsatt
var identisk med `createdAt` — så endringen ble gjort gjennom Vercels eget API
som innlogget bruker. Deretter Redeploy av samme commit (`9902727`), som er det
som får nye env-verdier inn i en kjørende deploy.

**Verifisert etter redeployen:** forsiden 200, `/api/etterkalkyle` 401,
`/kunder` 307, ukjent fakturatoken 404, og tilgangslista svarer fortsatt
`AccessDenied` for en adresse utenfor lista. Ingenting brakk.

**Lærdom for neste gang:** ikke merk `APP_URL` som Sensitive. Den er en offentlig
URL som står i hver eneste kunde-e-post, ikke en hemmelighet, og Sensitive gjør
den umulig å ettergå. Det samme gjelder `ALLOWED_EMAILS` — du vil kunne lese hvem
som står på lista uten å måtte gjette.

**Ikke verifisert:** en ekte betalingslenke ende-til-ende. Det krever en faktura
med token, altså innlogging i produksjon.

### 38. Bug-runde i etterkalkylen — fem funn — 2026-08-21

Systematisk gjennomgang av etterkalkylen, som var det eneste i appen som aldri
hadde vært gjennom en. Migrasjonen og API-rutene holdt: RLS på uten
anon-policyer, idempotent, sluttkontroll som feiler høyt, og en eierskapssjekk
i `POST` som forklarer hvorfor den ikke bare er tilgangskontroll. Feilene lå i
regnestykket og i grensesnittet.

**1. Material uten timer forsvant helt.** `samleErfaring` bygde oversikten av
timefordelingen alene, så en operasjon der brukeren tar betalt for material men
ikke timer ble samlet opp i materialsamlingen og aldri lest. I testtilfellet sto
den for 5000 av 5200 kr estimert material og 17 308 kr faktisk — og viste
ingenting. Dette var andre halvdel av bugen fra punkt 35: linja overlevde inn i
øyeblikksbildet, men kom ikke gjennom oversikten. Bygges nå på unionen av timer
og material.

**2. Feil ble svelget som tomt resultat.** `hentEtterkalkyler` fanget alle feil
og returnerte tom liste, selv om kommentaren bare lovet det for manglende
tabell. En forbigående databasefeil så dermed nøyaktig ut som «ingen jobber
registrert ennå», og satsforslagene forsvant uten et ord. Bare `42P01` svelges
nå — samme mønster som fila allerede brukte i sine to andre funksjoner.

**3. Håndkopi som hadde drevet.** Siden hadde sin egen kopi av
`linjerFraResultat` som fortsatt kastet linjer uten timer, mens serveren nå
beholder dem. Kommentaren lovet at det var samme funksjon. Flyttet til
`lib/etterkalkyle.ts` — ren regning uten database — så siden bruker originalen,
og filteret kan endelig testes. Det var utestbart nettopp fordi det lå i
DB-modulen.

**4 og 5 — mine egne følgefeil.** Fiks 1 gjorde en tilstand nåbar som UI-et
aldri hadde møtt. For en operasjon uten timer sto det bokstavelig «Timene dine
sier 0 t per enhet — 0 % mot satsen din på 0,15» og «0 jobber · alle med bare
denne operasjonen». Alt usant. Og bunnhintet voktet på timesiden alene, så en
operasjon med fem førte materialjobber og lite avvik fikk beskjeden «Ingen
justering foreslås før 3 jobber er ført» — jobbene fantes, det var avviket som
var lite.

Commits `df04fc5` og `6fcdf00`.

### 39. «7,5» var ikke et tall i et norsk grensesnitt — 2026-08-21

Alle elleve tallfelt i appen brukte `type="number"`. Da er det **nettleserens**
språkinnstilling, ikke appens, som avgjør om komma er et gyldig desimalskille.
Med engelskspråklig nettleser tømmer nettleseren feltverdien i det brukeren
skriver komma: han ser `7,5` stå i feltet, mens React har fått tom streng og
lagre-knappen er deaktivert uten et ord om hvorfor.

Dette er samme familie som bug 1 i punkt 32, men motsatt vei — der gjaldt det
hardt mellomrom ut av appen, her komma inn i den.

Felt og tolker hører sammen, så de ligger nå ett sted hver:
- `components/ui/TallInput.tsx` — `type="text"` med `inputMode="decimal"`, som
  gir talltastatur på mobil. Det eneste som går tapt er piltastene, som ingen av
  disse feltene har bruk for. Typen forbyr `min`/`max`/`step`, slik at ingen tror
  nettleseren validerer lenger.
- `lib/tall.ts` — `tilTall()` tar komma og punktum, mellomrom som tusenskille
  (også det harde fra `toLocaleString`, så et tall kopiert ut av appen kan limes
  rett inn igjen), og avviser tvetydige tall som `1,234,5` i stedet for å gjette.

De to API-rutene hadde hver sin kopi av `lesTall`. Begge bruker nå den delte,
som også tåler komma — klienten sender videre det brukeren skrev.

**To ting migreringen avdekket.** Betalingsfristen brukte `Number(x) || 14`, der
0 ble til 14 fordi 0 er falsy; grensen `min="1"` lå i HTML-en og falt bort med
`type="number"`, så den står nå i koden. Og etterkalkylen sendte rå tekst til
serveren og voktet lagre-knappen på om feltet hadde tegn i seg — den sender nå
tolket tall, og knappen vokter på om tallet lar seg tolke.

**Verifisert i ekte nettleser**, innlogget mot dev-server med ekte tastetrykk:
feltene holder «812,50» og «45,5», forhåndsvisningen viser kr 9 825, og
`beregnTilbud` gir 9825 for de samme tallene. Kommaet tolkes som desimal, ikke
noe annet. Testserveren fikk sin egen `NEXTAUTH_SECRET`, så tokenet som ble
mintet er verdiløst andre steder.

**16 nye tester, 83 totalt.** Commit `b93a4b1`.

**Alle fire deployene fra 2026-08-21 er READY**, og produksjonen står på
`b93a4b1`. Verifisert utenfra: forsiden 200, `/calc` 307, API-ene 401, ukjent
fakturatoken 404, og tilgangslista svarer fortsatt `AccessDenied`.


### 40. Komma-rundturen, og en felle i sammenligningen — 2026-08-21

Oppfølging av punkt 39. Feltene tok imot «7,5», men femten steder satte tall
INN i dem med `String(7.5)` — så brukeren tastet komma, lagret, åpnet igjen og
så punktum. `tilFeltTekst()` er nå motstykket til `tilTall()`, og rundturen
tall → felt → tall er testet tapsfri.

Fella underveis er verdt å huske: «endret»-sammenligningen på Mine satser holdt
feltteksten mot `String(sats.timerPerEnhet)`. Hadde bare visningen byttet
format, ville siden trodd at hvert felt var endret hele tiden. Derfor ble alle
femten stedene lest før ett ble endret.

Samtidig: fakturabeløpet mistet HTML-valideringen `min="1"` da feltet gikk fra
`type="number"`. Vakten ligger nå klientsiden, i samme mønster som kundevalget
rett over i samme funksjon. Commit `f0a92a1`.

### 41. Betalingsflyten med friske øyne — fire runder, tolv funn — 2026-08-21

Én linse forklarer nesten alle funnene: **par som har kommet i utakt.** En
lærdom ble anvendt ett sted og ikke det andre. Koden er gjennomtenkt der noen
har tenkt — feilene ligger i overgangene mellom to steder som skulle sagt det
samme.

**De to alvorligste:**

*En retry kunne la fakturaen stå ubetalt med pengene tatt.* Webhooken skrev
idempotency-merket før arbeidet var ferdig: `lagreBetaling` inserter
payments-raden med `stripe_event_id`, og FØRST deretter markeres fakturaen
betalt. Ryker `markerFakturaBetalt` — en forbigående databasefeil holder —
svarer ruta 500, Stripe prøver igjen, og forsøk to så merket og returnerte
`{dedup:true}` uten å gjøre noe. Fakturaen ble stående ubetalt for alltid, PDF
og e-post usendt, og retryen så vellykket ut i Stripe-dashbordet. Dedup-sjekken
returnerer ikke lenger tidlig; behandlingen kjøres om igjen og tåler det.

*Logo-opplastingen tok imot hva som helst.* Filendelsen kom fra klientens egen
mime-streng, og `contentType` ble sendt urørt til et OFFENTLIG Storage-bucket —
en innlogget bruker kunne lastet opp `text/html` og fått en offentlig URL som
serverte det. Nå fast liste over PNG/JPG/WEBP, endelsen fra vår liste, SVG
utelatt (script), og grense på 2 MB.

**De øvrige ti:**

1. Kundens e-post ble aldri validert. Feilen dukket først opp ved utsending —
   som i webhook-løpet skjer etter at betalingen er registrert, og der svelges
   den med vilje. Håndverkeren satt igjen med en betalt faktura han trodde var
   sendt. `lib/epost.ts`, med vilje romslig.
2. `erUuid` fantes, men bare de nyeste rutene brukte den, selv om kommentaren i
   `lib/uuid.ts` sier at vakten hører hjemme ett sted. Ligger nå i
   `hentFaktura`, `hentKunde` og `hentTilbud`, så alle rutene arver den.
3. PaymentIntent ba om `setup_future_usage: 'off_session'` — fullmakt til å
   trekke kortet senere uten kunden til stede. Ingen kode i appen belaster
   off-session. Fjernet.
4. Kundens betalingsside åpnet betalingsskjemaet igjen etter at bekreftelsen
   gikk ut på tid — rett under linja som sa at betalingen var gjennomført.
5. Fakturadetaljsiden er tvillingen til den, med samme konstanter og samme
   felle. Den sto ufikset etter at kundesiden var rettet — samme mønster som
   hele denne gjennomgangen handler om.
6. De innloggede betalingsrutene sendte rå `err.message` til klienten, der de
   offentlige bevisst ikke gjør det.
7. PDF-en hadde sin egen statusordliste, identisk med `FAKTURA_STATUS_LABEL`.
8. `betalingsbetingelser_dager` ble ikke klampet server-side.
9. Ingen størrelsesgrense på logo-opplasting.
10. Varselet om dobbeltbetaling slo til på hver gjenlevering fra Stripe, ikke
    bare på ekte nye event-id-er.

**Gjennomgått uten funn:** mva-beregningen (240 000 kombinasjoner, null sprik i
at fakturalinjene summerer seg eksakt), de offentlige betalingsrutene,
statusmaskinen, `klargjorPaymentIntent`, resend-ruta mot webhooken, og
`InvoiceView`, som bruker alle de delte hjelperne uten egne kopier.
Fakturanummereringens fallback til én global sekvens er ikke aktiv, fordi
migrasjonen 20260810 er kjørt.

**Én hypotese, ikke bekreftet:** punkt 3 kan henge sammen med den åpne saken der
Bedrift-kunden ser «A processing error occurred.» selv om betalingen går
gjennom. Det krever en ekte betaling over HTTPS for å avgjøres.

Commits `8dcd1b3`, `9df53b1`, `194970a`, `d57a2de`. 92 tester, tsc rent,
bygg grønt.

**Fortsatt ikke gjennomgått:** `lib/stripe.ts`, `app/api/invoices/[id]`,
`app/api/tilbud/*`.


### 42. Femte runde, og partneren er sluppet inn — 2026-08-22

**Malervennen har tilgang.** `Maleren.young@gmail.com` er lagt til i
`ALLOWED_EMAILS` og appen er deployet på nytt.

Verdt å huske hvordan, for det kommer til å skje igjen: Vercel har **ingen
«legg til»-operasjon** — en PATCH erstatter hele verdien. Og verdien lot seg
ikke lese ut programmatisk. Løsningen var å bruke Vercels eget redigeringsfelt,
som fyller inn nåværende verdi for `encrypted`-variabler (i motsetning til
`sensitive`, som `APP_URL` er): markøren sist i feltet, skriv til på slutten.
Verdien gikk aldri gjennom noe mellomledd — kun lengden ble kontrollert, 49 →
74 tegn, med de første 49 urørt.

⚠️ **Sjekk alltid at feltet er forhåndsutfylt før du skriver.** Er det tomt —
som det er for `sensitive`-variabler — overskriver du i stedet for å legge til,
og låser deg selv ute.

Verifisert utenfra etter deploy: forsiden 200, `/calc` 307, og to tilfeldige
adresser får fortsatt `AccessDenied`. At HANS adresse slipper inn er **ikke**
testet — den eneste måten er å be om en innloggingslenke, og da hadde det gått
en ekte e-post til innboksen hans uten at noen ba om det. Hans første
innlogging er testen.

**Femte gjennomgangsrunde — ett funn.** `oppdaterTilbud` brukte `.single()`,
som kaster når ingen rad matcher. En PATCH mot et tilbud som ikke finnes, eller
som tilhører en annen bruker, ble dermed 500 med Postgres-tekst i loggen der
404 er riktig svar. Kunde-ruta har alltid gjort det riktig — `oppdaterKunde`
returnerer null og ruta svarer 404.

Og halve min egen fiks fra punkt 41 sto igjen: `erUuid`-vakten dekket bare
`hentTilbud`, ikke `oppdaterTilbud` og `slettTilbud`. **Andre gang samme dag at
én halvdel av et par ble rettet og den andre glemt** — verdt å notere, siden det
er nøyaktig feilformen hele gjennomgangen har handlet om.

**Gjennomgått uten funn:** `lib/stripe.ts` (cacher klienten, lar SDK-en styre
apiVersion — dokumentert valg), `app/api/invoices/[id]` (både rutevakt mot å
kansellere en betalt faktura og `.neq('status','paid')` i lib-funksjonen), og
POST/PATCH på tilbud, som begge validerer med `verifiserPris`.

Commit `6a39985`. 92 tester, tsc rent, bygg grønt.

**Status for gjennomgangen: fjorten funn over fem runder.** Betalingsflyten,
etterkalkylen, tilgangslaget og tallhåndteringen er nå dekket i sin helhet, og
utbyttet faller — fem funn i første runde, ett i femte. Det som gjenstår er
ikke lenger kode å lete i, men de tre klikketestene og beslutningen om Stripe
Connect.


## Modenhet — ærlig vurdering per 2026-08-13

| | Score | Kort |
|---|---|---|
| Konseptet | **7/10** | Ekte problem, men konkurrerer med etablerte aktører. Vollgraven er tynn til etterkalkylen er på plass. |
| Funksjonalitet | **6/10** | Hele inntektsløkka virker og er verifisert. Dybden for daglig bruk mangler. |
| Brukervennlighet | **6/10** | Kalkulatoren er blitt god. Mobil er fikset (punkt 17) og brukt av malervennen på ekte telefon — men funnene hans er ikke fanget opp. |
| Klar for kollegatest | **7/10** | Ja, i Stripe test-modus. |
| Klar for ekte kunder og penger | **4/10** | Nei. Se blokkerne under. |
| Samlet | **6/10** | Som produkt: midt på treet. Som det som er bygget på noen dager: sterkt fundament. |

**Tre ting som stopper ekte pengebruk:**
1. **Alle betalinger går til eierens Stripe-konto**, uansett hvem som fakturerer.
   Ikke en bug — en arkitekturbeslutning som krever **Stripe Connect** før noen
   andre enn eier tar imot penger. Regnskapsmessig uholdbart for kollegaene slik
   det står.
2. ~~**Ingen allowlist.**~~ **Løst 2026-08-20** (punkt 33 og 36).
   `ALLOWED_EMAILS` er satt i Vercel, appen er deployet, og avvisningen er
   verifisert mot den kjørende appen: en adresse utenfor lista får
   `AccessDenied`, det går ikke ut e-post, og hun havner på appens eget
   norske skjema.
3. **Ingen regnskapseksport** til Fiken eller Tripletex. Uten den blir appen et
   sidespor håndverkeren må dobbeltføre fra.

**Mobil — rettet 2026-08-15.** Påstanden «aldri åpnet på mobil» var feil på to
måter. Punkt 17 beskriver ekte mobilarbeid (hamburgermeny, header som trengte
865 px, beløp som brøt i fakturalisten). Og **malervennen har nå brukt appen på
sin egen telefon.**

⚠️ **Funnene fra den testen er ikke fanget opp noe sted.** Uten dem vet vi at
den har vært i bruk på mobil, men ikke hva som gikk bra eller dårlig. Det er
den enkleste tilgjengelige tilbakemeldingen i hele prosjektet, og den ligger
utenfor dokumentet. Hent den før neste testrunde planlegges.

## Veikart — i prioritert rekkefølge

1. ~~**Etterkalkyle**~~ — **bygget 2026-08-17/18, se punkt 34 og 35.** Både tid
   og materialer lærer nå. Gjenstår: kjør `migrations/20260817_etterkalkyle.sql`,
   og før timer på en ekte jobb. Neste steg i denne retningen er en oversikt
   over treffsikkerhet over tid — «traff du bedre i august enn i juni».
2. ~~**Allowlist** før flere kollegaer inviteres~~ — **bygget 2026-08-17, se
   punkt 33.** Gjenstår: sett `ALLOWED_EMAILS` i Vercel og deploy.
3. **Mobiltest** — én runde på telefon.
4. **Regnskapseksport** til Fiken/Tripletex. Komplementer regnskapsprogrammet,
   ikke konkurrer med det.
5. **Stripe Connect** før ekte penger fra flere brukere.

## ⚠️ GJENSTÅR FØR KOLLEGAENE INVITERES

1. ~~Verifiser env-variablene~~ — **gjort.** Verifisert mot den deployede
   appen: forsiden, /logg-inn og kundens /betal/[token] svarer alle 200,
   det offentlige faktura-API-et returnerer riktig data uten sesjon, ukjent
   token gir 404, og /kunder redirecter (307) uten innlogging.
2. ~~Stripe-webhook mot den nye adressen~~ — **gjort, se punkt 22.**
   `tilbudsmaskinen-vercel-prod` lytter på de tre eventene, ny secret ligger i
   Vercel, og et ekte test-event ble levert med **200 OK**.
3. ~~Test innlogging på den deployede adressen~~ — **gjort 2026-08-13.**
   Magic-link kom frem via Resend og ga innlogget sesjon.
4. ~~Klikk gjennom det nye kalkulator-skjemaet~~ — **gjort, se punkt 24.**
   Hele flyten kjørt i produksjon: skjema → server → historikk → PDF, alle tre
   beregningene ga 48 133 kr. Malervennen skal fortsatt ta sin egen runde for å
   vurdere om satsene stemmer med hvordan han jobber.
5. ~~Kjør migrasjonen `20260813_prissatser.sql`~~ — **gjort 2026-08-14, se
   punkt 26.** Tabellen `prissatser` finnes i produksjon, med RLS på.
   **Ikke lagringstestet gjennom appen ennå** — se punkt 26.
6. **Sju satser mangler markedsdata** og står som `anslag` i `lib/priser.ts`:
   sparkling, montere lister, membran, bytte WC, bytte servant/kran, polering og
   innvendig rens. De gir varsel i appen. Spørsmålet til fagpersonen er **ikke**
   «hva bør dette koste», men «hvor lang tid bruker du på én enhet» — det er
   `timerPerEnhet` modellen regner ut fra. Se `docs/priser.md`.
7. ~~**Sett `ALLOWED_EMAILS` i Vercel**~~ — **gjort 2026-08-20**, se punkt 36.
   Malervennen lagt til 2026-08-22, se punkt 42.
   Verifisert utenfra mot den kjørende appen.
8. ~~**Kjør `migrations/20260817_etterkalkyle.sql`**~~ — **gjort 2026-08-20**,
   se punkt 34. Tabellen finnes, og appen når den.
9. ~~⚠️ **Betalingslenkene kan peke på et parkert domene**~~ — **løst
   2026-08-20**, se punkt 37. `APP_URL` er satt til vercel.app-adressen og
   appen redeployet, så lenkene i faktura-PDF og e-post er levende.
10. **`tilbudsmaskinen.no` er fortsatt ikke koblet til Vercel.** Domenet står
   på registrarens parkeringsside. Det er ikke lenger ødelagt — bare uten det
   navnet dere har betalt for: kundene får en `vercel.app`-lenke i fakturaen.
   Kobles i Vercel → Domains, med A-peker `76.76.21.21` hos registraren.
   Husk å endre `APP_URL` samtidig, ellers fortsetter lenkene på vercel.app.

### 5. PR-forsøk blokkert
Et `create-pr-command` ba om å pushe og opprette en PR. To harde blokkere funnet:
1. **`gh` (GitHub CLI) er ikke installert** på denne maskinen — søkt gjennom vanlige
   installasjonsstier, ikke funnet.
2. **`master` og `origin/master` er allerede identiske** (0 commits foran/bak) — alt
   til og med `933a1dd` er allerede pushet direkte til GitHub av den samme eksterne
   prosessen som overskrev filene i punkt 3. Det finnes ingen diff å åpne en PR mot.

Ba brukeren om retning (installere `gh`? PR mot et eldre commit som base? La det
være?) — ikke besvart ennå.

## Åpne spørsmål til bruker
1. ~~`env.local`-sikkerhetsfunnet~~ — løst, se punkt 4.
2. ~~A eller B for gjenoppretting~~ — bruker valgte **A**, se punkt 6.
3. ~~PR-retning~~ — avklart: jeg lager branch og pusher, bruker åpner/merger PR
   selv på GitHub.com (`gh` er ikke installert). Fungerte for PR #1, #2 og #3.
4. ~~Nøkkelrotasjon~~ — gjennomført, se punkt 9.
5. ~~Migrasjoner~~ — begge kjørt av bruker (20260808 + 20260809), verifisert mot
   live-skjemaet.
6. ~~Slette patch-scriptene~~ — **gjort 2026-08-09** (`d8bf9df`).
   `tilbudsmoduler.patch`, `extract-patch.ps1` og `apply-and-test.ps1` er fjernet
   fra repoet. Innholdet er fortsatt gjenopprettbart via
   `git show 933a1dd:<fil>`. Dermed kan ingen lenger kjøre dem ved et uhell og
   overskrive betalingssystemet med auto-push.

**Ingen åpne spørsmål akkurat nå.**

## Gjenstår før kollega-test (eldre liste)

**Utdatert innledning rettet 2026-08-13:** appen er deployet (punkt 21), så
«alt henger på deploy» stemmer ikke lenger. Punkt 1 og 2 under er nå mulige å
avgjøre. Lista over — «GJENSTÅR FØR KOLLEGAENE INVITERES» — er den som gjelder;
denne beholdes for historikken.

1. **Bedrift-flyten på HTTPS** — bekrefte at "A processing error occurred."
   forsvinner (se punkt 8). Betalingen går faktisk gjennom, men kunden ser en
   feilmelding. Krever en HTTPS-deploy for å avgjøre.
2. **Faktura-e-post til en ADRESSE UTENFOR kontoen** — dette er det eneste som
   gjenstår av e-postsporet. Alt annet er nå bekreftet visuelt (se punkt 14):
   e-posten kommer frem, fra `noreply@tilbudsmaskinen.no`, i innboks (ikke spam),
   med klikkbar betalingslenke og korrekt PDF-vedlegg. Men mottakeren var
   fortsatt `tilbudsmaskinen.no@gmail.com`. Siden domenet nå er verifisert på
   Resend *bør* sending til vilkårlige adresser fungere — men det er ikke testet.
   **Rask test:** legg til en kunde med en annen e-postadresse, opprett faktura,
   trykk "Generer og send".
3. ~~Lagre-knappen på `/innstillinger/firma`~~ — klikk-testet, se punkt 13.
6. **Sett `APP_URL` før deploy** — ellers peker alle betalingslenker i
   PDF/e-post til `localhost:3000` (se punkt 13). Står nå dokumentert både i
   `.env.local.example` og `docs/payments-setup.md`.
7. ~~Slett `env.local`~~ — **gjort i punkt 16.** Nøkkelsettet var identisk med
   `.env.local`, nøklene var utdaterte etter rotasjonen, og Next.js leste
   aldri filen.
8. ~~Kjør migrasjonene~~ — **begge kjørt 2026-08-09** (se punkt 20).
4. ~~Migrasjonen `20260808_...sql` er ikke idempotent~~ — **fikset 2026-08-09**
   (`1649204`), se punkt 12.
5. ~~Rydde bort patch-scriptene~~ — gjort, se `d8bf9df`.

## Env-vars
Alle nøkler ligger i `.env.local` (gitignored). Alle eksponerte nøkler er rotert,
se punkt 9. **Arbeidsprinsipp: nye hemmeligheter limes aldri inn i chatten** —
bruker redigerer `.env.local` selv, verifisering skjer via `curl` som aldri
skriver ut verdien.

`ALLOWED_EMAILS` styrer hvem som får logge inn (punkt 33). **Er den ikke satt
i Vercel, er porten åpen.** Endres den, må appen deployes på nytt.

`OPENAI_API_KEY` er **fjernet fra Vercel** 2026-08-13 (se punkt 23). Den ligger
fortsatt i lokal `.env.local`, og er fortsatt gyldig hos OpenAI. Uten den bruker
appen malbasert tilbudstekst — tallene er upåvirket.

`STRIPE_WEBHOOK_SECRET` må matche den kjørende `stripe listen`-sesjonen (ikke
Dashboard-secreten) for lokal testing. Stripe ga samme secret etter PC-restart,
men sjekk `%TEMP%\stripe-listen-err.log` hvis webhooks plutselig feiler.

## Miljø-noter
- ~~Node/npm er **ikke på PATH** i verktøy-shellet~~ — **stemmer ikke lenger**
  (verifisert 2026-08-17): `npx tsc --noEmit`, `npx next build` og
  `npm run test:pris` kjører rett fra verktøy-shellet.
- Stripe CLI: `C:\Users\event\AppData\Local\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe`
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` må kjøre for at
  webhooks skal nå lokal dev-server.
- ~~Ikke kjør `next build` mens dev-serveren kjører~~ — **løst i punkt 15**.
  `next.config.js` støtter nå `NEXT_DIST_DIR`, så bygg ved siden av dev med
  `NEXT_DIST_DIR=.next-build npx next build`. Kjører du `next build` uten den
  variabelen mens dev står på, korrupteres `.next` fortsatt (se punkt 11).
