// Regresjonstest for prismodellen. Kjør med: npm run test:pris
//
// Hver test her svarer til en bug som faktisk har vært i koden. Endrer du
// lib/priser.ts, lib/ai.ts, lib/pdftekst.ts, lib/format.ts, lib/tilgang.ts
// eller lib/etterkalkyle.ts — kjør denne først.
//
// Ingen testrammeverk i prosjektet; dette er et vanlig skript med exit-kode,
// slik at det kan kjøres i CI senere uten å dra inn Jest eller Vitest.

import {
  beregnTilbud,
  beregnLinje,
  FAG,
  FAGNAVN,
  enhetEntallFor,
  enhetFlertallFor,
  finnOperasjon,
  finnJobbmal,
  jobbmalerFor,
  grupperteOperasjoner,
  hentOperasjon,
} from '@/lib/priser'
import {
  maalOpp,
  mengdeFor,
  kommerFraRom,
  fagBrukerRom,
  sjekkSamsvar,
  DOR_M2,
  VINDU_M2,
  DOR_BREDDE_M,
} from '@/lib/mengde'
import { verifiserPris, tekstNevnerPrisen } from '@/lib/ai'
import { tilPdfTekst } from '@/lib/pdftekst'
import { formatKr, maanedNokkel, formatMaaned } from '@/lib/format'
import { lesTilgangsliste, harTilgang } from '@/lib/tilgang'
import { tilTall, tilTallIOmraade, lesTall, tilFeltTekst } from '@/lib/tall'
import { erEpost, lesEpost } from '@/lib/epost'
import { appUrl } from '@/lib/env'
import {
  avvikProsent,
  fordelTimer,
  fordelMaterial,
  samleErfaring,
  harForslag,
  linjerFraResultat,
  harMaterialforslag,
  treffPerMaaned,
  treffUtvikling,
  type Etterkalkyle,
  type TreffPunkt,
} from '@/lib/etterkalkyle'
import { erForfalt } from '@/lib/fakturaStatus'

let feil = 0
function sjekk(navn: string, bestatt: boolean, detalj = '') {
  console.log(`${bestatt ? 'OK  ' : 'FEIL'}  ${navn}${detalj ? '  — ' + detalj : ''}`)
  if (!bestatt) feil++
}

// 1) Margin 100 % ga tidligere pris = Infinity
const m100 = beregnTilbud('Maler', [{ operasjonId: 'maler_vegg', antall: 50 }], 750, 100)
sjekk('margin 100 % gir ingen linjer i stedet for Infinity', m100.linjer.length === 0 && Number.isFinite(m100.prisKr))

// 2) Margin over 100 % ga negativ pris
const m150 = beregnTilbud('Maler', [{ operasjonId: 'maler_vegg', antall: 50 }], 750, 150)
sjekk('margin 150 % gir ingen linjer i stedet for negativ pris', m150.linjer.length === 0)

// 3) Timepris 0 eller negativ
const tp0 = beregnLinje('Maler', { operasjonId: 'maler_vegg', antall: 50 }, 0, 25)
sjekk('timepris 0 avvises', tp0 === null)

// 4) To identiske linjer skal begge regnes med (ikke kollapse)
const duplikat = beregnTilbud('Maler', [
  { operasjonId: 'maler_vegg', antall: 20 },
  { operasjonId: 'maler_vegg', antall: 20 },
], 750, 25)
sjekk('to identiske linjer gir dobbel pris',
  duplikat.linjer.length === 2 && duplikat.prisKr === 2 * duplikat.linjer[0].prisKr,
  `${duplikat.linjer[0].prisKr} + ${duplikat.linjer[1].prisKr} = ${duplikat.prisKr} kr`)

// 5) Summen skal alltid gå opp: arbeid + materialer + margin = pris
const blandet = beregnTilbud('Maler', [
  { operasjonId: 'maler_vegg', antall: 130 },
  { operasjonId: 'maler_tak', antall: 70 },
], 750, 25)
sjekk('arbeid + materialer + margin = pris',
  blandet.arbeidKr + blandet.materialKr + blandet.marginKr === blandet.prisKr,
  `${blandet.arbeidKr} + ${blandet.materialKr} + ${blandet.marginKr} = ${blandet.prisKr}`)

// 6) Priskontroll ved lagring: riktig pris slipper gjennom
const gyldigInput = { jobbType: 'Maler', timepris: 750, marginProsent: 25, linjer: [{ operasjonId: 'maler_vegg', antall: 130 }] }
const riktig = beregnTilbud('Maler', gyldigInput.linjer, 750, 25)
sjekk('riktig pris godtas ved lagring',
  verifiserPris(gyldigInput as never, { pris: riktig.prisKr } as never) === null)

// 7) Priskontroll: manipulert pris avvises
sjekk('manipulert pris avvises ved lagring',
  verifiserPris(gyldigInput as never, { pris: 1 } as never) !== null)

// 8) Gamle tilbud uten linjer skal fortsatt kunne REDIGERES — de er fra for
//    linjemodellen og har ingenting a kontrollere prisen mot. Unntaket ligger
//    pa PATCH-ruta, ikke i funksjonen, slik at det er synlig der det gjelder.
const utenLinjer = { jobbType: 'Maler', timepris: 750, linjer: [], romstorrelseM2: 60 }
sjekk('gammelt tilbud uten linjer kan oppdateres',
  verifiserPris(utenLinjer as never, { pris: 30667 } as never, { tillatUtenLinjer: true }) === null)

// ...men et NYTT tilbud uten linjer er ikke gamle data. Det er en pris ingen
// har regnet ut, og for denne endringen slapp den rett gjennom vakten.
sjekk('nytt tilbud uten linjer avvises',
  verifiserPris(utenLinjer as never, { pris: 999999 } as never) !== null)

// 9) PDF-tekst: tankestrek overlever
sjekk('tankestrek blir bindestrek i PDF-tekst',
  tilPdfTekst('130 m² veggflate — kr 26 433,-') === '130 m² veggflate - kr 26 433,-')

// 10) PDF-tekst: ingenting utenfor Latin-1 slipper gjennom
const rart = tilPdfTekst('Kunde: 张伟 – Ørn Café… →')
sjekk('alle tegn er innenfor Latin-1 etter vask',
  [...rart].every((t) => t.charCodeAt(0) <= 0xff), rart)

