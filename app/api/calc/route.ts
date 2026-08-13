import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { genererTilbud, TilbudInput } from '@/lib/ai'
import { hentOperasjon, TilbudLinjeInput } from '@/lib/priser'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Partial<TilbudInput>

    const jobbType = String(body.jobbType ?? '')
    const timepris = Number(body.timepris)

    if (!jobbType || !timepris) {
      return NextResponse.json(
        { error: 'Mangler nødvendige felt: jobbType og timepris er påkrevd.' },
        { status: 400 }
      )
    }

    if (Number.isNaN(timepris) || timepris <= 0 || timepris > 100000) {
      return NextResponse.json({ error: 'Ugyldig timepris.' }, { status: 400 })
    }

    if (!Array.isArray(body.linjer) || body.linjer.length === 0) {
      return NextResponse.json({ error: 'Legg til minst én linje i tilbudet.' }, { status: 400 })
    }

    const linjer: TilbudLinjeInput[] = []
    for (const rå of body.linjer) {
      const operasjonId = String(rå?.operasjonId ?? '')
      const antall = Number(rå?.antall)

      if (!hentOperasjon(jobbType, operasjonId)) {
        return NextResponse.json(
          { error: `Ukjent arbeidsoperasjon for ${jobbType}: ${operasjonId}` },
          { status: 400 }
        )
      }

      if (Number.isNaN(antall) || antall <= 0 || antall > 100000) {
        return NextResponse.json(
          { error: 'Antall må være et positivt tall under 100 000 på hver linje.' },
          { status: 400 }
        )
      }

      const materialPerEnhet = rå?.materialPerEnhet === undefined ? undefined : Number(rå.materialPerEnhet)
      if (materialPerEnhet !== undefined && (Number.isNaN(materialPerEnhet) || materialPerEnhet < 0 || materialPerEnhet > 1000000)) {
        return NextResponse.json({ error: 'Ugyldig materialkostnad på en av linjene.' }, { status: 400 })
      }

      // Satsen følger med linjen som et øyeblikksbilde. Klienten har hentet
      // brukerens egne satser fra /api/priser og sender dem hit, slik at det som
      // vises, det som regnes og det som senere etterregnes ved lagring alltid
      // er samme tall — også hvis brukeren endrer satsen sin i morgen.
      const timerPerEnhet = rå?.timerPerEnhet === undefined ? undefined : Number(rå.timerPerEnhet)
      if (timerPerEnhet !== undefined && (Number.isNaN(timerPerEnhet) || timerPerEnhet < 0 || timerPerEnhet > 500)) {
        return NextResponse.json({ error: 'Ugyldig tidsbruk per enhet på en av linjene.' }, { status: 400 })
      }

      linjer.push({ operasjonId, antall, timerPerEnhet, materialPerEnhet })
    }

    const marginProsent = body.marginProsent === undefined ? undefined : Number(body.marginProsent)
    if (marginProsent !== undefined && (Number.isNaN(marginProsent) || marginProsent < 0 || marginProsent >= 100)) {
      return NextResponse.json({ error: 'Margin må være mellom 0 og 99 prosent.' }, { status: 400 })
    }

    const input: TilbudInput = {
      jobbType,
      timepris,
      linjer,
      marginProsent,
      beskrivelse: body.beskrivelse ? String(body.beskrivelse) : '',
      kundenavn: body.kundenavn ? String(body.kundenavn) : '',
    }

    const result = await genererTilbud(input)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Feil i /api/calc:', err)
    return NextResponse.json({ error: 'Klarte ikke å beregne tilbud. Prøv igjen.' }, { status: 500 })
  }
}
