# Deploy — få appen ut til kollegaene

Kollegaene dine kan ikke teste noe som kjører på `localhost:3000` på din maskin.
Alt som står igjen på lista i `CURRENT_TASK.md` henger på dette ene steget.

Rekkefølgen under er ikke tilfeldig — steg 4 kan ikke gjøres før appen har fått
en URL, og steg 1 må gjøres før den første kollegaen lager en faktura.

---

## 1. Kjør migrasjonene (før koden deployes)

I Supabase Dashboard → SQL Editor, kjør begge, i denne rekkefølgen:

```
migrations/20260810_per_user_invoice_numbering.sql
migrations/20260811_mva.sql
```

**Mva-migrasjonen må kjøres før den nye koden er i drift.** Uten
`invoices.mva_sats` feiler oppretting av faktura med
`column "mva_sats" does not exist`. Begge skriptene er trygge å kjøre om igjen
og sier fra høylytt hvis noe er galt.

Mva-migrasjonen endrer ikke hva én eneste eksisterende faktura koster: alle
defaults er 0/false, så `total = amount` akkurat som før. Mva slås på først når
du krysser av «Jeg er mva-registrert» i firmaoppsettet.

**Hvorfor nummereringen først:** fakturanummer kom fra én global sekvens for hele
installasjonen. Med to brukere ville dere fått hver deres hullete serie
(du: INV-000001, INV-000003 — kollegaen: INV-000002). Bokføringsforskriften
krever fortløpende nummerering per utsteder. Appen stopper ikke opp uten
migrasjonen — den faller tilbake på den gamle sekvensen og logger et varsel —
men da må fakturaene ryddes opp manuelt etterpå.

Skriptet er trygt å kjøre om igjen og sier fra høylytt hvis noe er galt.

### Migrasjoner som er kommet til senere

```
migrations/20260813_prissatser.sql
migrations/20260817_etterkalkyle.sql
```

`prissatser` gir hver bruker sin egen prisbok. `etterkalkyler` holder hvor lang
tid jobbene faktisk tok, og er grunnlaget for satsforslagene i «Dine satser».

Begge er trygge å kjøre om igjen. Appen krasjer ikke uten dem — historikk og
satser vises som før, bare uten avviksmerker og forslag — men **å registrere
timer feiler** helt til `etterkalkyler` finnes. Da sier appen ifra med
migrasjonens navn i stedet for en databasefeil.

## 2. Bruk Stripe i TEST-modus

Behold `sk_test_.../pk_test_...` for kollega-testen. Da bruker dere Stripes
testkort (`4242 4242 4242 4242`, hvilken som helst fremtidig utløpsdato og
CVC), ingen ekte penger beveger seg, og dere kan teste betaling så mange
ganger dere vil.

Bytt først til live-nøkler når dere skal fakturere en ekte kunde.

## 3. Deploy

Repoet er et vanlig Next.js-prosjekt uten spesialoppsett. På Vercel:

1. **Add New → Project → importer `EV335/tilbudsmodulen`**
2. Framework blir oppdaget automatisk (Next.js). Ikke endre build-kommandoen.
3. Legg inn miljøvariablene fra tabellen under **før** første deploy.

**Raskeste vei:** Vercels env-felt tar imot et helt `.env`-innhold i én
innliming. Åpne `.env.local`, kopier alt, lim inn — og rett så disse tre:

| Variabel | Endres til |
|---|---|
| `NEXTAUTH_URL` | den nye adressen (står som localhost i `.env.local`) |
| `APP_URL` | den nye adressen (finnes ikke i `.env.local` — legg den til) |
| `STRIPE_WEBHOOK_SECRET` | fra steg 5 (`.env.local` har `stripe listen`-secreten, som ikke gjelder i produksjon) |

`SUPABASE_PUBLISHABLE_KEY` i `.env.local` brukes ikke av appen — den kan bli
med uten at det gjør noe.

`.env.local` på din maskin følger *ikke* med av seg selv — variablene må legges
inn hos verten. Mangler en av dem, feiler bygget nå med en melding som sier nøyaktig
hvilken (`lib/env.ts`), i stedet for `supabaseUrl is required`.