// 11) materialPerEnhet var ikke vaktet, mens timerPerEnhet rett ved siden av var
//     det. En negativ materialsats ga negativ pris — og fordi serveren regnet ut
//     samme negative tall som klienten sendte, godtok verifiserPris den.
const negativtMateriale = beregnLinje(
  'Maler', { operasjonId: 'maler_vegg', antall: 50, materialPerEnhet: -5000 }, 750, 25)
sjekk('negativ materialsats avvises', negativtMateriale === null)

sjekk('materialsats NaN avvises',
  beregnLinje('Maler', { operasjonId: 'maler_vegg', antall: 50, materialPerEnhet: NaN }, 750, 25) === null)

sjekk('materialsats Infinity avvises',
  beregnLinje('Maler', { operasjonId: 'maler_vegg', antall: 50, materialPerEnhet: Infinity }, 750, 25) === null)

// En ugyldig linje skal falle ut av summen, ikke forgifte den for de andre.
const enGyldigEnIkke = beregnTilbud('Maler', [
  { operasjonId: 'maler_vegg', antall: 50 },
  { operasjonId: 'maler_vegg', antall: 50, materialPerEnhet: NaN },
], 750, 25)
sjekk('ugyldig linje faller ut, summen forblir et tall',
  enGyldigEnIkke.linjer.length === 1 && Number.isFinite(enGyldigEnIkke.prisKr),
  `prisKr = ${enGyldigEnIkke.prisKr}`)

// 12) `antall > 0` var sant også for Infinity: pris ble Infinity og
//     prisPerEnhet ble NaN (Infinity delt på Infinity).
sjekk('antall = Infinity avvises',
  beregnLinje('Maler', { operasjonId: 'maler_vegg', antall: Infinity }, 750, 25) === null)

// Den negative satsen skal også stoppes ved lagring, ikke bare i utregningen.
const negativInput = {
  jobbType: 'Maler', timepris: 750, marginProsent: 25,
  linjer: [{ operasjonId: 'maler_vegg', antall: 50, materialPerEnhet: -5000 }],
}
sjekk('negativ materialsats avvises også ved lagring',
  verifiserPris(negativInput as never, { pris: -325833 } as never) !== null)

// 13) «,-» betyr «og null øre», så den hører bare hjemme på runde beløp. Da
//     ørevisningen ble innført ble suffikset stående på begge grener, og
//     mva-beløpet på kundefakturaen sto som «kr 12 033,25,-».
//     Testene sjekker oppfoerselen, ikke eksakte strenger: nb-NO bruker hardt
//     mellomrom (U+00A0) som tusenskille, og en test som hardkoder vanlig
//     mellomrom feiler pa riktig kode.
sjekk('runde belop beholder ,-', formatKr(1500).endsWith(',-'), formatKr(1500))
sjekk('belop med ore far IKKE ,-', !formatKr(12033.25).endsWith(',-'), formatKr(12033.25))
sjekk('belop med ore viser to desimaler', /,\d{2}$/.test(formatKr(999.5)), formatKr(999.5))
sjekk('null kroner er et rundt belop', formatKr(0).endsWith(',-'), formatKr(0))
sjekk('runde belop har ingen desimaler', !/,\d{2}/.test(formatKr(48133)), formatKr(48133))

// 14) Vakten som sjekker at AI-teksten gjengir prisen sammenlignet mot
//     toLocaleString('nb-NO'), som bruker HARDT mellomrom (U+00A0). En AI
//     skriver vanlig mellomrom eller punktum, saa vakten var usann for enhver
//     pris over 1000 — AI-teksten ble alltid forkastet til fordel for malen.
sjekk('AI-pris med vanlig mellomrom godtas', tekstNevnerPrisen('Samlet fastpris: kr 10 167,-', 10167))
sjekk('AI-pris med hardt mellomrom godtas', tekstNevnerPrisen('Samlet: 10 167', 10167))
sjekk('AI-pris med punktum godtas', tekstNevnerPrisen('Totalt kr 10.167,-', 10167))
sjekk('AI-pris uten skilletegn godtas', tekstNevnerPrisen('Prisen er 10167 kroner.', 10167))
sjekk('feil pris i AI-teksten avvises', !tekstNevnerPrisen('Samlet fastpris: kr 20 167,-', 10167))
sjekk('tekst uten pris avvises', !tekstNevnerPrisen('Vi sender tilbud snarest.', 10167))

// 15) Tilgangslista. Den avgjør hvem som kan lage konto og sende fakturaer fra
//     vårt verifiserte avsenderdomene, så feil her er ikke kosmetiske: for
//     streng låser ute eieren, for slapp åpner for hvem som helst.
const apen = lesTilgangsliste(undefined)
sjekk('uten ALLOWED_EMAILS slipper alle inn', apen.modus === 'apen' && harTilgang('hvemsomhelst@ukjent.no', apen))

const liste = lesTilgangsliste('Even@Firma.no, @tilbudsmaskinen.no')
sjekk('adresse på lista slipper inn', harTilgang('even@firma.no', liste))
sjekk('adresse utenfor lista avvises', !harTilgang('fremmed@annet.no', liste))
sjekk('lista er ufølsom for store bokstaver', harTilgang('  EVEN@FIRMA.NO  ', liste))
sjekk('@domene slipper inn hele domenet', harTilgang('kollega@tilbudsmaskinen.no', liste))
sjekk('domeneregel treffer ikke et domene som bare slutter likt',
  !harTilgang('angriper@ikke-tilbudsmaskinen.no', liste))
sjekk('tom e-post avvises', !harTilgang('', liste) && !harTilgang(undefined, liste))

// En skrivefeil i hele variabelen ga tom liste, og tom liste betyr «ikke
// konfigurert» — altså åpen dør, stille. Den skal stenge i stedet.
const skrivefeil = lesTilgangsliste('firma.no')
sjekk('ALLOWED_EMAILS med bare ugyldige oppføringer stenger i stedet for å åpne',
  skrivefeil.modus === 'stengt' && !harTilgang('even@firma.no', skrivefeil))
sjekk('«@no» er ikke en gyldig domeneregel', lesTilgangsliste('@no').modus === 'stengt')

// 16) Etterkalkyle. Denne kjeden ender i et FORSLAG om å endre satsen
//     håndverkeren regner alle framtidige tilbud fra. Et tall som er litt feil
//     her, blir feil i hver eneste jobb etterpå.
const reg = (timer: number, linjer: [string, number, number][]): Etterkalkyle => ({
  tilbudId: 'x',
  faktiskeTimer: timer,
  linjer: linjer.map(([operasjonId, antall, estimertTimer]) => ({ operasjonId, antall, estimertTimer })),
  registrert: '2026-08-17T00:00:00Z',
})

