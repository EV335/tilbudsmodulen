import type { Metadata } from 'next'

// Betalingslenkene er uautentiserte og deles på e-post. Blir en slik URL
// indeksert (eller sendt videre til en crawler av en e-postklient), ligger en
// kundes faktura med beløp åpent i søkeresultater. Tokenet skal være den
// eneste veien inn.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default function BetalLayout({ children }: { children: React.ReactNode }) {
  return children
}
