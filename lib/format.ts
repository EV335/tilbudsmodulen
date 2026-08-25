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

// Månedsnøkkel for gruppering: 'YYYY-MM', som sorterer riktig som ren tekst.
//
// Regnes av LOKAL tid, ikke UTC. Et tilbud lagret 31. august kl. 23:30 norsk
// tid har tidsstempelet 21:30Z — men det er en augustjobb for den som laget
// det, og en septemberjobb bare for en klokke i London. Resten av fila viser
// også lokal tid (`toLocaleDateString`), så et UTC-basert bøttevalg ville gitt
// en rad merket «sep. 2026» med en dato «31.08.2026» ved siden av.
export function maanedNokkel(verdi: string | Date): string | null {
  const d = verdi instanceof Date ? verdi : new Date(verdi)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 'aug. 2026' fra nøkkelen over. */
export function formatMaaned(maaned: string): string {
  const [aar, mnd] = maaned.split('-').map(Number)
  if (!Number.isFinite(aar) || !Number.isFinite(mnd) || mnd < 1 || mnd > 12) return maaned
  return new Date(aar, mnd - 1, 1).toLocaleDateString('nb-NO', { month: 'short', year: 'numeric' })
}