| Variabel | Verdi | Merknad |
|---|---|---|
| `SUPABASE_URL` | fra `.env.local` | |
| `SUPABASE_SERVICE_ROLE_KEY` | fra `.env.local` | full databasetilgang — kun server |
| `NEXTAUTH_SECRET` | fra `.env.local` | endres den, blir alle logget ut |
| `NEXTAUTH_URL` | *URL-en du får i steg 4* | |
| `APP_URL` | *URL-en du får i steg 4* | |
| `EMAIL_SERVER_HOST` | `smtp.resend.com` | |
| `EMAIL_SERVER_PORT` | `587` | |
| `EMAIL_SERVER_USER` | fra `.env.local` | |
| `EMAIL_SERVER_PASSWORD` | fra `.env.local` | Resend-nøkkelen |
| `EMAIL_FROM` | `TilbudsMaskinen <noreply@tilbudsmaskinen.no>` | domenet er verifisert |
| `STRIPE_SECRET_KEY` | `sk_test_...` | |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | eneste som er trygg i nettleseren |
| `STRIPE_WEBHOOK_SECRET` | *fra steg 5* | **ikke** den fra `stripe listen` |
| `OPENAI_API_KEY` | valgfri | uten den brukes lokalt estimat |
| `ALLOWED_EMAILS` | `deg@firma.no, @firma.no` | **hvem som får logge inn** — uten den kan hvem som helst lage konto |

## 4. Sett `APP_URL` og `NEXTAUTH_URL` til den ekte adressen

Etter første deploy får du en URL (f.eks. `https://tilbudsmodulen.vercel.app`).
Legg den inn i **begge** variablene og deploy på nytt.

**Hopper du over dette**, peker betalingslenken i hver eneste faktura-PDF og
faktura-e-post til `http://localhost:3000` — en død lenke hos kunden, uten at
noe feiler synlig noe sted. Innlogging via magic-link vil heller ikke fungere.

## 5. Stripe-webhook mot den nye adressen

**✅ Gjort 2026-08-12.** Endepunktet heter `tilbudsmaskinen-vercel-prod`
(`we_1U3hPYGmxqihrRSkawIf9plO`) og står i Stripe-kontoens **sandbox**
(`acct_1U2D7zGmxqihrRSk`) — samme konto som `sk_test_...` i `.env.local`
hører til. Verifisert med `stripe trigger payment_intent.succeeded`:
leveransen ble **200 OK / Delivered**.

Slik det ble satt opp (Workbench → Webhooks → **Add destination**):

- URL: `https://tilbudsmodulen-ev335s-projects.vercel.app/api/webhooks/stripe`
- Events: `checkout.session.completed`, `payment_intent.succeeded`,
  `payment_intent.payment_failed`
- Payload style: **Snapshot** (ikke «Thin») — `stripe.webhooks.constructEvent`
  i `app/api/webhooks/stripe/route.ts` forventer v1-payloaden
- Scope: Your account

Kopier `whsec_...` derfra inn i `STRIPE_WEBHOOK_SECRET` og **deploy på nytt** —
Vercel varsler selv «A new deployment is needed for changes to take effect»,
med en Redeploy-knapp i samme melding. Uten den deployen kjører den gamle
verdien videre.

**Dette er en annen secret enn den `stripe listen` bruker lokalt.** Brukes feil
secret, avvises hver webhook med ugyldig signatur: kunden betaler, men
fakturaen blir aldri markert betalt og ingen PDF sendes.

**Ryddet 2026-08-12:** to eldre event-destinasjoner pekte på
`https://tilbudsmaskinen.no/` (rot-URL, ikke webhook-stien) — `we_1U2DWx...`
med alle 241 event-typer og 100 % feilrate, pluss en «Thin»-variant
(`ed_test_61VBbUJ...`, 24 events). Begge er satt til **Disabled**, ikke slettet,
så konfigurasjonen kan hentes tilbake. Grunnen til å stoppe dem *nå*: når
`tilbudsmaskinen.no` kobles på Vercel i steg 6b, ville de begynt å POSTe
hele event-strømmen mot forsiden.

## 6. Verifiser før du inviterer noen

- [ ] Logg inn med magic-link på den nye adressen
- [ ] Fyll inn firmaopplysninger (det gule varselet peker dit)
- [ ] Legg til en kunde med en **ekte e-postadresse utenfor kontoen din** —
      dette er fortsatt utestet, se `CURRENT_TASK.md` punkt 2 under «Gjenstår»
- [ ] Lag en faktura, trykk «Generer og send», sjekk at e-posten kommer fram
- [ ] Er du mva-registrert: kryss av i firmaoppsettet, lag en ny faktura og
      kontroller at PDF-en viser grunnlag, mva-beløp og «Å betale» — og at
      Stripe trekker totalen, ikke grunnlaget
- [ ] Åpne betalingslenken i e-posten og kontroller at den peker på den nye
      adressen, ikke localhost
