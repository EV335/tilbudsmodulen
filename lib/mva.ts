// Mva-beregning. Ingen avhengigheter — brukes både server-side (PDF, beløpet
// som sendes til Stripe) og i klientkomponenter (fakturavisning).

export interface MvaLinjer {
  /** Sats i prosent. 0 = ikke mva-registrert / ingen mva på fakturaen. */
  sats: number
  /** Nettobeløp, det mva regnes av. */
  grunnlag: number
  /** Selve mva-beløpet. */
  mva: number
  /** Det kunden faktisk skal betale — beløpet som sendes til Stripe. */
  total: number
}

// Penger må rundes ett sted, ellers spriker PDF, UI og Stripe-beløpet med
// enkeltører.
function rundOre(belop: number): number {
  return Math.round(belop * 100) / 100
}

/**
 * `amount` er beløpet håndverkeren oppga eller kalkulatoren regnet ut.
 * `inkludert` sier om mva allerede ligger inne i det beløpet.
 *
 * Merk at `mva` rundes først og `total` utledes av grunnlag + mva, slik at
 * linjene på fakturaen alltid summerer seg eksakt. Regner man total for seg
 * kan de bomme med ett øre, og en faktura som ikke går opp er en faktura
 * kunden ringer om.
 */
export function beregnMva(amount: number, sats: number, inkludert: boolean): MvaLinjer {
  const belop = rundOre(amount)

  if (!sats || sats <= 0) {
    return { sats: 0, grunnlag: belop, mva: 0, total: belop }
  }

  if (inkludert) {
    // Mva bakes ut av beløpet: kunden betaler det som står, verken mer eller mindre.
    const grunnlag = rundOre(belop / (1 + sats / 100))
    return { sats, grunnlag, mva: rundOre(belop - grunnlag), total: belop }
  }

  // Mva legges på toppen.
  const mva = rundOre(belop * (sats / 100))
  return { sats, grunnlag: belop, mva, total: rundOre(belop + mva) }
}
