# Prismodellen — hvor tallene kommer fra

Sist kalibrert: 13. august 2026. Utfyllingen bygget om rundt rommålene 25. august 2026.

## Hvorfor modellen ble bygget om

Kollegaer i flere fag meldte at tallene ikke stemte — en jobb til rundt 34 000 kr
kom ut på 100 000. Gjennomgangen fant tre feil, i denne rekkefølgen:

**1. AI-en regnet, og den kunne ikke regne.** Sju av sju testkall ga aritmetisk
umulige svar: `pris` stemte ikke med `timer × timepris + materialer + margin` i et
eneste tilfelle. Avvikene gikk opp til 52 500 kr. På samme jobb kunne AI-en gi
0,34× eller 1,45× av husmodellen, avhengig av inputen. Marginen appen viste til
håndverkeren var oppdiktet.

**2. Alle fag delte ett `romstørrelse i m²`-felt.** Maler prises per m²
*veggflate*, gulvlegger per m² *gulv*, elektriker per *punkt*, rørlegger som
fastpris per jobb, bilpleie per bil. Feltet sa heller ikke om m² var gulv eller
vegg — et rom på 20 m² gulv har 45–55 m² vegg, altså en faktor 2,5 alene.

**3. Håndverkeren så ingen utregning.** Bare en pris. Umulig å se hvor det gikk
galt.

## Modellen nå

Et tilbud består av **linjer**. Hver linje er én arbeidsoperasjon med sin egen
enhet: «Male vegger, 45 m² veggflate» + «Male tak, 12 m² takflate».

Per linje:

```
timer     = antall × timerPerEnhet
arbeid    = timer × håndverkerens egen timepris
materialer= antall × materialPerEnhet
pris      = (arbeid + materialer) / (1 − margin/100)
```

**Det som er kalibrert er `timerPerEnhet` — produktivitet, ikke pris.**
Produktivitet er stabil på tvers av landet; timepris og margin er håndverkerens
egne. Slik blir tallet deres eget, ikke et gjennomsnitt fra nettet.

`markedLav`/`markedHoy` brukes **ikke** i utregningen. De er ferdig markedspris
per enhet, og appen varsler når resultatet havner utenfor båndet — enten fordi
kunden vil finne det billigere andre steder, eller fordi håndverkeren er i ferd
med å tape penger.

**AI-en rører ikke tall lenger.** Den får det ferdige regnestykket og skriver
tilbudsteksten. Gjengir teksten et annet totalbeløp enn det som ble regnet ut,
forkastes den og malen tar over ([lib/ai.ts](../lib/ai.ts)).

## Markedsdata som ligger til grunn (2026)

| Arbeid | Markedspris | Kilde |
|---|---|---|
| Male vegger innvendig | 140–280 kr/m² veggflate inkl. materialer | Byggepris, LummeCo, BOVG |
| Male tak | 250–400 kr/m² takflate | samme |
| Timepris maler | 400–700 kr eks. mva (Oslo 550–700) | samme |
| Legge parkett/laminat (klikk) | 150–350 kr/m² i arbeid | Flip, Oppussingsguiden |
| Legge massivt tregulv (limt) | 350–600 kr/m² i arbeid | samme |
| Legge vinyl/LVT | 100–300 kr/m² i arbeid | CorHome, Flip |
| Timepris gulvlegger | 570–900 kr | samme |
| Flislegging | 500–1 200 kr/m² arbeid, 900–1 600 kr/m² inkl. materialer | SendTilbud, Byggstart |
| Elektriker, per punkt | 1 200–2 000 kr | Boligsmart, Elektrikerpris |
| Elektriker, timepris | 700–1 200 kr eks. mva | samme |
| Bytte sikringsskap | 10 000–25 000 kr, snitt ~18 000 | Boligsmart |
| Rørleggerdel av komplett bad (5–7 m²) | 65 000–125 000 kr | Byggstart, ByggSmartere |
| Komplett badrenovering | 40 000–60 000 kr per m² | samme |

