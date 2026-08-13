import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { hentAlleTilbud, lagreTilbud } from '@/lib/historikk'
import { TilbudInput, TilbudResult, verifiserPris } from '@/lib/ai'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const liste = await hentAlleTilbud(session.user.id)
    return NextResponse.json(liste)
  } catch (err) {
    console.error('Feil i GET /api/tilbud:', err)
    return NextResponse.json({ error: 'Klarte ikke å hente tilbud.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { input: TilbudInput; resultat: TilbudResult }

    if (!body.input || !body.resultat) {
      return NextResponse.json({ error: 'Mangler input eller resultat.' }, { status: 400 })
    }

    const prisfeil = verifiserPris(body.input, body.resultat)
    if (prisfeil) {
      console.error('Avviste lagring av tilbud:', prisfeil)
      return NextResponse.json({ error: prisfeil }, { status: 400 })
    }

    const { data: firma } = await supabase
      .from('firma')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const lagret = await lagreTilbud(session.user.id, firma?.id ?? null, body.input, body.resultat)
    return NextResponse.json(lagret)
  } catch (err) {
    console.error('Feil i POST /api/tilbud:', err)
    return NextResponse.json({ error: 'Klarte ikke å lagre tilbud.' }, { status: 500 })
  }
}
