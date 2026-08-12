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

## Gjenstår før kollega-test

**Alt under henger på deploy — se `docs/deploy.md`. Appen kjører bare på
localhost, så kollegaene kan ikke nå den, og punkt 1 og 2 kan ikke avgjøres
før den har en ekte HTTPS-adresse.**

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

`STRIPE_WEBHOOK_SECRET` må matche den kjørende `stripe listen`-sesjonen (ikke
Dashboard-secreten) for lokal testing. Stripe ga samme secret etter PC-restart,
men sjekk `%TEMP%\stripe-listen-err.log` hvis webhooks plutselig feiler.

## Miljø-noter
- Node/npm er **ikke på PATH** i verktøy-shellet. Full sti:
  `"/c/Program Files/nodejs/node.exe" node_modules/typescript/bin/tsc --noEmit`
- Stripe CLI: `C:\Users\event\AppData\Local\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe`
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` må kjøre for at
  webhooks skal nå lokal dev-server.
- ~~Ikke kjør `next build` mens dev-serveren kjører~~ — **løst i punkt 15**.
  `next.config.js` støtter nå `NEXT_DIST_DIR`, så bygg ved siden av dev med
  `NEXT_DIST_DIR=.next-build npx next build`. Kjører du `next build` uten den
  variabelen mens dev står på, korrupteres `.next` fortsatt (se punkt 11).