- [ ] Betal med testkortet, bekreft at fakturaen blir «Betalt»
- [ ] Gjenta med en **Bedrift**-kunde — det er den flyten som viste
      «A processing error occurred.» lokalt over HTTP, og som først kan
      avgjøres på HTTPS (`CURRENT_TASK.md` punkt 8)

## 6b. Koble til tilbudsmaskinen.no

**Kan ikke gjøres før steg 3–5 er ferdige** — Vercel må ha et prosjekt å knytte
domenet til, og du trenger adressen for å vite hva DNS skal peke på.

DNS ligger hos **Domeneshop** (nameservere `ns1/ns2/ns3.hyp.net`).

Slik det ser ut i dag:

| Post | Verdi | Hva den gjør |
|---|---|---|
| `tilbudsmaskinen.no` A | `185.134.245.113` | Domeneshop-parkering — **denne skal endres** |
| `tilbudsmaskinen.no` AAAA | `2a01:5b40:0:bc03::1` | samme, **fjernes** (Vercel har ikke IPv6 på apex) |
| `send.tilbudsmaskinen.no` TXT | `v=spf1 include:amazonses.com ~all` | ⚠️ **IKKE RØR** — Resend/SPF |
| `send.tilbudsmaskinen.no` MX | `feedback-smtp.eu-west-1.amazonses.com` | ⚠️ **IKKE RØR** — Resend |
| `resend._domainkey` TXT | DKIM-nøkkel | ⚠️ **IKKE RØR** — Resend |

**Gode nyheter:** all e-postsignering ligger på `send.`- og
`resend._domainkey`-subdomenene, helt atskilt fra apex. Å peke
`tilbudsmaskinen.no` mot Vercel rører derfor ikke e-post i det hele tatt —
verken faktura-utsending eller magic-link-innlogging.

**Rekkefølge:**
1. Vercel → prosjektet → Settings → Domains → legg til `tilbudsmaskinen.no`
2. Vercel oppgir hva A-posten skal peke på (normalt `76.76.21.21`)
3. Domeneshop → DNS for tilbudsmaskinen.no → endre A-posten, slett AAAA-posten
4. Vent på propagering (minutter til et par timer)
5. Sett `APP_URL` og `NEXTAUTH_URL` til `https://tilbudsmaskinen.no`, deploy på nytt
6. Oppdater Stripe-webhookens URL til det nye domenet

**Merk steg 5 og 6:** gjør du dem ikke, fortsetter betalingslenkene å peke på
vercel.app-adressen, og webhooken står registrert på den gamle URL-en. Begge
fungerer teknisk, men kunden får en lenke som ikke ser ut som firmaet ditt.

## 7. Så inviterer du kollegaene

**Først: legg dem inn i `ALLOWED_EMAILS`.** Adressen er offentlig, og uten
lista kan hvem som helst som finner den lage konto og sende fakturaer fra
`noreply@tilbudsmaskinen.no` — ditt verifiserte domene, ditt navn på
avsenderen. Kommaseparert, og `@firma.no` slipper inn et helt domene:

```
ALLOWED_EMAILS=deg@firma.no, maler@annetfirma.no
```

Endrer du lista må du **deploye på nytt** — Vercel plukker ikke opp nye
env-verdier i en kjørende deploy. Den som ikke står på lista får verken
e-post eller konto, og ser meldingen «Denne e-postadressen har ikke tilgang»
på /logg-inn.

Fjerner du noen fra lista, mister de tilgangen med én gang — både til sidene
(`middleware.ts` sjekker lista ved hvert sidebesøk) og til API-et
(`session`-callbacken i `lib/auth.ts` slutter å sette `session.user.id`, som
hver eneste API-rute vokter på). Sesjonstoken-et deres er teknisk gyldig i
inntil 30 dager til, men det åpner ingen dører. Skal alle logges ut på én gang,
bytt `NEXTAUTH_SECRET`.

Så trenger de bare adressen. De logger inn med sin egen e-post, får sin egen
konto, sitt eget firma, sine egne kunder og sin egen fakturaserie — alt er
scopet på bruker.

**Verdt å vite:** alle betalinger går til *din* Stripe-konto. I test-modus er
det uproblematisk, men det er én ting å avklare før dere går live.

---

## 8. Hold basen i live — og få beskjed når den ikke er

**Dette er ikke en valgfri finpuss.** Supabases free-plan pauser prosjektet
etter rundt én uke uten aktivitet. Det skjedde i slutten av august 2026, og
appen lå nede i **fem uker uten at noen merket det**.

