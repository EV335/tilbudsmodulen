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

export const FAKTURA_STATUS_OPTIONS: { value: FakturaStatus | ''; label: string }[] = [
  { value: '', label: 'Alle statuser' },
  { value: 'draft', label: 'Utkast' },
  { value: 'pending', label: 'Venter på betaling' },
  { value: 'paid', label: 'Betalt' },
  { value: 'failed', label: 'Betaling feilet' },
  { value: 'cancelled', label: 'Kansellert' },
]
