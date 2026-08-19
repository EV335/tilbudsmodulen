// Regresjonstest for prismodellen. Kjør med: npm run test:pris
//
// Hver test her svarer til en bug som faktisk har vært i koden. Endrer du
// lib/priser.ts, lib/ai.ts, lib/pdftekst.ts, lib/format.ts, lib/tilgang.ts
// eller lib/etterkalkyle.ts — kjør denne først.
//
// Ingen testrammeverk i prosjektet; dette er et vanlig skript med exit-kode,
// slik at det kan kjøres i CI senere uten å dra inn Jest eller Vitest.

import { beregnTilbud, beregnLinje } from '@/lib/priser'
import { verifiserPris, tekstNevnerPrisen } from '@/lib/ai'
import { tilPdfTekst } from '@/lib/pdftekst'
import { formatKr } from '@/lib/format'
import { lesTilgangsliste, harTilgang } from '@/lib/tilgang'
import {
  avvikProsent,
  fordelTimer,
  fordelMaterial,
  samleErfaring,
  harForslag,
  harMaterialforslag,
  type Etterkalkyle,
} from '@/lib/etterkalkyle'

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

// 8) Gamle tilbud uten linjer skal fortsatt kunne lagres
sjekk('gammelt tilbud uten linjer slipper gjennom',
  verifiserPris({ jobbType: 'Maler', timepris: 750, linjer: [], romstorrelseM2: 60 } as never, { pris: 30667 } as never) === null)

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

const ANTALL = 61
console.log(feil === 0 ? `\nAlle ${ANTALL} testene passerte.` : `\n${feil} test(er) feilet.`)
process.exit(feil === 0 ? 0 : 1)