sjekk('avvik regnes mot estimatet', avvikProsent(12, 10) === 20)
sjekk('kortere tid gir negativt avvik', avvikProsent(8, 10) === -20)
sjekk('estimat på null timer gir ingen prosent i stedet for Infinity', avvikProsent(8, 0) === null)

// Fordelingen må gi tilbake nøyaktig de timene som ble ført. Gjør den ikke det,
// lekker eller oppfinner den arbeidstid inn i satsgrunnlaget.
const fordelt = fordelTimer(20, [
  { operasjonId: 'maler_vegg', antall: 100, estimertTimer: 15 },
  { operasjonId: 'maler_tak', antall: 20, estimertTimer: 5 },
])
sjekk('fordelte timer summerer seg til de faktiske',
  Math.abs(fordelt.reduce((sum, l) => sum + l.faktiskTimer, 0) - 20) < 1e-9,
  fordelt.map((l) => l.faktiskTimer.toFixed(2)).join(' + '))
sjekk('fordelingen følger estimatets forhold, ikke antall enheter',
  Math.abs(fordelt[0].faktiskTimer - 15) < 1e-9 && Math.abs(fordelt[1].faktiskTimer - 5) < 1e-9)

// Gamle tilbud uten linjer skal kunne registreres, men ikke lære opp en sats.
sjekk('registrering uten linjer gir ingen fordeling', fordelTimer(20, []).length === 0)
sjekk('null faktiske timer gir ingen fordeling',
  fordelTimer(0, [{ operasjonId: 'maler_vegg', antall: 10, estimertTimer: 2 }]).length === 0)

// Estimatoren er sum(timer)/sum(antall), ikke snittet av jobbenes satser. En
// jobb på 200 m² sier mer om produktiviteten enn en på 5 m².
const erfaringer = samleErfaring([
  reg(20, [['maler_vegg', 100, 15]]),
  reg(2, [['maler_vegg', 5, 0.75]]),
])
const vegg = erfaringer.find((e) => e.operasjonId === 'maler_vegg')!
sjekk('erfaring vektes etter størrelse, ikke antall jobber',
  Math.abs(vegg.observertTimerPerEnhet - 22 / 105) < 0.001,
  `${vegg.observertTimerPerEnhet} t/enhet av ${vegg.sumFaktiskTimer} t på ${vegg.sumAntall} enheter`)
sjekk('erfaring teller jobbene og hvor mange som var rene', vegg.jobber === 2 && vegg.reneJobber === 2)

// Terskelen: to jobber er tilfeldigheter, tre er et mønster. Og et avvik under
// 10 % er mindre enn støyen i hvordan folk fører timer.
const toJobber = samleErfaring([reg(20, [['maler_vegg', 100, 15]]), reg(20, [['maler_vegg', 100, 15]])])
sjekk('ingen forslag etter to jobber', !harForslag(toJobber[0]))

const treJobber = samleErfaring([
  reg(20, [['maler_vegg', 100, 15]]),
  reg(20, [['maler_vegg', 100, 15]]),
  reg(20, [['maler_vegg', 100, 15]]),
])
sjekk('forslag etter tre jobber med stort avvik', harForslag(treJobber[0]),
  `${treJobber[0].observertTimerPerEnhet} t/enhet, ${treJobber[0].avvikProsent} % avvik`)

const smaaAvvik = samleErfaring([
  reg(15.3, [['maler_vegg', 100, 15]]),
  reg(15.3, [['maler_vegg', 100, 15]]),
  reg(15.3, [['maler_vegg', 100, 15]]),
])
sjekk('ingen forslag når avviket er under ti prosent', !harForslag(smaaAvvik[0]),
  `${smaaAvvik[0].avvikProsent} % avvik`)

// Brukerens egen sats er utgangspunktet for avviket, ikke standarden i koden.
const medEgenSats = samleErfaring([reg(20, [['maler_vegg', 100, 15]])], { maler_vegg: { timerPerEnhet: 0.2 } })
sjekk('avviket måles mot brukerens egen sats når han har en',
  medEgenSats[0].gjeldendeTimerPerEnhet === 0.2 && medEgenSats[0].avvikProsent === 0)

// En operasjon som er fjernet fra prisboka har ingen sats å foreslå noe for.
sjekk('ukjent operasjon hopper ut av oversikten i stedet for å krasje',
  samleErfaring([reg(10, [['finnes_ikke', 10, 5]])]).length === 0)

// Nevneren i fordelingen må regnes av de samme linjene som faktisk får timer.
// Ellers tar en linje som faller ut (antall 0) med seg sin andel av nevneren,
// timene forsvinner, og satsforslaget blir for lavt — altså et forslag om at
// jobben går raskere enn den gjør.
const medDodLinje = fordelTimer(20, [
  { operasjonId: 'maler_vegg', antall: 100, estimertTimer: 15 },
  { operasjonId: 'maler_tak', antall: 0, estimertTimer: 5 },
])
sjekk('en linje uten antall stjeler ikke timer fra de andre',
  medDodLinje.length === 1 && Math.abs(medDodLinje[0].faktiskTimer - 20) < 1e-9,
  `${medDodLinje[0]?.faktiskTimer} av 20 timer fordelt`)

// Et tilbud kan ha flere linjer med SAMME operasjon — «+ Legg til linje» gir
// samme operasjon som standard, og tre rom med samme veggmaling er helt
// vanlig utfylling. Da opptellingen gikk per linje, passerte ÉN slik jobb
// terskelen på tre jobber helt alene, og appen foreslo ny sats på grunnlag
// av en enkelt jobb — nøyaktig det terskelen finnes for å hindre.
const treLinjer = samleErfaring([reg(30, [['maler_vegg', 30, 5], ['maler_vegg', 30, 5], ['maler_vegg', 30, 5]])])
sjekk('tre linjer med samme operasjon er én jobb, ikke tre',
  treLinjer[0].jobber === 1 && !harForslag(treLinjer[0]),
  `${treLinjer[0].jobber} jobb(er) talt`)

