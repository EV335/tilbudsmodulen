// Server-only. Hvem som får lage konto og logge inn.
//
// Uten denne kan hvem som helst som kjenner adressen be om en magic link, få
// konto, og deretter sende fakturaer fra vårt verifiserte avsenderdomene
// (noreply@tilbudsmaskinen.no). Appen ligger åpent på nett, så det er ikke en
// teoretisk risiko.
//
// Lista settes i miljøvariabelen ALLOWED_EMAILS, kommaseparert:
//   ALLOWED_EMAILS=even@firma.no, maler@annetfirma.no, @tilbudsmaskinen.no
// En oppføring som starter med @ slipper inn hele domenet.

export type Tilgangsliste =
  | { modus: 'apen' }
  | { modus: 'stengt'; grunn: string }
  | { modus: 'liste'; adresser: string[]; domener: string[] }

// Tre utfall, ikke to. Det tredje — «satt, men ingenting gyldig i den» — er
// grunnen til at denne returnerer et objekt og ikke en liste: en skrivefeil i
// hele variabelen ville ellers gitt tom liste, og tom liste tolkes som «ikke
// konfigurert». Da ville en typo åpnet døra for alle, stille. Derfor stenges
// den i stedet, og feilen logges.
export function lesTilgangsliste(raa: string | undefined | null): Tilgangsliste {
  const tekst = (raa ?? '').trim()
  if (!tekst) return { modus: 'apen' }

  const adresser: string[] = []
  const domener: string[] = []
  const ugyldige: string[] = []

  for (const bit of tekst.split(/[,;\s]+/)) {
    const oppforing = bit.trim().toLowerCase()
    if (!oppforing) continue

    if (oppforing.startsWith('@')) {
      // Domeneregel. Krever punktum, ellers ville «@no» sluppet inn et halvt land.
      if (oppforing.slice(1).includes('.')) domener.push(oppforing.slice(1))
      else ugyldige.push(oppforing)
    } else if (oppforing.includes('@')) {
      adresser.push(oppforing)
    } else {
      // «firma.no» uten @ er tvetydig: mente du adressen eller hele domenet?
      // Å gjette på domene ville åpnet mer enn den som skrev det ba om.
      ugyldige.push(oppforing)
    }
  }

  if (adresser.length === 0 && domener.length === 0) {
    return {
      modus: 'stengt',
      grunn:
        `ALLOWED_EMAILS er satt, men ingen av oppføringene er gyldige ` +
        `(${ugyldige.join(', ')}). Ingen slipper inn før dette er rettet. ` +
        `Formatet er «deg@firma.no» for én adresse og «@firma.no» for et helt domene.`,
    }
  }

  return { modus: 'liste', adresser, domener }
}

export function harTilgang(epost: string | null | undefined, liste: Tilgangsliste): boolean {
  if (liste.modus === 'apen') return true
  if (liste.modus === 'stengt') return false

  const normalisert = (epost ?? '').trim().toLowerCase()
  const krollalfa = normalisert.lastIndexOf('@')
  if (krollalfa < 1) return false

  if (liste.adresser.includes(normalisert)) return true
  return liste.domener.includes(normalisert.slice(krollalfa + 1))
}

let harAdvart = false

// Leser miljøet. Egen funksjon slik at lesTilgangsliste/harTilgang forblir
// rene og testbare uten å rote med process.env.
export function tilgangFraEnv(): Tilgangsliste {
  const liste = lesTilgangsliste(process.env.ALLOWED_EMAILS)

  // Feilkonfigurasjon logges hver gang — den låser ute alle, og skal være
  // umulig å overse i loggen. Den åpne modusen logges én gang per prosess.
  if (liste.modus === 'stengt') {
    console.error(liste.grunn)
  } else if (liste.modus === 'apen' && process.env.NODE_ENV === 'production' && !harAdvart) {
    harAdvart = true
    console.warn(
      'VARSEL: ALLOWED_EMAILS er ikke satt. Hvem som helst kan lage konto og ' +
        'sende fakturaer fra avsenderdomenet. Sett den hos hosting-leverandøren.'
    )
  }

  return liste
}
