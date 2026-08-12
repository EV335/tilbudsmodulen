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

## 4. Sett `APP_URL` og `NEXTAUTH_URL` til den ekte adressen

Etter første deploy får du en URL (f.eks. `https://tilbudsmodulen.vercel.app`).
Legg den inn i **begge** variablene og deploy på nytt.

**Hopper du over dette**, peker betalingslenken i hver eneste faktura-PDF og
faktura-e-post til `http://localhost:3000` — en død lenke hos kunden, uten at
noe feiler synlig noe sted. Innlogging via magic-link vil heller ikke fungere.

## 5. Stripe-webhook mot den nye adressen

Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

- URL: `https://DIN-ADRESSE/api/webhooks/stripe`
- Events: `checkout.session.completed`, `payment_intent.succeeded`,
  `payment_intent.payment_failed`

Kopier `whsec_...` derfra inn i `STRIPE_WEBHOOK_SECRET` og deploy på nytt.

**Dette er en annen secret enn den `stripe listen` bruker lokalt.** Brukes feil
secret, avvises hver webhook med ugyldig signatur: kunden betaler, men
fakturaen blir aldri markert betalt og ingen PDF sendes.

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

## 7. Så inviterer du kollegaene

De trenger bare adressen. De logger inn med sin egen e-post, får sin egen
konto, sitt eget firma, sine egne kunder og sin egen fakturaserie — alt er
scopet på bruker.

**Verdt å vite:** alle betalinger går til *din* Stripe-konto. I test-modus er
det uproblematisk, men det er én ting å avklare før dere går live.