// Samme jobb og samme timer, bare ført på ulikt antall linjer. Hvordan den
// skrives inn skal ikke endre hva prisboka lærer av den.
const somEnLinje = samleErfaring([reg(30, [['maler_vegg', 90, 15]])])
sjekk('hvordan jobben føres inn endrer ikke hva den lærer bort',
  treLinjer[0].jobber === somEnLinje[0].jobber &&
    treLinjer[0].reneJobber === somEnLinje[0].reneJobber &&
    treLinjer[0].observertTimerPerEnhet === somEnLinje[0].observertTimerPerEnhet)

// 17) Materialavviket. Materialer fordeles etter ESTIMERT MATERIALKOST, ikke
//     etter timer: maling og parkett koster ikke i forhold til hvor lenge man
//     holder pa med dem. Fordeles de etter tid, far en arbeidsintensiv og
//     materialfattig operasjon skylda for materialer den aldri brukte.
const toLinjer = [
  { operasjonId: 'maler_vegg', antall: 100, estimertTimer: 15, estimertMaterialKr: 4000 },
  { operasjonId: 'maler_tak', antall: 20, estimertTimer: 5, estimertMaterialKr: 900 },
]
const fordeltKr = fordelMaterial(4900, toLinjer)
sjekk('materialer fordeles etter materialkost, ikke etter timer',
  Math.abs(fordeltKr[0].faktiskMaterialKr - 4000) < 1e-9 && Math.abs(fordeltKr[1].faktiskMaterialKr - 900) < 1e-9,
  fordeltKr.map((l) => Math.round(l.faktiskMaterialKr)).join(' + '))
sjekk('fordelte kroner summerer seg til det som faktisk ble brukt',
  Math.abs(fordeltKr.reduce((sum, l) => sum + l.faktiskMaterialKr, 0) - 4900) < 1e-9)

// Et gammelt oyeblikksbilde uten materialgrunnlag kan ikke laere opp en
// materialsats. Det skal gi tom fordeling, ikke deling paa null.
sjekk('oyeblikksbilde uten materialgrunnlag gir ingen materialfordeling',
  fordelMaterial(5000, [{ operasjonId: 'maler_vegg', antall: 100, estimertTimer: 15 }]).length === 0)

const medMaterial = (kr: number | undefined): Etterkalkyle => ({
  tilbudId: 'x',
  faktiskeTimer: 15,
  faktiskMaterialKr: kr,
  linjer: [{ operasjonId: 'maler_vegg', antall: 100, estimertTimer: 15, estimertMaterialKr: 4000 }],
  registrert: '2026-08-18T00:00:00Z',
})

// Feltet er valgfritt, saa timer og materialer telles hver for seg. Blandes de,
// deles kronene paa kvadratmeter ingen har fort kostnad for.
const blandetMaterial = samleErfaring([medMaterial(6000), medMaterial(6000), medMaterial(undefined)])
sjekk('jobber uten fort materialkost teller ikke i materialgrunnlaget',
  blandetMaterial[0].jobber === 3 && blandetMaterial[0].material?.jobber === 2,
  `${blandetMaterial[0].jobber} jobber med timer, ${blandetMaterial[0].material?.jobber} med materialer`)
sjekk('materialsatsen regnes av enhetene som faktisk har kostnad',
  blandetMaterial[0].material?.observertPerEnhet === 60,
  `${blandetMaterial[0].material?.observertPerEnhet} kr per enhet mot standard 40`)
sjekk('to jobber gir ikke materialforslag', !harMaterialforslag(blandetMaterial[0]))

const treMedMaterial = samleErfaring([medMaterial(6000), medMaterial(6000), medMaterial(6000)])
sjekk('tre jobber med stort materialavvik gir forslag', harMaterialforslag(treMedMaterial[0]),
  `+${treMedMaterial[0].material?.avvikProsent} %`)

// Uten fort materialkost skal materialdelen vaere helt fravaerende, ikke null.
const utenMaterial = samleErfaring([medMaterial(undefined)])
sjekk('ingen fort materialkost gir ingen materialdel', utenMaterial[0].material === undefined)

// En linje kan ha material uten timer: brukeren setter timesatsen til 0 og
// tar bare betalt for materialet. Oyeblikksbildet i linjerFraResultat kastet
// slike linjer, fordi filteret krevde timer > 0 fra den gang bildet bare
// tjente timefordelingen. Da ble materialet deres fordelt paa de andre
// linjene — i et reelt tilfelle havnet 5000 av 5200 kr paa feil operasjon.
const utenTimer = [
  { operasjonId: 'maler_vegg', antall: 100, estimertTimer: 0, estimertMaterialKr: 5000 },
  { operasjonId: 'maler_tak', antall: 10, estimertTimer: 1.5, estimertMaterialKr: 200 },
]
const matUtenTimer = fordelMaterial(5200, utenTimer)
sjekk('en linje uten timer far likevel sin del av materialet',
  matUtenTimer.length === 2 &&
    Math.abs((matUtenTimer.find((f) => f.operasjonId === 'maler_vegg')?.faktiskMaterialKr ?? 0) - 5000) < 1e-9,
  `${matUtenTimer.length} linjer fikk material`)

// Samme linje skal fortsatt holdes utenfor TIDsfordelingen — null timer er
// null timer, og en andel dit ville stjaalet tid fra linja som faktisk
// brukte den.
const tidUtenTimer = fordelTimer(2, utenTimer)
sjekk('men den stjeler ikke timer fra linja som faktisk brukte dem',
  tidUtenTimer.length === 1 && tidUtenTimer[0].operasjonId === 'maler_tak')

// En operasjon kan ha material uten timer — brukeren setter timesatsen til 0
// og tar bare betalt for materialet. Oversikten ble bygget av timefordelingen
// alene, saa den operasjonen forsvant i stillhet med hele materialkostnaden
// sin. I et reelt tilfelle sto den for 5000 av 5200 kr estimert material.
const kunMaterial = [1, 2, 3].map((n) => ({
  tilbudId: 't' + n,
  faktiskeTimer: 2,
  faktiskMaterialKr: 6000,
  linjer: [
    { operasjonId: 'maler_vegg', antall: 100, estimertTimer: 0, estimertMaterialKr: 5000 },
    { operasjonId: 'maler_tak', antall: 10, estimertTimer: 1.5, estimertMaterialKr: 200 },
  ],
  registrert: '2026-08-20',
}))
const erfaringMedMaterial = samleErfaring(kunMaterial)
const veggUtenTimer = erfaringMedMaterial.find((e) => e.operasjonId === 'maler_vegg')
sjekk('operasjon med material men uten timer havner likevel i oversikten',
  !!veggUtenTimer && !!veggUtenTimer.material && veggUtenTimer.material.jobber === 3,
  veggUtenTimer ? `${veggUtenTimer.material?.sumFaktiskKr} kr fanget` : 'borte'
)

