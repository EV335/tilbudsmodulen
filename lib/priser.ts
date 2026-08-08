export interface FagKonfig {
  timerPerM2: number
  materialkostPerM2: number
  marginProsent: number
}

export const FAGKONFIG: Record<string, FagKonfig> = {
  Maler: { timerPerM2: 0.4, materialkostPerM2: 90, marginProsent: 25 },
  Snekker: { timerPerM2: 0.6, materialkostPerM2: 220, marginProsent: 28 },
  Rørlegger: { timerPerM2: 0.5, materialkostPerM2: 180, marginProsent: 30 },
  Elektriker: { timerPerM2: 0.45, materialkostPerM2: 150, marginProsent: 30 },
  Murer: { timerPerM2: 0.7, materialkostPerM2: 260, marginProsent: 27 },
  Bilpleie: { timerPerM2: 0.3, materialkostPerM2: 40, marginProsent: 35 },
}

export const DEFAULT_FAGKONFIG: FagKonfig = { timerPerM2: 0.5, materialkostPerM2: 120, marginProsent: 25 }

export function hentFagKonfig(jobbType: string): FagKonfig {
  return FAGKONFIG[jobbType] ?? DEFAULT_FAGKONFIG
}

export function foreslaMaterialkost(jobbType: string, romstorrelseM2: number): number {
  if (!romstorrelseM2 || romstorrelseM2 <= 0) return 0
  const { materialkostPerM2 } = hentFagKonfig(jobbType)
  return Math.round(materialkostPerM2 * romstorrelseM2)
}
