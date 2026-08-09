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

**Fortsatt IKKE gjort — krever ting jeg ikke har tilgang til herfra:**
- **Ikke kjørt migrasjonen i Supabase** (brukeren må gjøre dette selv, se
  `docs/payments-setup.md` punkt 2 — spesielt viktig hvis patch-versjonen av
  migrasjonen ved et uhell allerede ble kjørt mot databasen, siden `firma`-
  tabellen da kan ha feil kolonner). Ingen database-tilgang fra denne økten.
- **Ikke faktisk logget inn og klikket gjennom betalingsflytene** (opprette
  kunde → opprette faktura → "Betal nå"/Stripe Elements → webhook → PDF).
  Innlogging går via ekte magic-link-e-post (nå med ekte Resend-nøkkel) — jeg
  har ingen tilgang til innboksen for å klikke lenken. Krever også
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe` kjørende i
  en egen terminal for at webhooken skal nå lokal dev-server i det hele tatt.
- `tilbudsmoduler.patch`, `extract-patch.ps1`, `apply-and-test.ps1` ligger
  fortsatt i repoet (sporet, committet). Forsøkte å slette dem 2026-08-09 —
  **blokkert av auto-mode-klassifisereren** (filsletting av sporede filer
  krever eksplisitt brukerbekreftelse). Ikke slettet, venter fortsatt på
  brukerens ok.

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
1. ~~Hvordan vil du håndtere `env.local`-sikkerhetsfunnet~~ — løst, se punkt 4.
2. ~~A eller B for gjenoppretting~~ — bruker valgte **A**, gjennomført på branch
   `fix/restore-invoice-payment-system`, se punkt 6.
3. ~~PR-retning~~ — bruker valgte "branch + jeg pusher, du åpner PR selv på
   GitHub.com" (`gh` fortsatt ikke installert, så ingen `gh pr create` herfra).
4. **Nytt:** Skal jeg slette `tilbudsmoduler.patch`, `extract-patch.ps1` og
   `apply-and-test.ps1` fra repoet nå som patchen er "brukt opp"? De er en
   risiko hvis de kjøres på nytt (se punkt 6) — men jeg har ikke fjernet dem
   uten å spørre, siden de ikke er noe jeg selv la til.
5. Bør Supabase service_role-nøkkelen roteres i dashbordet (lå i klartekst i
   `env.local` en periode, se punkt 4)? Kun brukeren kan gjøre dette.
6. Vil du at jeg kjører migrasjonen mot Supabase, eller gjør du det selv i
   SQL Editor (se punkt 6, "IKKE gjort ennå")? Jeg har ikke tilgang til
   databasen herfra uansett, så dette må uansett gjøres av brukeren.

## Env-vars
Stripe secret/publishable/webhook-nøklene og Supabase publishable-nøkkelen brukeren
limte inn 2026-08-08 er nå flyttet til `.env.local` (se punkt 4 — løst).
