// Server-only. Ett sted for miljøvariabler, av to grunner:
//
// 1. Uten validering feiler et ferskt deploy med "supabaseUrl is required"
//    fra inni supabase-js, uten å si hvilken variabel som mangler eller hvor
//    den skal settes. Det er den vanligste måten et førstegangsoppsett ryker.
// 2. appUrl() lå i tre identiske kopier. Den er deploy-kritisk — den bygger
//    betalingslenken kunden får i PDF og e-post — så en retting som bare traff
//    to av tre ville vært verre enn ingen retting.

export function paakrevdEnv(navn: string): string {
  const verdi = process.env[navn]
  if (!verdi) {
    throw new Error(
      `Miljøvariabelen ${navn} mangler. Se .env.local.example for hele listen. ` +
        `Ved deploy må den settes hos hosting-leverandøren — en .env.local på ` +
        `utviklingsmaskinen følger ikke med.`
    )
  }
  return verdi
}

// Appens egen offentlige adresse. Brukes til Stripes success/cancel-URL-er og
// til betalingslenken /betal/[token] i faktura-PDF og faktura-e-post.
//
// ⚠️ Settes verken APP_URL eller NEXTAUTH_URL i produksjon, får hver eneste
// kunde en lenke til http://localhost:3000 — en død lenke, uten at noe feiler
// synlig noe sted. Derfor advarselen under.
export function appUrl(): string {
  const url = process.env.APP_URL || process.env.NEXTAUTH_URL
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        'VARSEL: verken APP_URL eller NEXTAUTH_URL er satt. Alle betalingslenker ' +
          'i faktura-PDF og e-post vil peke til http://localhost:3000 og være ' +
          'ubrukelige for kunden.'
      )
    }
    return 'http://localhost:3000'
  }
  return url
}
