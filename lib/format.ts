// Felles formatering. Lå tidligere som identiske kopier i sju filer, med den
// konsekvensen at en retting måtte gjøres sju steder for å slå gjennom.
// Ingen avhengigheter — trygg å importere fra klientkomponenter.

// Beløp ble tidligere alltid rundet til hele kroner i visningen, mens Stripe
// trakk det eksakte beløpet (Math.round(amount * 100) i øre). En faktura på
// 1500,50 sto altså som "kr 1 500,-" i både PDF og UI, men kunden ble belastet
// 1500,50. Nå vises ørene når de finnes.
//
// «,-» er kortform for «og null øre», så den hører BARE hjemme på runde beløp.
// Da ørene ble innført ble suffikset stående på begge grener, og resultatet var
// «kr 12 033,25,-» — et misdannet beløp på en faktura til kunde. Det traff de
// fleste mva-fakturaer, siden 25 % av en ujevn sum nesten alltid gir øre.
export function formatKr(beløp: number): string {
  const harOre = Math.round(beløp * 100) % 100 !== 0
  const tall = beløp.toLocaleString('nb-NO', {
    minimumFractionDigits: harOre ? 2 : 0,
    maximumFractionDigits: harOre ? 2 : 0,
  })
  return harOre ? `kr ${tall}` : `kr ${tall},-`
}

export function formatDato(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO')
}

export function formatDatoTid(iso: string): string {
  return new Date(iso).toLocaleString('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
