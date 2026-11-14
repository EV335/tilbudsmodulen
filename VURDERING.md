# Er TilbudsMaskinen verdt det? — vurdering 14. november 2026

## Kort svar

**Ikke verdt mer kode akkurat nå. Verdt én billig, tidsavgrenset test.**

Teknisk er appen nesten ferdig. Det som mangler er bevis for at en
håndverker vil bruke den. Etter tre måneder finnes det fortsatt ikke ett
eneste tilbud sendt til en ekte kunde. Det avgjøres ikke av flere funksjoner,
men av om én jobb kan gå hele veien gjennom appen.

Mitt råd er fire uker med en klar stopp-regel (se under). Kommer det ikke en
ekte jobb gjennom appen i løpet av den tiden, legg prosjektet på is uten
dårlig samvittighet.

---

## Hva som faktisk finnes

| | |
|---|---|
| Kode | 113 commits, `tsc` rent, **183 tester grønne**, produksjonsbygg grønt (sjekket 7. nov på ny PC) |
| Funksjoner | Kalkulator bygget rundt rommål, tilbud-PDF, historikk, kunder, faktura, Stripe (privat + bedrift), offentlig betalingslenke, etterkalkyle, treffsikkerhet over tid, mobilmeny, tilgangsliste |
| Produksjon | Deployet på Vercel. `tilbudsmaskinen.no` er fortsatt ikke koblet |
| Betaling | Kun Stripe **testmodus**. Ingen ekte krone har gått gjennom appen |
| Data i basen | 1 tilbud, 6 testfakturaer, 4 testbetalinger, 3 kunder, 3 brukere |

Det er et solid stykke arbeid. Betalingsflyten er verifisert ende til ende,
sikkerhetshullene som ble funnet er tettet, og driftsvernet (`/api/holdliv`,
`/api/helse`) er bygget og testet.

## Hva som ikke finnes

| | |
|---|---|
| Ekte tilbud til en ekte kunde | **0** |
| Timer ført på en ekte jobb (etterkalkyle) | **0** |
| Betalende brukere | **0** |
| Brukere som har bedt om appen | **0**. Malervennen bruker den fordi han er spurt |

**Kjernen i produktet er treffsikre priser som lærer av etterkalkylen.** Den
delen har aldri fått ett eneste datapunkt. Alt annet (faktura, betaling,
kunderegister) finnes allerede i verktøy håndverkere bruker i dag.

## Hva som har skjedd siden sist (10. oktober → nå)

**Positivt:**
- **Maleren svarte (18. okt), og han hadde prøvd.** Det som stoppet ham var
  skjemaet: `30` i et timefelt betydde 30 timer. Det er et godt tegn. Friksjonen
  var et felt, ikke manglende interesse. Arket er rettet (versjon 3, med egne
  bokser for timer og minutter), og e-posten er sendt.
- Driftsvernet er ferdig: daglig puls, nedevarsel på e-post og en åpen
  helserute for ekstern overvåking. Nede-veien er testet på ekte.

**Negativt:**
- **Databasen er nede igjen i dag (14. nov), sju dager etter at den ble
  gjenopprettet 7. nov.** Supabase-adressen finnes ikke i DNS (sjekket mot
  1.1.1.1). Det er tredje gang. Sannsynligvis pauset igjen, men bare
  dashbordet kan si det sikkert.
  **Grunnen er kjent: pausevernet ligger fortsatt på branch
  `holdliv-pausevern` og er ikke merget.** Koden som løser problemet finnes,
  den er bare ikke i produksjon.
- Share-pinnen på arket var ikke flyttet da e-posten gikk 18. okt. Åpnet
  maleren lenken, så han versjon 1, altså det samme skjemaet som stoppet ham.
- **Jeg vet ikke om maleren har svart etter 18. okt.** Det må du sjekke i
  innboksen.
- Prosjektet har stått stille i nesten fire uker (siste commit 18. okt).

## Markedet, ærlig

Faktura og betaling er ikke et fortrinn. Fiken og Tripletex gjør det, og
håndverkerverktøy som Cordel, SmartDok og Bygglet dekker prosjekt, timer og
tilbud. (Jeg har ikke sjekket hva de koster eller har av funksjoner i dag.)

Det eneste som kan skille TilbudsMaskinen ut er påstanden **«prisen blir
riktigere for hver jobb du fører»**. Den er god, men helt uprøvd. Og malerens
viktigste innvending fra august står fortsatt delvis åpen: appen priser
**for lavt** fordi arbeidet rundt arbeidet (tildekking, maskering, vask,
flikking, rydding) mangler. Svarene hans på arket er det som lukker det.

## Score — oppdatert

| | Aug | Nå | Hvorfor |
|---|---|---|---|
| Konseptet | 7 | **7** | Uendret. Ekte problem, tynn vollgrav til etterkalkylen har data |
| Teknisk modenhet | 6 | **8** | Mye bygget og verifisert siden august |
| Drift | – | **4** | Tre pauser. Løsningen finnes, men er ikke merget |
| Bevis for at noen vil bruke den | 3 | **3** | Maleren prøvde, men ingen ekte jobb |
| Klar for ekte kunder og penger | 4 | **4** | Stripe Connect, live-nøkler og regnskapseksport mangler fortsatt |
| **Verdt mer tid?** | | **Ja, men bare fire uker til** | |

## Anbefaling: fire uker, med en stopp-regel

**Uke 1, ingen ny kode, cirka én time totalt:**
1. Resume databasen i Supabase-dashbordet.
2. **Merge `holdliv-pausevern`** og sett `CRON_SECRET` og `VARSEL_EPOST` i
   Vercel. Ellers skjer dette igjen om en uke.
3. Flytt share-pinnen på arket til versjon 3.
4. Send maleren én kort melding: «Har du en jobb de neste ukene vi kan kjøre
   gjennom appen sammen?»

**Uke 2–4:**
5. Legg inn postene hans når svaret kommer (cirka en halvtime).
6. Kjør **én ekte jobb**: tilbud → kunden sier ja → timer ført → etterkalkyle.

**Stopp-regel, 12. desember:**
- **Fortsett** hvis én ekte jobb har gått gjennom, og maleren vil bruke appen
  på den neste av seg selv.
- **Legg på is** hvis ingen jobb har gått gjennom. Det er ikke et nederlag.
  Det er svaret testen skulle gi.

## Hvis du legger det på is

Det koster nesten ingenting å parkere:
- Koden ligger trygt på GitHub (`EV335/tilbudsmodulen`).
- Supabase-prosjektet kan gjenopprettes fra dashbordet senere (det sto
  «until 10 Oct 2027» sist). Ta gjerne en eksport av dataene først.
- Rotér nøklene i `.env.local` uansett. De ligger i klartekst på
  backup-disken og har vært limt inn i chat.

---

*Grunnlag: `CURRENT_TASK.md` (sist oppdatert 18. okt), git-historikken,
tellinger i databasen 7. nov og en DNS-sjekk 14. nov. Det eneste jeg ikke kan
se er innboksen din. Om maleren har svart etter 18. okt endrer bildet mer
enn noe annet her.*