Grunnen til at ingen merket det er verdt å feste seg ved: forsiden og
`/logg-inn` er statiske og svarte 200 hele tiden. Det som var dødt var alt som
rører databasen — altså betalingslenken en kunde kan ha liggende i innboksen i
flere uker før han bruker den.

### Hva som er bygget

`vercel.json` planlegger ett kall i døgnet til `/api/cron/holdliv`. Ruten gjør
to ting:

1. **Ett oppslag mot databasen.** Det holder prosjektet aktivt. Oppslaget er en
   `count`-spørring uten rader — vi trenger aktivitet, ikke data.
2. **Feiler oppslaget, går det e-post.** Dette er den viktigste halvdelen: en
   cron-jobb som slutter å virke sier ingenting av seg selv, og det er nettopp
   da basen pauses. Uten varselet ville neste pause vært like usynlig som den
   forrige.

Ruten svarer alltid `200` når den selv virker — også når basen er nede. Vercel
prøver ikke cron-kall på nytt, så en 500 ville bare gjort utfallet vanskeligere
å lese i loggen. Status står i svarkroppen.

### To env-variabler hos Vercel

```
CRON_SECRET=<noe langt og tilfeldig>
VARSEL_EPOST=deg@firma.no
```

**`CRON_SECRET`** gjør at bare Vercels egen cron kan kalle ruten. Setter du den,
sender Vercel den automatisk som `Authorization: Bearer ...` — du trenger ikke
gjøre noe mer.

Er den **ikke** satt, slipper kallet gjennom likevel. Det er et bevisst valg:
alternativet — avvis alltid uten hemmelighet — betyr at en glemt variabel gir
401 hver dag, ingen oppslag mot basen, og en pause ingen får varsel om, siden
varselet sendes av samme rute. Feilen ville slått ut i presis den retningen vi
prøver å unngå. Ruten returnerer ingen data, så en åpen variant er til å leve
med.

**`VARSEL_EPOST`** er hvem som får beskjed. **Sett den.** Er den ikke satt,
brukes første konkrete adresse i `ALLOWED_EMAILS` — og den lista inneholder
kollegaer, ikke bare deg. Står malervennen først der, er det han som får
«databasen svarer ikke» klokka sju om morgenen. Meldingen er ufarlig, men
den er ikke hans å gjøre noe med.

Står det bare domeneregler (`@firma.no`) i lista, finnes ingen mottaker i det
hele tatt — da logger ruten det i Vercel-loggen i stedet, og ingen får e-post.

### Sjekk at den virker

Vercel → prosjektet → **Cron Jobs** viser jobben og siste kjøring. Du kan også
kalle den selv:

```bash
curl -s https://<appen>/api/cron/holdliv -H "Authorization: Bearer $CRON_SECRET"
```

Svaret er `{"oppe":true,"ms":...}` når alt står som det skal.

### Prøv varslingen med vilje

Den ene stien som ellers aldri blir prøvd er den som betyr noe: at e-posten
faktisk kommer frem når basen er borte. Den kan ikke testes ved å vente på at
det skjer — da er det for sent.

```bash
curl -s "https://<appen>/api/cron/holdliv?prove=1" -H "Authorization: Bearer $CRON_SECRET"
```

Tvinger nede-grenen uten å røre databasen, og sender et varsel som er tydelig
merket som prøve. Svaret sier hvem det gikk til.

### En vakt som står utenfor

`/api/helse` svarer **200** `{"oppe":true}` eller **503** `{"oppe":false}`, og
rører basen for å finne ut hvilken. Den er **åpen med vilje** — en ekstern
uptime-tjeneste kan ikke sende en hemmelighet. Den returnerer ingenting om
innholdet i basen.

Hullet den lukker: nedevarselet over sendes av den samme cron-jobben som gjør
sjekken. Slutter jobben å kjøre, stopper varslene samtidig — og da er det
ingenting igjen som sier fra. Et øye utenfor Vercel ser begge deler.

Sett opp en gratis overvåking (UptimeRobot e.l.):

| Felt | Verdi |
|---|---|
| Type | HTTPS |
| URL | `https://<appen>/api/helse` |
| Intervall | 5 minutter |
| Varsel til | din e-post |

503 er med vilje, ikke 200 med `oppe: false`: en uptime-vakt leser
statuskoden.

### Det dette ikke løser

Hobby-planen hos Vercel kjører cron-jobber **én gang i døgnet**, innenfor timen
du har oppgitt. Det er rikelig mot en grense på én uke. Men merk at jobben bare
kjører så lenge prosjektet er deployet hos Vercel — tar du appen ned der, er
pausevernet borte også.