// ...men uten timer finnes det ikke grunnlag for et TIMEforslag. Ellers ville
// fiksen over byttet en tapt operasjon mot en oppdiktet sats.
sjekk('men den gir ikke satsforslag paa timer den ikke har',
  !!veggUtenTimer && veggUtenTimer.jobber === 0 && veggUtenTimer.avvikProsent === 0 && !harForslag(veggUtenTimer))

// linjerFraResultat laa tidligere i etterkalkyleLager, som drar inn lib/supabase
// og dermed krevde env-variabler for aa kjoere. Den er ren regning og bor naa i
// lib/etterkalkyle, slik at filteret kan ettergaas her — og siden bruker samme
// funksjon i stedet for en haandkopi som drev fra originalen.
const medKunMaterial = beregnTilbud('Maler', [
  { operasjonId: 'maler_vegg', antall: 100, timerPerEnhet: 0, materialPerEnhet: 50 },
  { operasjonId: 'maler_tak', antall: 10, timerPerEnhet: 0.15, materialPerEnhet: 20 },
], 800, 20)
const bilde = linjerFraResultat(medKunMaterial)
sjekk('oyeblikksbildet beholder en linje som bare har material',
  bilde.length === 2 &&
    bilde.some((l) => l.operasjonId === 'maler_vegg' && l.estimertTimer === 0 && (l.estimertMaterialKr ?? 0) > 0),
  `${bilde.length} av 2 linjer beholdt`)

// ...men en linje uten bade timer og material har ingenting aa laere bort.
const tomLinje = beregnTilbud('Maler', [
  { operasjonId: 'maler_vegg', antall: 100, timerPerEnhet: 0, materialPerEnhet: 0 },
], 800, 20)
sjekk('men en linje uten bade timer og material faller ut',
  linjerFraResultat(tomLinje).length === 0)

// 16) Tallesing. Skjemaene brukte type="number", der NETTLESERENS spraak
//     avgjorde om «7,5» var gyldig. Med engelsk nettleser ble feltet tomt idet
//     brukeren skrev komma — han sa tallet sitt sta der, mens React hadde tom
//     streng og lagre-knappen var deaktivert uten et ord om hvorfor.
sjekk('komma leses som desimalskille', tilTall('7,5') === 7.5)
sjekk('punktum leses ogsaa', tilTall('7.5') === 7.5)
sjekk('tomt felt er ikke et tall', tilTall('') === null && tilTall('   ') === null)
sjekk('tekst er ikke et tall', tilTall('sju') === null)
sjekk('null er et gyldig tall, ikke tomt', tilTall('0') === 0)

// Et tall kopiert ut av appen skal kunne limes rett inn igjen. nb-NO skiller
// tusener med HARDT mellomrom (U+00A0) — samme tegn som ga bug 1 i punkt 32.
sjekk('tall med hardt mellomrom fra appen limes inn igjen',
  tilTall((48133).toLocaleString('nb-NO')) === 48133,
  JSON.stringify((48133).toLocaleString('nb-NO')))
sjekk('vanlig mellomrom som tusenskille godtas', tilTall('10 000') === 10000)
sjekk('norsk formatering med bade punktum og komma', tilTall('1.234,5') === 1234.5)

// To komma gjor tallet tvetydig — «1,234» kan vaere bade 1234 og 1,234. Da skal
// det avvises i stedet for at vi gjetter.
sjekk('tvetydig tall med to komma avvises', tilTall('1,234,5') === null)

sjekk('omraade avviser under minimum', tilTallIOmraade('0', 1, 365) === null)
sjekk('omraade slipper gjennom innenfor', tilTallIOmraade('30', 1, 365) === 30)

// Serveren maa tale komma av samme grunn: klienten sender videre det brukeren
// skrev.
sjekk('serveren godtar komma', lesTall('7,5', 100) === 7.5)
sjekk('serveren avviser negative tall', lesTall('-1', 100) === 'ugyldig')
sjekk('serveren avviser over taket', lesTall('101', 100) === 'ugyldig')
sjekk('serveren skiller tomt fra tull', lesTall('', 100) === null && lesTall('sju', 100) === 'ugyldig')
sjekk('serveren avviser noe som ikke er tall eller tekst', lesTall(true, 100) === 'ugyldig')

// tilFeltTekst er motstykket til tilTall: den setter et tall INN i feltet.
// Uten den taster brukeren «7,5», lagrer, apner igjen og ser «7.5» — fordi
// String(7.5) gir punktum. Rundturen ma vaere tapsfri, ellers sprer feilen seg
// til «endret»-sammenligningen paa Mine satser, som ville trodd at hvert felt
// var endret hele tiden.
sjekk('tall settes inn i feltet med komma', tilFeltTekst(7.5) === '7,5')
sjekk('heltall far ikke komma', tilFeltTekst(25) === '25')
const rundtur = [0, 0.025, 0.15, 7.5, 25, 812.5, 1234.75, 100000]
sjekk('rundturen tall -> felt -> tall er tapsfri',
  rundtur.every((n) => tilTall(tilFeltTekst(n)) === n),
  rundtur.map((n) => tilFeltTekst(n)).join(' '))

// 17) E-postvalidering. Kundens adresse ble aldri sjekket: «ola@firma» uten
//     toppdomene ble lagret uten innvending og feilet forst naar fakturaen
//     skulle sendes — etter at betalingen var registrert, der feilen svelges
//     med vilje. Med vilje romslig: avviser den en gyldig adresse med plusstegn
//     eller underdomene, har vi laget et verre problem enn det vi loste.
sjekk('vanlig adresse godtas', erEpost('ola@firma.no'))
sjekk('plusstegn og underdomene godtas',
  erEpost('ola+faktura@post.firma.no'))
sjekk('adresse uten toppdomene avvises', !erEpost('ola@firma'))
sjekk('adresse uten krollalfa avvises', !erEpost('ola.firma.no'))
sjekk('mellomrom avvises', !erEpost('ola @firma.no'))

// Tomt felt betyr «ikke oppgitt», ikke «ugyldig» — adressen er valgfri.
sjekk('tomt felt skiller seg fra ugyldig',
  lesEpost('') === null && lesEpost(undefined) === null && lesEpost('ola@firma') === 'ugyldig')

