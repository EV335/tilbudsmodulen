import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentKunder, opprettKunde, KundeType } from '@/lib/payments'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const kunder = await hentKunder(session.user.id)
    return NextResponse.json(kunder)
  } catch (err) {
    console.error('Feil i GET /api/customers:', err)
    return NextResponse.json({ error: 'Klarte ikke å hente kunder.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      type?: KundeType
      navn?: string
      epost?: string
      telefon?: string
      adresse?: string
      orgnr?: string
    }

    if (!body.type || (body.type !== 'privat' && body.type !== 'bedrift')) {
      return NextResponse.json({ error: 'type må være "privat" eller "bedrift".' }, { status: 400 })
    }
    if (!body.navn) {
      return NextResponse.json({ error: 'Navn er påkrevd.' }, { status: 400 })
    }

    const kunde = await opprettKunde(session.user.id, {
      type: body.type,
      navn: body.navn,
      epost: body.epost,
      telefon: body.telefon,
      adresse: body.adresse,
      orgnr: body.orgnr,
    })

    return NextResponse.json(kunde)
  } catch (err) {
    console.error('Feil i POST /api/customers:', err)
    return NextResponse.json({ error: 'Klarte ikke å opprette kunde.' }, { status: 500 })
  }
}
