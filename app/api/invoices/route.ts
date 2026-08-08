import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentFakturaer, hentKunde, opprettFaktura, FakturaStatus } from '@/lib/payments'
import { hentTilbud } from '@/lib/historikk'
import { supabase } from '@/lib/supabase'

const GYLDIGE_STATUSER: FakturaStatus[] = ['draft', 'pending', 'paid', 'failed', 'cancelled']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const statusParam = req.nextUrl.searchParams.get('status')
    const status = statusParam && GYLDIGE_STATUSER.includes(statusParam as FakturaStatus) ? (statusParam as FakturaStatus) : undefined

    const fakturaer = await hentFakturaer(session.user.id, status)
    return NextResponse.json(fakturaer)
  } catch (err) {
    console.error('Feil i GET /api/invoices:', err)
    return NextResponse.json({ error: 'Klarte ikke å hente fakturaer.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { customerId?: string; tilbudId?: string; amount?: number; dueDate?: string }

    if (!body.customerId) {
      return NextResponse.json({ error: 'Mangler customerId.' }, { status: 400 })
    }

    // Autorisasjon: kunden må eies av innlogget bruker.
    const kunde = await hentKunde(session.user.id, body.customerId)
    if (!kunde) {
      return NextResponse.json({ error: 'Fant ikke kunde.' }, { status: 404 })
    }

    let amount = body.amount
    let tilbudId: string | null = null

    if (body.tilbudId) {
      // Autorisasjon: tilbudet må eies av innlogget bruker.
      const tilbud = await hentTilbud(session.user.id, body.tilbudId)
      if (!tilbud) {
        return NextResponse.json({ error: 'Fant ikke tilbud.' }, { status: 404 })
      }
      tilbudId = tilbud.id
      amount = tilbud.resultat.pris
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Mangler eller ugyldig beløp.' }, { status: 400 })
    }

    let dueDate = body.dueDate || null
    if (!dueDate) {
      const { data: firma } = await supabase
        .from('firma')
        .select('betalingsbetingelser_dager')
        .eq('user_id', session.user.id)
        .maybeSingle()
      const dager = firma?.betalingsbetingelser_dager ?? 14
      const forfall = new Date()
      forfall.setDate(forfall.getDate() + dager)
      dueDate = forfall.toISOString().slice(0, 10)
    }

    const faktura = await opprettFaktura(session.user.id, {
      customerId: kunde.id,
      amount,
      tilbudId,
      dueDate,
    })

    return NextResponse.json(faktura)
  } catch (err) {
    console.error('Feil i POST /api/invoices:', err)
    return NextResponse.json({ error: 'Klarte ikke å opprette faktura.' }, { status: 500 })
  }
}
