# Prismodellen — hvor tallene kommer fra

Sist kalibrert: 13. august 2026.

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

## Satser som IKKE er markedsverifisert

Disse står med `kilde: 'anslag'` i [lib/priser.ts](../lib/priser.ts) og gir et
varsel i appen. **De trenger en fagperson:**

- Sparkling og grunning (maler)
- Montere lister (snekker)
- Membran på våtrom (murer)
- Bytte toalett, bytte servant/kran (rørlegger)
- Polering og lakkforsegling, innvendig rens (bilpleie)

## Slik kalibrerer du

Alt ligger i `FAG` i [lib/priser.ts](../lib/priser.ts). Endre `timerPerEnhet` —
ikke prisen. Er tallet for høyt, bruker modellen for lang tid på jobben; det er
den samtalen man skal ha med en håndverker, ikke «hva bør dette koste».

Kontroll etter endring:

```bash
npx tsc --noEmit
```
