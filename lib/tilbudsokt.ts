// Resultatsiden får ikke tilbudet i URL-en — den leser det fra sessionStorage,
// slik at et helt tilbud slipper å ligge i adressefeltet.
//
// Nøkkelen lå som en løs tekststreng fire steder (kalkulator, historikk og to
// kall på resultatsiden). En skrivefeil i ett av dem gir en resultatside som
// bare sier «fant ingen beregning», uten noe spor av hvorfor — så den hører
// hjemme ett sted. Ingen avhengigheter utover typene: brukes kun fra
// klientkomponenter.

import type { TilbudInput, TilbudResult } from '@/lib/ai'

const NOKKEL = 'tilbudsmaskinen:resultat'

export interface OktensTilbud {
  /** Satt for lagrede tilbud, utelatt for en fersk beregning som ikke er lagret. */
  id?: string
  input: TilbudInput
  resultat: TilbudResult
}

export function leggTilbudIOkt(tilbud: OktensTilbud): void {
  sessionStorage.setItem(NOKKEL, JSON.stringify(tilbud))
}

export function lesTilbudFraOkt(): string | null {
  return sessionStorage.getItem(NOKKEL)
}

export function fjernTilbudFraOkt(): void {
  sessionStorage.removeItem(NOKKEL)
}
