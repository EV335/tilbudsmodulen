import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hentKunde, oppdaterKunde, slettKunde, KundeHarFakturaerError, KundeType } from '@/lib/payments'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

    const oppdatert = await oppdaterKunde(session.user.id, params.id, {
      type: body.type,
      navn: body.navn,
      epost: body.epost,
      telefon: body.telefon,
      adresse: body.adresse,
      orgnr: body.orgnr,
    })

    if (!oppdatert) {
      return NextResponse.json({ error: 'Fant ikke kunde.' }, { status: 404 })
    }
    return NextResponse.json(oppdatert)
  } catch (err) {
    console.error('Feil i PATCH /api/customers/[id]:', err)
    return NextResponse.json({ error: 'Klarte ikke å oppdatere kunde.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Eierskapssjekk før sletting, ellers ville et forsøk på en annen brukers
    // kunde gitt "ok" uten at noe skjedde.
    const kunde = await hentKunde(session.user.id, params.id)
    if (!kunde) {
      return NextResponse.json({ error: 'Fant ikke kunde.' }, { status: 404 })
    }

    await slettKunde(session.user.id, params.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof KundeHarFakturaerError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error('Feil i DELETE /api/customers/[id]:', err)
    return NextResponse.json({ error: 'Klarte ikke å slette kunde.' }, { status: 500 })
  }
}
