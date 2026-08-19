import { supabase } from '@/lib/supabase'
import { BeregnetLinje } from '@/lib/priser'
import { Etterkalkyle, EtterkalkyleLinje } from '@/lib/etterkalkyle'
import { TilbudResult } from '@/lib/ai'

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

/**
 * Plukker ut det etterkalkylen trenger fra et lagret tilbud.
 *
 * Tilbud laget før linjemodellen (august 2026) har ingen `linjer`. De kan
 * fortsatt få registrert timer — avviket mot `tidsbrukTimer` er like ekte —
 * men de kan ikke lære opp en sats, for vi vet ikke hvilken operasjon timene
 * hørte til. Derfor tom liste og ikke et kast.
 */
export function linjerFraResultat(resultat: TilbudResult): EtterkalkyleLinje[] {
  const linjer: BeregnetLinje[] = resultat.linjer ?? []
  return linjer
    .filter(
      (l) =>
        Number.isFinite(l.antall) &&
        l.antall > 0 &&
        // Timer ELLER material. Kravet om timer > 0 var riktig da
        // oeyeblikksbildet bare tjente timefordelingen. Naa mater det ogsaa
        // materialfordelingen, og en linje uten timer er fullt gyldig der:
        // brukeren kan ha satt timesatsen til 0 og bare ta betalt for
        // materialet. Falt linja ut, ble materialet dens fordelt paa de
        // andre linjene i stedet — og operasjonen som faktisk brukte
        // materialet laerte ingenting.
        ((Number.isFinite(l.timer) && l.timer > 0) ||
          (Number.isFinite(l.materialKr) && l.materialKr > 0))
    )
    .map((l) => ({
      operasjonId: l.operasjonId,
      antall: l.antall,
      estimertTimer: l.timer,
      estimertMaterialKr: l.materialKr,
    }))
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
    // Mangler tabellen (migrasjonen ikke kjørt ennå), skal historikken fortsatt
    // vises. Etterkalkylen er et tillegg, ikke noe resten av appen henger på.
    console.error('Klarte ikke å hente etterkalkyler:', error.message)
    return []
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
