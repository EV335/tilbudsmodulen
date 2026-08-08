import { redirect } from 'next/navigation'

// Firmaoppsett flyttet til /innstillinger/firma (utvidet med
// faktura-innstillinger som del av betalingsmodulen). Denne siden beholdes
// som en ren redirect for eksisterende lenker/bokmerker.
export default function InnstillingerPage() {
  redirect('/innstillinger/firma')
}