// 18) appUrl() bygger betalingslenken i faktura-PDF og e-post. Kallerne setter
//     selv paa stien, saa en APP_URL som slutter paa skraastrek ga doble
//     skraastreker i hver eneste lenke kunden fikk.
process.env.APP_URL = 'https://eksempel.no/'
sjekk('skraastrek til slutt fjernes fra appUrl', appUrl() === 'https://eksempel.no')
process.env.APP_URL = 'https://eksempel.no'
sjekk('adresse uten skraastrek er urort', appUrl() === 'https://eksempel.no')
delete process.env.APP_URL

// 19) Enhetsordene. ENHETSTEKST er ETT ord per enhet, og «stk» gjorde fire
//     uforenlige jobber: en bil, ett bad, ett sikringsskap, ett toalett. Ordet
//     folger med helt ut i tilbudet kunden leser, saa en bilpleier sendte
//     «Polering — 3 stk». Na kommer ordet fra operasjonen, i entall og
//     flertall, fordi bade «per bil» og «3 biler» skal leses riktig.
const bad = FAG['Rørlegger'].operasjoner.find((o) => o.id === 'ror_bad')!
sjekk('rørleggeren teller bad, ikke stk', enhetFlertallFor(bad) === 'bad')

// «3 timer» er riktig, «1 067 kr per timer» er det ikke.
const timer = FAG.Annet.operasjoner.find((o) => o.id === 'annet_timer')!
sjekk('timearbeid boyes riktig',
  enhetFlertallFor(timer) === 'timer' && enhetEntallFor(timer) === 'time')

// Fagene som allerede leste riktig skal vaere uendret.
const veggOperasjon = FAG.Maler.operasjoner.find((o) => o.id === 'maler_vegg')!
sjekk('maleren er urort',
  enhetEntallFor(veggOperasjon) === 'm² veggflate' && enhetFlertallFor(veggOperasjon) === 'm² veggflate')

// 20) Maanedsbotta bak treffsikkerheten. Regnes den av UTC i stedet for lokal
//     tid, havner et tilbud lagret 31. august kl. 23:30 norsk tid i september —
//     med en dato «31.08.2026» skrevet ved siden av seg i samme rad.
const sentIAugust = new Date(2026, 7, 31, 23, 30)
sjekk('maanedsnokkel foelger lokal tid', maanedNokkel(sentIAugust) === '2026-08')
sjekk('samme maaned naar tidsstempelet gaar via ISO/UTC',
  maanedNokkel(sentIAugust.toISOString()) === '2026-08',
  sentIAugust.toISOString())
sjekk('ugyldig dato gir ingen maaned', maanedNokkel('tull') === null)

const augustEtikett = formatMaaned('2026-08')
sjekk('maaneden skrives med norsk navn',
  augustEtikett !== '2026-08' && augustEtikett.includes('2026'), augustEtikett)
sjekk('ubrukelig noekkel vises som den er', formatMaaned('tull') === 'tull')

// 21) Forfall er en DATO, ikke et tidspunkt. En faktura som forfaller i dag er
//     ikke forfalt for dagen er omme — og `new Date('2026-08-20')` tolkes som
//     midnatt UTC, som i en tidssone bak UTC lander kvelden for.
const forfallIDag = { status: 'pending' as const, due_date: '2026-08-20' }
sjekk('forfall i dag er ikke forfalt', !erForfalt(forfallIDag, new Date(2026, 7, 20, 23, 59)))
sjekk('forfall i gaar er forfalt', erForfalt(forfallIDag, new Date(2026, 7, 21, 0, 1)))
sjekk('betalt faktura er aldri forfalt',
  !erForfalt({ status: 'paid', due_date: '2020-01-01' }, new Date(2026, 7, 21)))
sjekk('faktura uten forfallsdato er ikke forfalt',
  !erForfalt({ status: 'pending', due_date: null }, new Date(2026, 7, 21)))

// 22) Treffsikkerhet per maaned. Den ene jobben som gikk helt galt (+400 %) skal
//     IKKE svelge en maaned med to gode estimater — derfor median og ikke snitt.
const treff: TreffPunkt[] = [
  { dato: new Date(2026, 5, 10).toISOString(), estimerteTimer: 10, faktiskeTimer: 11 },
  { dato: new Date(2026, 5, 20).toISOString(), estimerteTimer: 10, faktiskeTimer: 12 },
  { dato: new Date(2026, 5, 25).toISOString(), estimerteTimer: 10, faktiskeTimer: 50 },
  { dato: new Date(2026, 7, 3).toISOString(), estimerteTimer: 10, faktiskeTimer: 10 },
]
const treffMaaneder = treffPerMaaned(treff)
sjekk('en rad per maaned, eldste forst',
  treffMaaneder.length === 2 &&
    treffMaaneder[0].maaned === '2026-06' &&
    treffMaaneder[1].maaned === '2026-08',
  treffMaaneder.map((m) => m.maaned).join(', '))
sjekk('typisk bom er medianen, ikke snittet',
  treffMaaneder[0].typiskBom === 20, `${treffMaaneder[0].typiskBom} % (snittet ville vaert 143 %)`)
sjekk('snittavviket beholder fortegnet',
  treffMaaneder[0].snittAvvik === 143, `${treffMaaneder[0].snittAvvik} %`)
sjekk('timene summeres per maaned',
  treffMaaneder[0].sumEstimerteTimer === 30 && treffMaaneder[0].sumFaktiskeTimer === 73,
  `${treffMaaneder[0].sumFaktiskeTimer} t mot ${treffMaaneder[0].sumEstimerteTimer} t`)

// 23) «Du har blitt bedre» skal ikke sies pa to jobber. Samme terskel som for
//     satsforslag, og av samme grunn: en app som roper seier pa tilfeldigheter
//     blir ikke trodd den dagen den har rett.
sjekk('for fa jobber gir ingen utvikling', treffUtvikling(treff, 1) === null)
sjekk('en enkelt maaned gir ingen utvikling',
  treffUtvikling(treff.slice(0, 3), 1) === null)

