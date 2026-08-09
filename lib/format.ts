// Felles formatering. Lå tidligere som identiske kopier i sju filer, med den
// konsekvensen at en retting måtte gjøres sju steder for å slå gjennom.
// Ingen avhengigheter — trygg å importere fra klientkomponenter.

// Beløp ble tidligere alltid rundet til hele kroner i visningen, mens Stripe
// trakk det eksakte beløpet (Math.round(amount * 100) i øre). En faktura på
// 1500,50 sto altså som "kr 1 500,-" i både PDF og UI, men kunden ble belastet
// 1500,50. Nå vises ørene når de finnes.
export function formatKr(beløp: number): string {
  const harOre = Math.round(beløp * 100) % 100 !== 0
  const desimaler = harOre ? 2 : 0
  return `kr ${beløp.toLocaleString('nb-NO', {
    minimumFractionDigits: desimaler,
    maximumFractionDigits: desimaler,
  })},-`
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