Kilder:
[Byggepris — maling](https://byggepris.no/maling) ·
[LummeCo — husmaling pris](https://lummeco.no/husmaling-pris-2025-kostnader-og-kalkulator/) ·
[BOVG — sparkling og maling](https://bovg.no/malerservice/sparkling-og-maling-prisguide-2026/) ·
[Flip — gulvlegging](https://flip.no/artikler/hva-koster-gulvlegging) ·
[Oppussingsguiden — legge gulv](https://www.oppussingsguiden.no/pris/oppussing/koster-legge-gulv/) ·
[CorHome — gulvbelegg](https://corhome.no/gulvbelegg-pris) ·
[SendTilbud — flislegger](https://www.sendtilbud.no/blog/flislegger-priser) ·
[Byggstart — fliser på bad](https://www.byggstart.no/pris/legge-fliser-pa-bad) ·
[Boligsmart — elektriker per punkt](https://www.boligsmart.no/pris/elektriker-pris-per-punkt) ·
[Elektrikerpris — timepris](https://www.elektrikerpris.no/pris/elektriker-timepris) ·
[Byggstart — rørlegger](https://www.byggstart.no/pris/rorlegger) ·
[ByggSmartere — bad-renovering](https://www.byggsmartere.no/blogg/hva-koster-bad-renovering)

**Merk om mva:** prisguidene over er forbrukerpriser og oppgir dels inkl., dels
eks. mva. Timeprisene er eks. mva. Appen regner eks. mva og legger på mva til
slutt (se [lib/mva.ts](../lib/mva.ts)). Ved ny kalibrering: sjekk hvilken side av
mva kilden står på før du sammenligner.

## Kontrollen som er kjørt

Med typiske timepriser (maler 600, snekker/murer 700, elektriker/rørlegger 900)
lander **alle markedsforankrede satser innenfor båndet**:

| Operasjon | Modellen gir | Marked |
|---|---|---|
| Male vegger | 173 kr/m² | 140–280 |
| Male tak | 260 kr/m² | 250–400 |
| Parkett/laminat | 799 kr/m² | 400–900 |
| Massivt tregulv | 1 458 kr/m² | 800–1 500 |
| Vinyl/LVT | 493 kr/m² | 250–900 |
| Flislegging | 1 432 kr/m² | 900–1 600 |
| Elektrisk punkt | 1 786 kr | 1 200–2 000 |
| Sikringsskap | 21 714 kr | 15 000–25 000 |
| Rørleggerdel bad | 107 857 kr | 65 000–125 000 |

## Den rapporterte saken, reprodusert

Kollegaen meldte at en jobb til rundt 34 000 kr kom ut på 100 000. Med den gamle
modellen, der en maler taster inn **flaten han faktisk maler** i et felt som het
«romstørrelse» og var kalibrert for gulvareal:

| Veggflate | Marked | Gammel app | Ny app |
|---|---|---|---|
| 60 m² | 8 400–16 800 | 31 200 | **12 200** ✓ |
| 130 m² | 18 200–36 400 | 67 600 | **26 433** ✓ |
| 200 m² | 28 000–56 000 | **104 000** | **40 667** ✓ |

200 m² veggflate ga **104 000 kr** i den gamle appen, mot et marked på
28 000–56 000. Det er saken som ble meldt.

Feilen var ikke at satsen var litt for høy — den lå **konsekvent 1,9× over
toppen av markedet uansett størrelse**, fordi modellen var lineær i feil enhet.
Ett ord i en feltetikett, en faktor tre i tilbudet.

En hel leilighet — 130 m² vegg + 70 m² tak — gir nå 48 133 kr på 37 timer, mot
et marked på 35 700–64 400. Den jobben kunne den gamle modellen ikke uttrykke i
det hele tatt: ett felt, ingen mulighet til å skille tak fra vegg.

## Utfyllingen — hva håndverkeren faktisk blir spurt om (25. august 2026)

### Hvilke fag appen er for

Fagene som står igjen deler én egenskap: **håndverkeren måler eller teller noe
fast, og tallet hans blir tilbudet.**

| Fag | Måler | Enhet |
|---|---|---|
| Maler | Vegg, tak, listverk | m², løpemeter, stk |
| Snekker / gulvlegger | Gulv, listverk | m², løpemeter |
| Murer / flislegger | Gulv eller vegg | m² |
| Elektriker | Teller punkter | punkt, stk |
| Rørlegger | Teller enheter | stk |

**Bilpleie er fjernet (25.08.2026).** Faget passet ikke modellen. Alt her hviler
på et målbart omfang og på at samme jobb gjøres på samme måte hver gang. En bil
har ingen av delene: prisen styres av lakkens tilstand og hvor skitten kupeen
er, og det er en befaring, ikke en utregning. Alle elleve operasjonene sto som
`anslag` uten ett eneste markedstall. Tallene finnes i git-historikken.

### Rommet: ett sett mål, alle flatene

Hjelpeteksten til `maler_vegg` sa tidligere: «Veggflate, ikke gulvflate. Rom på
20 m² gulv har typisk 45–55 m² vegg.» Appen ba altså maleren gjøre en omregning
med tommelfingerregel før han fikk fylle ut feltet.

Første forsøk på å rette det ga hver linje sin egen regner. Det løste
hoderegningen, men skapte en verre feil: **de samme målene måtte tastes inn på
nytt per operasjon, og kunne drive fra hverandre.** 21 m² gulv og 23 m² tak i
samme rom er et tilbud som ikke går opp — og kunden ser det før håndverkeren
gjør det.

Nå ligger målene på JOBBEN ([lib/mengde.ts](../lib/mengde.ts)), ikke på linja:

```
gulv     = lengde × bredde
tak      = lengde × bredde          ← samme tall, per definisjon
vegg     = 2 × (lengde + bredde) × høyde − dører×1,9 − vinduer×1,4
listverk = 2 × (lengde + bredde) − dører×0,9
```

Håndverkeren måler rommet én gang. Hver linje henter mengden sin fra riktig
tall, og **taket kan ikke bli et annet areal enn gulvet.** Flere rom kan legges
inn og summeres — en maler priser sjelden ett rom om gangen.

Tre valg det er verdt å kjenne til:

1. **Taket er gulvet.** Skråtak og innkassinger finnes, men da overstyrer
   håndverkeren linja manuelt. Det er en avgjørelse han tar, ikke en antakelse
   appen skal gjøre på egen hånd.
2. **Et rom uten takhøyde teller på gulv og listverk, men ikke på vegg** — og
   det blir talt opp og sagt fra om. En stille for liten veggflate er et for
   billig tilbud, og den feilen oppdages først når jobben er gjort.
3. **`m2_flate` er den eneste tvetydige enheten.** Flis ligger både på gulv og
   vegg, sparkling på vegg, membran på gulv. Håndverkeren velger flate på linja.

Elektrikeren og rørleggeren ser ikke målefeltene i det hele tatt. De teller
punkter og enheter, og et areal ville vært støy.

**Samsvarssjekk.** Skriver håndverkeren inn gulv og tak for hånd og de spriker
med mer enn 10 %, sier appen fra. Kommer begge fra rommålene er de like, og da
finnes det ingenting å advare om.

### To grep som gjelder alle fagene

**Jobbmaler.** «Ett rom — vegger og tak» krevde fem handlinger for en jobb som
gjøres hver uke. Nå ett klikk. `antall` settes bare der jobben faktisk er fast
(ett bad, ett sikringsskap); flatene kommer fra målene.

**Standardverdier på firmaet.** Timeprisen er den samme hver gang, men skjemaet
startet tomt og krevde den på nytt for hvert tilbud. `firma` har nå
`standard_timepris`, `standard_margin_prosent` og `standard_fag`, alle nullable
— NULL betyr «ikke bestemt», og da oppfører skjemaet seg som før. Migrasjon:
`migrations/20260825_firma_standardverdier.sql`.

## Satser som IKKE er markedsverifisert

Disse står med `kilde: 'anslag'` i [lib/priser.ts](../lib/priser.ts) og gir et
varsel i appen. **De trenger en fagperson.** Spørsmålet er ikke «hva bør dette
koste», men «hvor lang tid bruker du på én enhet».

| Fag | Operasjoner |
|---|---|
| Maler | Sparkling og grunning, 1 strøk (oppfriskning), listverk og karmer, dør, vindu |
| Snekker | Montere lister |
| Murer | Membran på våtrom |
| Rørlegger | Bytte toalett, bytte servant/kran |

**Malerens nye satser er avledet, ikke funnet.** 1 strøk står på 0,10 t/m² mot
2 strøk sitt markedsverifiserte 0,15: ett strøk sparer selve påføringen, men
ikke maskering og rigg, derfor to tredjedeler og ikke halvparten. Dør (1,2 t),
vindu (1 t) og listverk (0,08 t/lm) er normaltall uten kilde. Alle fem er merket
`anslag` og varsler i appen.

Ni operasjoner uten markedstall, mot sju før — fire nye hos maleren, to fjernet
med bilpleie. Appen varsler på hver av dem, og etterkalkylen retter dem etter
tre førte jobber.

## Slik kalibrerer du

Alt ligger i `FAG` i [lib/priser.ts](../lib/priser.ts). Endre `timerPerEnhet` —
ikke prisen. Er tallet for høyt, bruker modellen for lang tid på jobben; det er
den samtalen man skal ha med en håndverker, ikke «hva bør dette koste».

Kontroll etter endring:

```bash
npm run test:pris
```

Testene vokter blant annet at ingen operasjons-id forsvinner, at hver sats uten
markedsbånd er merket `anslag`, og at alle jobbmaler peker på operasjoner som
finnes.
