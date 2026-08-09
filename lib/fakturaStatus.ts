import type { FakturaStatus } from '@/lib/payments'

// Ren, avhengighetsfri (ingen Supabase-import) — trygg å bruke fra
// klientkomponenter, i motsetning til resten av lib/payments.ts.
export const FAKTURA_STATUS_LABEL: Record<FakturaStatus, string> = {
  draft: 'Utkast',
  pending: 'Venter på betaling',
  paid: 'Betalt',
  failed: 'Betaling feilet',
  cancelled: 'Kansellert',
}

export const FAKTURA_STATUS_FARGE: Record<FakturaStatus, string> = {
  draft: 'text-black/40',
  pending: 'text-gold',
  paid: 'text-green-700',
  failed: 'text-red-600',
  cancelled: 'text-black/40',
}

// Én definisjon for både håndverkerens visning (InvoiceView) og kundens
// offentlige betalingsside (/betal/[token]) — de to må aldri være uenige om
// hvorvidt betalingsknappen skal vises.
// 'failed' er med: et avvist kort skal kunne prøves på nytt med et annet.
export function kanBetales(status: FakturaStatus): boolean {
  return status === 'draft' || status === 'pending' || status === 'failed'
}

// Serversidens versjon av samme regel, med en melding å gi klienten. Brukes av
// alle fire betalingsrutene — UI-et kan skjule knappen, men det er denne som
// faktisk stopper en betaling fra en gammel lenke eller et direkte API-kall.
export function ikkeBetalbarGrunn(status: FakturaStatus): string | null {
  if (kanBetales(status)) return null
  return status === 'paid'
    ? 'Fakturaen er allerede betalt.'
    : 'Fakturaen er kansellert og kan ikke betales.'
}

export const FAKTURA_STATUS_OPTIONS: { value: FakturaStatus | ''; label: string }[] = [
  { value: '', label: 'Alle statuser' },
  { value: 'draft', label: 'Utkast' },
  { value: 'pending', label: 'Venter på betaling' },
  { value: 'paid', label: 'Betalt' },
  { value: 'failed', label: 'Betaling feilet' },
  { value: 'cancelled', label: 'Kansellert' },
]
