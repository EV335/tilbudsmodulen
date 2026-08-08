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
    }

    if (!body.firmanavn) {
      return NextResponse.json({ error: 'Firmanavn er påkrevd.' }, { status: 400 })
    }

    let logoUrl: string | undefined

    if (body.logoDataUrl?.startsWith('data:')) {
      const match = body.logoDataUrl.match(/^data:(.+);base64,(.+)$/)
      if (match) {
        const [, mimeType, base64] = match
        const filtype = mimeType.split('/')[1] || 'png'
        const filsti = `${session.user.id}/logo.${filtype}`
        const buffer = Buffer.from(base64, 'base64')

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
    }

    const { data, error } = await supabase
      .from('firma')
      .upsert(
        {
          user_id: session.user.id,
          firmanavn: body.firmanavn,
          orgnr: body.orgnr || null,
          adresse: body.adresse || null,
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
