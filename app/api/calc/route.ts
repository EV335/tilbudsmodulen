import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { genererTilbud, TilbudInput } from '@/lib/ai'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Partial<TilbudInput>

    if (!body.jobbType || !body.romstorrelseM2 || !body.timepris) {
      return NextResponse.json(
        { error: 'Mangler nødvendige felt: jobbType, romstorrelseM2 og timepris er påkrevd.' },
        { status: 400 }
      )
    }

    const input: TilbudInput = {
      jobbType: String(body.jobbType),
      romstorrelseM2: Number(body.romstorrelseM2),
      timepris: Number(body.timepris),
      materialkost: Number(body.materialkost ?? 0),
      beskrivelse: body.beskrivelse ? String(body.beskrivelse) : '',
      kundenavn: body.kundenavn ? String(body.kundenavn) : '',
    }

    if (
      Number.isNaN(input.romstorrelseM2) ||
      Number.isNaN(input.timepris) ||
      Number.isNaN(input.materialkost) ||
      input.romstorrelseM2 <= 0 ||
      input.timepris <= 0 ||
      input.materialkost < 0
    ) {
      return NextResponse.json({ error: 'Ugyldige tallverdier i input.' }, { status: 400 })
    }

    if (input.romstorrelseM2 > 100000 || input.timepris > 100000 || input.materialkost > 100000000) {
      return NextResponse.json({ error: 'Verdiene er urealistisk høye. Sjekk tallene og prøv igjen.' }, { status: 400 })
    }

    const result = await genererTilbud(input)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Feil i /api/calc:', err)
    return NextResponse.json({ error: 'Klarte ikke å beregne tilbud. Prøv igjen.' }, { status: 500 })
  }
}
