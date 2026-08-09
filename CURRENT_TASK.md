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
6. **Fortsatt åpent: slette `tilbudsmoduler.patch`, `extract-patch.ps1`,
   `apply-and-test.ps1`?** Bruker har sagt ja, men `git rm` blir blokkert av
   auto-mode-klassifisereren (sletting av sporede filer krever at bruker kjører
   det selv). Kommando:
   `git rm tilbudsmoduler.patch extract-patch.ps1 apply-and-test.ps1`

## Gjenstår før "ferdig utviklet" (mål: lokalt, klart for kolleger)
1. **Bedrift-flyten på HTTPS** — bekrefte at "A processing error occurred."
   forsvinner (se punkt 8). Betalingen går faktisk gjennom, men kunden ser en
   feilmelding. Krever en HTTPS-deploy for å avgjøre.
2. **Faktura-e-post til en ekte kundeadresse** — domenet er verifisert på Resend
   og `EMAIL_FROM` er byttet til `noreply@tilbudsmaskinen.no`, men det er ikke
   bekreftet at en kunde med annen adresse enn `tilbudsmaskinen.no@gmail.com`
   faktisk mottar fakturaen. Bekreft også at betalingslenken står i e-posten.
3. **Lagre-knappen på `/innstillinger/firma`** — aldri klikk-testet (se punkt 11).
4. **Migrasjonen `20260808_...sql` er ikke idempotent** — `create table` for
   `customers`/`invoices`/`payments` mangler `if not exists` og feiler **stille**
   mot et prosjekt der tabellene finnes fra før (skjedde her, se punkt 7). Bør
   fikses før den kjøres i et nytt miljø / for en ny bruker.
5. Rydde bort patch-scriptene (punkt 6 over).

## Env-vars
Alle nøkler ligger i `.env.local` (gitignored). Alle eksponerte nøkler er rotert,
se punkt 9. **Arbeidsprinsipp: nye hemmeligheter limes aldri inn i chatten** —
bruker redigerer `.env.local` selv, verifisering skjer via `curl` som aldri
skriver ut verdien.

`STRIPE_WEBHOOK_SECRET` må matche den kjørende `stripe listen`-sesjonen (ikke
Dashboard-secreten) for lokal testing. Stripe ga samme secret etter PC-restart,
men sjekk `%TEMP%\stripe-listen-err.log` hvis webhooks plutselig feiler.

## Miljø-noter
- Node/npm er **ikke på PATH** i verktøy-shellet. Full sti:
  `"/c/Program Files/nodejs/node.exe" node_modules/typescript/bin/tsc --noEmit`
- Stripe CLI: `C:\Users\event\AppData\Local\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe`
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` må kjøre for at
  webhooks skal nå lokal dev-server.
- Ikke kjør `next build` mens dev-serveren kjører — de deler `.next` og det
  korrupterer den (se punkt 11).