const overTid: TreffPunkt[] = [
  ...[0, 1, 2].map((i) => ({
    dato: new Date(2026, 5, 5 + i).toISOString(),
    estimerteTimer: 10,
    faktiskeTimer: 13,
  })),
  ...[0, 1, 2].map((i) => ({
    dato: new Date(2026, 7, 5 + i).toISOString(),
    estimerteTimer: 10,
    faktiskeTimer: 11,
  })),
]
// Vinduet er aldri mer enn halvparten av det som finnes. Et fast treminedersvindu
// ville krevd fire maaneders historikk for appen turte a si noe — og appen er
// yngre enn det. To maaneder skal gi en mot en, uten at kalleren ber om det.
sjekk('vinduet tilpasser seg to maaneder uten at kalleren sier fra',
  treffUtvikling(overTid) !== null)

const utvikling = treffUtvikling(overTid, 1)
sjekk('forbedringen regnes i prosentpoeng av bommen',
  utvikling !== null &&
    utvikling.eldreBom === 30 &&
    utvikling.nyereBom === 10 &&
    utvikling.forbedring === 20,
  utvikling ? `${utvikling.eldreBom} % -> ${utvikling.nyereBom} %` : 'ingen utvikling')

// 24) Rommet. Malingens, gulvleggerens og flisleggerens tall kommer alle fra
//     DE SAMME tre maalene. Med en regner per linje matte 4,2 x 3,1 x 2,4 tastes
//     inn pa nytt for hver operasjon - og da kan de drive fra hverandre.
const ettRom = maalOpp([{ lengde: 4, bredde: 3, hoyde: 2.4 }])!
sjekk('gulvet er lengde x bredde', ettRom.gulvM2 === 12)

// Dette er hele poenget: taket ER gulvet. To ulike tall for samme rom er et
// tilbud som ikke gaar opp, og kunden ser det for handverkeren gjor det.
sjekk('taket er like stort som gulvet', ettRom.takM2 === ettRom.gulvM2, `${ettRom.takM2} = ${ettRom.gulvM2} m2`)
sjekk('veggen er omkrets x hoyde', ettRom.veggM2 === 33.6, `${ettRom.veggM2} m2`)
sjekk('listverket er omkretsen', ettRom.listverkLm === 14, `${ettRom.listverkLm} lm`)

// Doerer og vinduer trekkes fra veggen, doeraapninger fra listverket.
const medApninger = maalOpp([{ lengde: 4, bredde: 3, hoyde: 2.4, dorer: 1, vinduer: 2 }])!
sjekk('doerer og vinduer trekkes fra veggflaten',
  medApninger.veggM2 === Math.round((33.6 - DOR_M2 - 2 * VINDU_M2) * 10) / 10,
  `${medApninger.veggM2} m2`)
sjekk('doeraapninger trekkes fra listverket',
  medApninger.listverkLm === Math.round((14 - DOR_BREDDE_M) * 10) / 10,
  `${medApninger.listverkLm} lm`)
sjekk('aapninger rorer ikke gulvet', medApninger.gulvM2 === 12)

// Flere rom summeres. En maler priser sjelden ett rom om gangen.
const leilighet = maalOpp([
  { navn: 'Stue', lengde: 5, bredde: 4, hoyde: 2.4 },
  { navn: 'Sov', lengde: 3, bredde: 3, hoyde: 2.4 },
])!
sjekk('flere rom summeres', leilighet.rom === 2 && leilighet.gulvM2 === 29, `${leilighet.gulvM2} m2`)
sjekk('taket folger gulvet ogsa over flere rom', leilighet.takM2 === leilighet.gulvM2)

// Et rom uten maal er en tom rad i skjemaet, ikke et rom pa null kvadratmeter.
sjekk('tomme rader teller ikke', maalOpp([{}, {}]) === null)
sjekk('rom uten bredde teller ikke', maalOpp([{ lengde: 4 }]) === null)

// Et rom uten takhoyde teller pa gulv og listverk, men IKKE pa vegg - og det
// skal telles opp, ikke skjules. En for liten veggflate er et for billig
// tilbud, og den feilen oppdages forst nar jobben er gjort.
const utenHoyde = maalOpp([
  { lengde: 4, bredde: 3, hoyde: 2.4 },
  { lengde: 3, bredde: 3 },
])!
sjekk('rom uten takhoyde teller pa gulv', utenHoyde.gulvM2 === 21)
sjekk('rom uten takhoyde teller IKKE pa vegg', utenHoyde.veggM2 === 33.6, `${utenHoyde.veggM2} m2`)
sjekk('rom uten takhoyde blir talt opp', utenHoyde.romUtenHoyde === 1)

// Ti doerer i et lite bod spiser hele veggen. Svaret er null, ikke et negativt
// areal som trekker ned de andre rommene.
const bod = maalOpp([{ lengde: 1, bredde: 1, hoyde: 2, dorer: 10 }])!
sjekk('fradrag storre enn veggen gir null, ikke negativt', bod.veggM2 === 0 && bod.listverkLm === 0)

// 25) Enheten avgjor hvilket av de fire tallene linja far.
sjekk('m2_gulv henter gulvet', mengdeFor('m2_gulv', ettRom) === 12)
sjekk('m2_tak henter taket', mengdeFor('m2_tak', ettRom) === 12)
sjekk('m2_vegg henter veggen', mengdeFor('m2_vegg', ettRom) === 33.6)
sjekk('lopemeter henter listverket', mengdeFor('lopemeter', ettRom) === 14)

// m2_flate er den eneste tvetydige: flis ligger bade pa gulv og vegg.
sjekk('flate folger valget', mengdeFor('m2_flate', ettRom, 'vegg') === 33.6 && mengdeFor('m2_flate', ettRom, 'gulv') === 12)

// Et sikringsskap telles; det finnes ikke i kvadratmeter. Et tall herfra ville
// vaert oppspinn.
sjekk('punkt og stk kommer ikke fra rommet',
  mengdeFor('punkt', ettRom) === null && mengdeFor('stk', ettRom) === null && mengdeFor('time', ettRom) === null)
sjekk('kommerFraRom er enig med mengdeFor',
  kommerFraRom('m2_vegg') && kommerFraRom('lopemeter') && !kommerFraRom('punkt') && !kommerFraRom('stk'))

// Elektrikeren og rorleggeren skal ikke se maalefeltene i det hele tatt.
sjekk('maleren maaler', fagBrukerRom(FAG.Maler.operasjoner.map((o) => o.enhet)))
sjekk('gulvleggeren maaler', fagBrukerRom(FAG.Snekker.operasjoner.map((o) => o.enhet)))
sjekk('flisleggeren maaler', fagBrukerRom(FAG.Murer.operasjoner.map((o) => o.enhet)))
sjekk('elektrikeren teller, han maaler ikke', !fagBrukerRom(FAG.Elektriker.operasjoner.map((o) => o.enhet)))
sjekk('rorleggeren teller, han maaler ikke', !fagBrukerRom(FAG['Rørlegger'].operasjoner.map((o) => o.enhet)))

