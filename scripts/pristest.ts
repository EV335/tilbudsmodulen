// Regresjonstest for prismodellen. Kjør med: npm run test:pris
//
// Hver test her svarer til en bug som faktisk har vært i koden. Endrer du
// lib/priser.ts, lib/ai.ts, lib/pdftekst.ts eller lib/format.ts — kjør denne
// først.
//
// Ingen testrammeverk i prosjektet; dette er et vanlig skript med exit-kode,
// slik at det kan kjøres i CI senere uten å dra inn Jest eller Vitest.

import { beregnTilbud, beregnLinje } from '@/lib/priser'
import { verifiserPris } from '@/lib/ai'
import { tilPdfTekst } from '@/lib/pdftekst'
import { formatKr } from '@/lib/format'

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

const ANTALL = 21
console.log(feil === 0 ? `\nAlle ${ANTALL} testene passerte.` : `\n${feil} test(er) feilet.`)
process.exit(feil === 0 ? 0 : 1)
