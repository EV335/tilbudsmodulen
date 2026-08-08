import { supabase } from '@/lib/supabase'
import { TilbudInput, TilbudResult } from '@/lib/ai'

export interface LagretTilbud {
  id: string
  opprettet: string
  input: TilbudInput
  resultat: TilbudResult
}

interface TilbudRad {
  id: string
  created_at: string
  data: { input: TilbudInput; resultat: TilbudResult }
}

function radTilLagretTilbud(rad: TilbudRad): LagretTilbud {
  return {
    id: rad.id,
    opprettet: rad.created_at,
    input: rad.data.input,
    resultat: rad.data.resultat,
  }
}

export async function hentAlleTilbud(userId: string): Promise<LagretTilbud[]> {
  const { data, error } = await supabase
    .from('tilbud')
    .select('id, created_at, data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Klarte ikke å hente historikk: ${error.message}`)
  }

  return (data as TilbudRad[]).map(radTilLagretTilbud)
}

export async function hentTilbud(userId: string, id: string): Promise<LagretTilbud | null> {
  const { data, error } = await supabase
    .from('tilbud')
    .select('id, created_at, data')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Klarte ikke å hente tilbud: ${error.message}`)
  }

  return data ? radTilLagretTilbud(data as TilbudRad) : null
}

export async function lagreTilbud(
  userId: string,
  firmaId: string | null,
  input: TilbudInput,
  resultat: TilbudResult
): Promise<LagretTilbud> {
  const { data, error } = await supabase
    .from('tilbud')
    .insert({
      user_id: userId,
      firma_id: firmaId,
      kunde_navn: input.kundenavn || null,
      pris: resultat.pris,
      data: { input, resultat },
    })
    .select('id, created_at, data')
    .single()

  if (error) {
    throw new Error(`Klarte ikke å lagre tilbud: ${error.message}`)
  }

  return radTilLagretTilbud(data as TilbudRad)
}

export async function oppdaterTilbud(
  userId: string,
  id: string,
  input: TilbudInput,
  resultat: TilbudResult
): Promise<LagretTilbud> {
  const { data, error } = await supabase
    .from('tilbud')
    .update({
      kunde_navn: input.kundenavn || null,
      pris: resultat.pris,
      data: { input, resultat },
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, created_at, data')
    .single()

  if (error) {
    throw new Error(`Klarte ikke å oppdatere tilbud: ${error.message}`)
  }

  return radTilLagretTilbud(data as TilbudRad)
}

export async function slettTilbud(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('tilbud').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    throw new Error(`Klarte ikke å slette tilbud: ${error.message}`)
  }
}
