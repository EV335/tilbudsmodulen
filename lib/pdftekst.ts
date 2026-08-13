// jsPDFs innebygde fonter (helvetica m.fl.) koder tekst som WinAnsi. Tegn utenfor
// det settet blir borte uten et eneste varsel — de forsvinner rett og slett fra
// PDF-en.
//
// Dette ble oppdaget 2026-08-13 på en ekte tilbuds-PDF: linjene sto som
// «130 m² veggflate  kr 26 433,-» der det skulle vært en tankestrek mellom.
// Tegnet var borte, ikke erstattet med noe synlig, så ingenting så galt ut før
// man sammenlignet med skjermen.
//
// Det gjelder også FAKTURA-PDF-en som sendes til kundene, der firmanavn, adresse
// og kundenavn kommer fra frie tekstfelt. En kunde som heter «Kjell–Ove» ville
// fått navnet sitt stavet feil på fakturaen.
//
// æ ø å Æ Ø Å ² ³ ° § ± ligger alle innenfor Latin-1 og er trygge.

const ERSTATNINGER: Array<[RegExp, string]> = [
  [/[‐-―−]/g, '-'], // bindestrek-varianter, tankestrek, minus
  [/[‘’‚‛]/g, "'"], // enkle typografiske anførselstegn
  [/[“”„‟]/g, '"'], // doble typografiske anførselstegn
  [/…/g, '...'],
  [/[•·]/g, '-'], // kulepunkt
  [/→/g, '->'],
  [/[    ]/g, ' '], // smale mellomrom
  [/[​-‍﻿]/g, ''], // usynlige tegn
  [/€/g, 'EUR'], // euro finnes i WinAnsi, men ikke i alle jsPDF-oppsett
]

/**
 * Gjør en tekst trygg for jsPDFs standardfonter. Alt som fortsatt ligger utenfor
 * Latin-1 etter erstatningene blir dekomponert (é → e) og, hvis det fortsatt
 * ikke passer, byttet med «?» — synlig feil er bedre enn stille borte.
 */
export function tilPdfTekst(tekst: string): string {
  let ut = tekst
  for (const [fra, til] of ERSTATNINGER) {
    ut = ut.replace(fra, til)
  }

  // Dekomponer og fjern diakritiske tegn for det som fortsatt er utenfor Latin-1.
  ut = ut
    .split('')
    .map((tegn) => {
      if (tegn.charCodeAt(0) <= 0xff) return tegn
      const dekomponert = tegn.normalize('NFKD').replace(/[̀-ͯ]/g, '')
      return dekomponert.split('').every((t) => t.charCodeAt(0) <= 0xff) ? dekomponert : '?'
    })
    .join('')

  return ut
}
