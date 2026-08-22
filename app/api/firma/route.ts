import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('firma')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) {
    console.error('Feil i GET /api/firma:', error)
    return NextResponse.json({ error: 'Klarte ikke å hente firma.' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      firmanavn: string
      orgnr?: string
      adresse?: string
      logoDataUrl?: string
      bankkonto?: string
      betalingsbetingelserDager?: number
      mvaSats?: number
      mvaInkludertStandard?: boolean
    }

    if (!body.firmanavn) {
      return NextResponse.json({ error: 'Firmanavn er påkrevd.' }, { status: 400 })
    }

    let logoUrl: string | undefined

    if (body.logoDataUrl?.startsWith('data:')) {
      // Bare bildetypene vi faktisk viser, og filendelsen utledes av VAR liste
      // — ikke av klientens mime-streng. Foer sto det
      // `mimeType.split('/')[1]` rett inn i filstien, og regexen slapp gjennom
      // hva som helst: «data:image/../../x;base64,» ga en filsti med .. i seg.
      // Verre var contentType: bucketen er offentlig, saa en innlogget bruker
      // kunne lastet opp text/html og faatt en offentlig URL som serverte det.
      // SVG er utelatt med vilje — den kan inneholde script.
      const TILLATTE: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      }
      // 2 MB dekodet. En firmalogo er aldri i naerheten, og uten grensen leser
      // vi hele kroppen inn i minnet foer noen sier fra.
      const MAKS_BYTES = 2 * 1024 * 1024

      const match = body.logoDataUrl.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/)
      if (!match) {
        return NextResponse.json({ error: 'Logoen kunne ikke leses. Last opp en PNG, JPG eller WEBP.' }, { status: 400 })
      }

      const [, mimeType, base64] = match
      const filtype = TILLATTE[mimeType]
      if (!filtype) {
        return NextResponse.json(
          { error: 'Logoen må være PNG, JPG eller WEBP.' },
          { status: 400 }
        )
      }

      const buffer = Buffer.from(base64, 'base64')
      if (buffer.byteLength > MAKS_BYTES) {
        return NextResponse.json(
          { error: 'Logoen er for stor. Maks 2 MB.' },
          { status: 400 }
        )
      }

      const filsti = `${session.user.id}/logo.${filtype}`
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filsti, buffer, { contentType: mimeType, upsert: true })

      if (uploadError) {
        console.error('Feil ved opplasting av logo:', uploadError)
        return NextResponse.json({ error: 'Klarte ikke å laste opp logo.' }, { status: 500 })
      }

      const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(filsti)
      logoUrl = publicUrlData.publicUrl
    }

    const { data, error } = await supabase
      .from('firma')
      .upsert(
        {
          user_id: session.user.id,
          firmanavn: body.firmanavn,
          orgnr: body.orgnr || null,
          adresse: body.adresse || null,
          bankkonto: body.bankkonto || null,
          // Klampes ogsa her. Klienten vokter 1-365, men den vakten er borte i
          // det noen kaller API-et direkte — og 0 dagers frist er ingen frist.
          betalingsbetingelser_dager: Math.min(
            Math.max(Math.round(Number(body.betalingsbetingelserDager) || 14), 1),
            365
          ),
          // 0 = ikke mva-registrert. Satsen er selve av/pa-bryteren, sa de to
          // kan ikke komme i utakt.
          mva_sats: Math.min(Math.max(Number(body.mvaSats) || 0, 0), 100),
          mva_inkludert_standard: Boolean(body.mvaInkludertStandard),
          ...(logoUrl ? { logo_url: logoUrl } : {}),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('Feil i POST /api/firma:', error)
      return NextResponse.json({ error: 'Klarte ikke å lagre firma.' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Feil i POST /api/firma:', err)
    return NextResponse.json({ error: 'Klarte ikke å lagre firma.' }, { status: 500 })
  }
}
