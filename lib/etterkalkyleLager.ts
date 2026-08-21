import { supabase } from '@/lib/supabase'
import { Etterkalkyle, EtterkalkyleLinje } from '@/lib/etterkalkyle'

interface EtterkalkyleRad {
  tilbud_id: string
  faktiske_timer: number
  faktisk_material_kr: number | null
  notat: string | null
  linjer: EtterkalkyleLinje[] | null
  created_at: string
}

function radTilEtterkalkyle(rad: EtterkalkyleRad): Etterkalkyle {
  return {
    tilbudId: rad.tilbud_id,
    faktiskeTimer: Number(rad.faktiske_timer),
    faktiskMaterialKr: rad.faktisk_material_kr === null ? undefined : Number(rad.faktisk_material_kr),
    notat: rad.notat ?? undefined,
    linjer: rad.linjer ?? [],
    registrert: rad.created_at,
  }
}

// Koden blir deployet før migrasjonen kjøres — slik har hver eneste tabell i
// dette prosjektet kommet til. Uten en egen melding får håndverkeren «Klarte
// ikke å lagre» og tror han har gjort noe feil, mens det som mangler er ett
// SQL-skript ingen har kjørt ennå.
export const MANGLER_TABELL =
  'Etterkalkyle er ikke slått på ennå: migrasjonen 20260817_etterkalkyle.sql må kjøres i Supabase.'

// 42P01 = undefined_table i Postgres.
function manglerTabell(feil: { code?: string }): boolean {
  return feil.code === '42P01'
}

export async function hentEtterkalkyler(userId: string): Promise<Etterkalkyle[]> {
  const { data, error } = await supabase
    .from('etterkalkyler')
    .select('tilbud_id, faktiske_timer, faktisk_material_kr, notat, linjer, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    // Bare den ene feilen svelges: mangler tabellen (migrasjonen ikke kjørt),
    // skal historikken fortsatt vises — etterkalkylen er et tillegg, ikke noe
    // resten av appen henger på. Alt annet kastes videre. Ble hver feil svelget,
    // ville en forbigående databasefeil sett nøyaktig ut som «ingen jobber
    // registrert ennå», og satsforslagene forsvunnet uten et ord.
    if (manglerTabell(error)) {
      console.error(MANGLER_TABELL)
      return []
    }
    throw new Error(`Klarte ikke å hente etterkalkyler: ${error.message}`)
  }

  return (data as EtterkalkyleRad[]).map(radTilEtterkalkyle)
}

export async function lagreEtterkalkyle(
  userId: string,
  tilbudId: string,
  faktiskeTimer: number,
  faktiskMaterialKr: number | null,
  notat: string | null,
  linjer: EtterkalkyleLinje[]
): Promise<Etterkalkyle> {
  const { data, error } = await supabase
    .from('etterkalkyler')
    .upsert(
      {
        user_id: userId,
        tilbud_id: tilbudId,
        faktiske_timer: faktiskeTimer,
        faktisk_material_kr: faktiskMaterialKr,
        notat: notat,
        linjer,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tilbud_id' }
    )
    .select('tilbud_id, faktiske_timer, faktisk_material_kr, notat, linjer, created_at')
    .single()

  if (error) {
    if (manglerTabell(error)) throw new Error(MANGLER_TABELL)
    throw new Error(`Klarte ikke å lagre etterkalkylen: ${error.message}`)
  }
  return radTilEtterkalkyle(data as EtterkalkyleRad)
}

export async function slettEtterkalkyle(userId: string, tilbudId: string): Promise<void> {
  const { error } = await supabase
    .from('etterkalkyler')
    .delete()
    .eq('user_id', userId)
    .eq('tilbud_id', tilbudId)

  if (error) {
    if (manglerTabell(error)) throw new Error(MANGLER_TABELL)
    throw new Error(`Klarte ikke å slette etterkalkylen: ${error.message}`)
  }
}