// 26) Samsvarssjekken. Gjelder kun handskrevne tall - kommer begge fra rommet,
//     ER de like, og et varsel ville vaert stoy.
sjekk('gulv og tak som spriker gir varsel', sjekkSamsvar(20, 26) !== null)
sjekk('ti prosent slingring godtas', sjekkSamsvar(20, 21) === null)
sjekk('like tall gir ingen varsel', sjekkSamsvar(20, 20) === null)
sjekk('mangler den ene, er det ingenting a sammenligne',
  sjekkSamsvar(20, null) === null && sjekkSamsvar(null, 20) === null)

// 27) Bilpleie er fjernet. Faget passet ikke modellen: alt her hviler pa et
//     malbart omfang, og en bil har ikke det.
sjekk('bilpleie finnes ikke lenger', FAG.Bilpleie === undefined && !FAGNAVN.includes('Bilpleie'))
sjekk('ingen bil-operasjon henger igjen',
  ['bil_polering', 'bil_innvendig', 'bil_vask'].every((id) => finnOperasjon(id) === undefined))

// Fagene som star igjen deler en egenskap: handverkeren maaler eller teller noe
// fast. Ingen av dem skal ha mistet operasjoner i ryddingen.
const GAMLE_IDER = [
  'maler_vegg', 'maler_tak', 'maler_sparkling',
  'snekker_parkett', 'snekker_massivtre', 'snekker_vinyl', 'snekker_lister',
  'murer_flis', 'murer_membran',
  'el_punkt', 'el_sikringsskap',
  'ror_bad', 'ror_wc', 'ror_servant',
  'annet_timer',
]
const forsvunnet = GAMLE_IDER.filter((id) => finnOperasjon(id) === undefined)
sjekk('alle gjenvaerende operasjons-id-er er urort',
  forsvunnet.length === 0, forsvunnet.length ? forsvunnet.join(', ') : 'ingen mistet')

// 28) Satser uten markedstall MAA vaere merket `anslag`. Uten merket faar
//     brukeren ingen advarsel, og et tall noen har funnet pa ser da ut som et
//     tall noen har malt.
const udokumenterte = FAGNAVN.flatMap((fagNavn) =>
  FAG[fagNavn].operasjoner
    .filter((o) => !(o.markedLav && o.markedHoy) && o.kilde !== 'anslag')
    .map((o) => o.id)
)
sjekk('satser uten markedsband er merket anslag',
  udokumenterte.length === 0, udokumenterte.length ? udokumenterte.join(', ') : 'ingen udokumenterte')

// 29) Jobbmalene. En mal som peker pa en operasjon som ikke finnes ville lagt
//     inn en tom linje uten a si fra - stille, og midt i den handlingen som
//     skal spare tid.
const brutteMaler = FAGNAVN.flatMap((fagNavn) =>
  jobbmalerFor(fagNavn).flatMap((mal) =>
    mal.linjer
      .filter((l) => hentOperasjon(fagNavn, l.operasjonId) === undefined)
      .map((l) => `${fagNavn}/${mal.id} -> ${l.operasjonId}`)
  )
)
sjekk('alle jobbmaler peker pa operasjoner som finnes',
  brutteMaler.length === 0, brutteMaler.length ? brutteMaler.join(', ') : 'alle peker riktig')

const romMal = finnJobbmal('Maler', 'maler_rom')!
sjekk('malerens vanligste jobb er vegger og tak',
  romMal.linjer.length === 2 && romMal.linjer.every((l) => l.antall === undefined),
  'antall settes ikke - det kommer fra maalene')

// Fast antall der jobben faktisk ER fast: ett bad er ett bad.
const badMal = finnJobbmal('Rørlegger', 'ror_komplett_bad')!
sjekk('badet har fast antall', badMal.linjer.length === 1 && badMal.linjer[0].antall === 1)

// 30) Hele veien fra tommestokk til pris, gjennom de samme funksjonene som
//     serveren bruker. Et rom pa 4 x 3 x 2,4 med en dor: 12 m2 tak og 31,7 m2
//     vegg, og de to tallene kommer fra samme maal.
const jobb = maalOpp([{ lengde: 4, bredde: 3, hoyde: 2.4, dorer: 1 }])!
const malerjobb = beregnTilbud('Maler', [
  { operasjonId: 'maler_vegg', antall: mengdeFor('m2_vegg', jobb)! },
  { operasjonId: 'maler_tak', antall: mengdeFor('m2_tak', jobb)! },
], 750, 25)
sjekk('rommaalene gir et komplett regnestykke',
  malerjobb.linjer.length === 2 && malerjobb.prisKr > 0,
  `${malerjobb.linjer[0].antall} m2 vegg + ${malerjobb.linjer[1].antall} m2 tak = ${malerjobb.prisKr} kr pa ${malerjobb.timer} timer`)
sjekk('summen gar opp ogsa fra rommaal',
  malerjobb.arbeidKr + malerjobb.materialKr + malerjobb.marginKr === malerjobb.prisKr)

// 31) Gruppene i nedtrekkslista. Hver operasjon skal vaere med noyaktig en gang
//     - faller en ut, kan den ikke lenger velges i skjemaet.
const grupperingsfeil = FAGNAVN.filter((fagNavn) => {
  const iGrupper = grupperteOperasjoner(fagNavn).flatMap((g) => g.operasjoner.map((o) => o.id))
  const alle = FAG[fagNavn].operasjoner.map((o) => o.id)
  return iGrupper.length !== alle.length || alle.some((id) => !iGrupper.includes(id))
})
sjekk('grupperingen mister ingen operasjon',
  grupperingsfeil.length === 0, grupperingsfeil.length ? grupperingsfeil.join(', ') : 'alle fag komplette')
sjekk('maleren deles i flate- og stykkarbeid', grupperteOperasjoner('Maler').length === 2)
sjekk('annet star udelt', grupperteOperasjoner('Annet').length === 1)

const ANTALL = 148
console.log(feil === 0 ? `\nAlle ${ANTALL} testene passerte.` : `\n${feil} test(er) feilet.`)
process.exit(feil === 0 ? 0 : 1)
