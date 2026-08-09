'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import jsPDF from 'jspdf'
import { TilbudInput, TilbudResult } from '@/lib/ai'
import { formatKr } from '@/lib/format'
import Card from '@/components/ui/Card'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'

interface ResultCardProps {
  resultat: TilbudResult
  input: TilbudInput
  tilbudId?: string
}

interface Firma {
  firmanavn: string
  logo_url?: string | null
}

async function hentLogoSomDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function hentBildeStorrelse(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

async function lastNedPdf(tilbudstekst: string, input: TilbudInput, firma: Firma | null) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margLeft = 56
  const margRight = 56
  const sideBredde = doc.internal.pageSize.getWidth()
  const sideHoyde = doc.internal.pageSize.getHeight()
  const bunnMarg = 56
  const tekstBredde = sideBredde - margLeft - margRight
  let y = 64

  if (firma?.logo_url) {
    const logoDataUrl = await hentLogoSomDataUrl(firma.logo_url)
    if (logoDataUrl) {
      try {
        const maksBredde = 100
        const maksHoyde = 44
        const dim = await hentBildeStorrelse(logoDataUrl)
        let bredde = maksBredde
        let hoyde = maksHoyde
        if (dim && dim.w > 0 && dim.h > 0) {
          const skala = Math.min(maksBredde / dim.w, maksHoyde / dim.h)
          bredde = dim.w * skala
          hoyde = dim.h * skala
        }
        doc.addImage(logoDataUrl, margLeft, y, bredde, hoyde, undefined, 'FAST')
        y += hoyde + 16
      } catch {
        // ugyldig bildeformat for PDF – hopp over logo
      }
    }
  }

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(firma?.firmanavn || 'TilbudsMaskinen', margLeft, y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  doc.text(new Date().toLocaleDateString('nb-NO'), sideBredde - margRight, y, { align: 'right' })
  doc.setTextColor(0)
  y += 28

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')

  const linjeHoyde = 15
  const linjer = doc.splitTextToSize(tilbudstekst, tekstBredde)
  for (const linje of linjer) {
    if (y > sideHoyde - bunnMarg) {
      doc.addPage()
      y = 64
    }
    doc.text(linje, margLeft, y)
    y += linjeHoyde
  }

  const trygtFagnavn = input.jobbType.toLowerCase().replace(/[^a-z0-9æøå]+/gi, '-')
  const filnavn = `tilbud-${trygtFagnavn}-${Date.now()}.pdf`
  doc.save(filnavn)
}

export default function ResultCard({ resultat, input, tilbudId }: ResultCardProps) {
  const { status: sessionStatus } = useSession()
  const [visTilbud, setVisTilbud] = useState(false)
  const [tilbudstekst, setTilbudstekst] = useState(resultat.tilbudstekst)
  const [lagretStatus, setLagretStatus] = useState<'idle' | 'lagrer' | 'lagret' | 'feil'>('idle')
  const [aktivId, setAktivId] = useState<string | undefined>(tilbudId)
  const [sendtStatus, setSendtStatus] = useState<'idle' | 'sendt'>('idle')
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'lager' | 'feil'>('idle')
  const [firma, setFirma] = useState<Firma | null>(null)

  useEffect(() => {
    // /result er ikke middleware-beskyttet (leser kun sessionStorage), så uten
    // denne sjekken fyrte siden av et /api/firma-kall som garantert svarte 401.
    if (sessionStatus !== 'authenticated') {
      setFirma(null)
      return
    }
    fetch('/api/firma')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFirma(data))
      .catch(() => setFirma(null))
  }, [sessionStatus])

  async function lagreIHistorikk() {
    setLagretStatus('lagrer')
    try {
      const url = aktivId ? `/api/tilbud/${aktivId}` : '/api/tilbud'
      const method = aktivId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, resultat: { ...resultat, tilbudstekst } }),
      })
      if (!res.ok) throw new Error('Lagring feilet')
      const lagret = await res.json()
      setAktivId(lagret.id)
      setLagretStatus('lagret')
    } catch {
      setLagretStatus('feil')
    }
  }

  async function handleLastNedPdf() {
    setPdfStatus('lager')
    try {
      await lastNedPdf(tilbudstekst, input, firma)
      setPdfStatus('idle')
    } catch {
      setPdfStatus('feil')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-1">Totalpris</div>
        <div className="text-5xl md:text-6xl font-black text-blue">{formatKr(resultat.pris)}</div>
        <div className="text-sm text-black/50 mt-2">
          {input.jobbType} · {input.romstorrelseM2} m²
          {input.kundenavn ? ` · ${input.kundenavn}` : ''}
          {resultat.kilde === 'lokalt-estimat' && ' · Lokalt estimat (ingen API-nøkkel satt)'}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card padding="md">
          <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-1">Tidsbruk</div>
          <div className="text-3xl font-black">{resultat.tidsbrukTimer} t</div>
        </Card>
        <Card padding="md">
          <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-1">Materialkostnad</div>
          <div className="text-3xl font-black">{formatKr(resultat.materialkostTotal)}</div>
        </Card>
        <Card padding="md">
          <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-1">Margin</div>
          <div className="text-3xl font-black text-gold">{resultat.marginProsent}%</div>
          <div className="text-sm text-black/50 mt-1">{formatKr(resultat.marginKr)}</div>
        </Card>
      </div>

      <Card>
        <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-2">Materialforbruk</div>
        <p className="text-base leading-relaxed">{resultat.materialforbruk}</p>
      </Card>

      <Card>
        <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-2">Risikoanalyse</div>
        <p className="text-base leading-relaxed">{resultat.risikoanalyse}</p>
      </Card>

      <div className="flex gap-4">
        {!visTilbud && (
          <Button fullWidth className="flex-1" onClick={() => setVisTilbud(true)}>
            Generer tilbud
          </Button>
        )}
        <Button
          variant="secondary"
          fullWidth
          className="flex-1"
          onClick={lagreIHistorikk}
          disabled={lagretStatus === 'lagrer'}
        >
          {lagretStatus === 'lagrer' && (aktivId ? 'Oppdaterer...' : 'Lagrer...')}
          {lagretStatus === 'lagret' && (aktivId ? 'Oppdatert i historikk' : 'Lagret i historikk')}
          {lagretStatus === 'feil' && 'Kunne ikke lagre — prøv igjen'}
          {lagretStatus === 'idle' && (aktivId ? 'Oppdater i historikk' : 'Lagre i historikk')}
        </Button>
      </div>

      {visTilbud && (
        <Card className="space-y-4">
          <div className="text-sm font-bold text-black/50 uppercase tracking-wide">Tilbudstekst (redigerbar)</div>
          <Textarea
            id="tilbudstekst"
            value={tilbudstekst}
            onChange={(e) => setTilbudstekst(e.target.value)}
            rows={14}
            className="font-sans leading-relaxed"
          />
          <div className="flex flex-wrap gap-4">
            <Button variant="gold" size="md" onClick={handleLastNedPdf} disabled={pdfStatus === 'lager'}>
              {pdfStatus === 'lager' ? 'Lager PDF...' : 'Last ned PDF'}
            </Button>
            <Button size="md" onClick={() => setSendtStatus('sendt')}>
              Send til kunde (demo)
            </Button>
            {sendtStatus === 'sendt' && (
              <span className="self-center text-sm font-medium text-green-700">
                Demo: dette simulerer utsending — ingen e-post er faktisk sendt.
              </span>
            )}
            {pdfStatus === 'feil' && (
              <span className="self-center text-sm font-medium text-red-600">
                Klarte ikke å lage PDF. Prøv igjen.
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
