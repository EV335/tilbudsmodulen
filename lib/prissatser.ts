import { supabase } from '@/lib/supabase'
import { FAG, Prissatser } from '@/lib/priser'

// Alle gyldige operasjons-id-er. Brukes til å avvise satser for operasjoner som
// ikke finnes, slik at tabellen ikke fylles med søppel fra en gammel fane eller
// en fag-id som er fjernet fra koden.
const GYLDIGE_OPERASJONER = new Set(
  Object.values(FAG).flatMap((fag) => fag.operasjoner.map((op) => op.id))
)

export function erGyldigOperasjon(operasjonId: string): boolean {
  return GYLDIGE_OPERASJONER.has(operasjonId)
}

interface PrissatsRad {
  operasjon_id: string
  timer_per_enhet: number | null
  material_per_enhet: number | null
}

export async function hentPrissatser(userId: string): Promise<Prissatser> {
  const { data, error } = await supabase
    .from('prissatser')
    .select('operasjon_id, timer_per_enhet, material_per_enhet')
    .eq('user_id', userId)

  if (error) {
    // Bare den ene feilen svelges: mangler tabellen (migrasjonen ikke kjørt),
    // skal kalkulatoren fortsatt virke med standardsatsene. Alt annet kastes
    // videre. Ble hver feil svelget, ville en forbigående databasefeil gitt et
    // tilbud priset med bokens satser i stedet for håndverkerens egne — uten
    // at noe sa fra, og han ville sendt det til kunden.
    // 42P01 = undefined_table.
    if ((error as { code?: string }).code === '42P01') {
      console.error('prissatser-tabellen finnes ikke — bruker standardsatser. Kjør migrasjonen 20260813_prissatser.sql.')
      return {}
    }
    throw new Error(`Klarte ikke å hente prissatser: ${error.message}`)
  }

  const satser: Prissatser = {}
  for (const rad of (data ?? []) as PrissatsRad[]) {
    satser[rad.operasjon_id] = {
      timerPerEnhet: rad.timer_per_enhet ?? undefined,
      materialPerEnhet: rad.material_per_enhet ?? undefined,
    }
  }
  return satser
}

/**
 * Lagrer én sats. Er begge verdiene null, slettes raden — da faller operasjonen
 * tilbake på standarden i `lib/priser.ts`, og brukeren får med seg framtidige
 * oppdateringer av markedstallene i stedet for å sitte fast på en gammel verdi.
 */
export async function lagrePrissats(
  userId: string,
  operasjonId: string,
  timerPerEnhet: number | null,
  materialPerEnhet: number | null
): Promise<void> {
  if (timerPerEnhet === null && materialPerEnhet === null) {
    const { error } = await supabase
      .from('prissatser')
      .delete()
      .eq('user_id', userId)
      .eq('operasjon_id', operasjonId)
    if (error) throw new Error(`Klarte ikke å nullstille sats: ${error.message}`)
    return
  }

  const { error } = await supabase.from('prissatser').upsert(
    {
      user_id: userId,
      operasjon_id: operasjonId,
      timer_per_enhet: timerPerEnhet,
      material_per_enhet: materialPerEnhet,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,operasjon_id' }
  )

  if (error) throw new Error(`Klarte ikke å lagre sats: ${error.message}`)
}
