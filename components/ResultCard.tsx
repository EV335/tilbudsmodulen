'use client'

import { useEffect, useState } from 'react'
import jsPDF from 'jspdf'
import { TilbudInput, TilbudResult } from '@/lib/ai'
import Card from '@/components/ui/Card'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'

interface ResultCardProps {
  resultat: TilbudResult
  input: TilbudInput
}

interface Firma {
  firmanavn: string
  logo_url?: string | null
}

function formatKr(beløp: number) {
  return `kr ${Math.round(beløp).toLocaleString('nb-NO')},-`
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

async function lastNedPdf(tilbudstekst: string, input: TilbudInput, firma: Firma | null) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margLeft = 56
  let y = 64

  if (firma?.logo_url) {
    const logoDataUrl = await hentLogoSomDataUrl(firma.logo_url)
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, margLeft, y, 90, 40, undefined, 'FAST')
        y += 56
      } catch {
        // ugyldig bildeformat for PDF – hopp over logo
      }
    }
  }

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(firma?.firmanavn || 'TilbudsMaskinen', margLeft, y)
  y += 28

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')

  const linjer = doc.splitTextToSize(tilbudstekst, 500)
  doc.text(linjer, margLeft, y)

  const filnavn = `tilbud-${input.jobbType.toLowerCase()}-${Date.now()}.pdf`
  doc.save(filnavn)
}

export default function ResultCard({ resultat, input }: ResultCardProps) {
  const [visTilbud, setVisTilbud] = useState(false)
  const [tilbudstekst, setTilbudstekst] = useState(resultat.tilbudstekst)
  const [lagretStatus, setLagretStatus] = useState<'idle' | 'lagrer' | 'lagret' | 'feil'>('idle')
  const [sendtStatus, setSendtStatus] = useState<'idle' | 'sendt'>('idle')
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'lager'>('idle')
  const [firma, setFirma] = useState<Firma | null>(null)

  useEffect(() => {
    fetch('/api/firma')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFirma(data))
      .catch(() => setFirma(null))
  }, [])

  async function lagreIHistorikk() {
    setLagretStatus('lagrer')
    try {
      const res = await fetch('/api/tilbud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, resultat: { ...resultat, tilbudstekst } }),
      })
      if (!res.ok) throw new Error('Lagring feilet')
      setLagretStatus('lagret')
    } catch {
      setLagretStatus('feil')
    }
  }

  async function handleLastNedPdf() {
    setPdfStatus('lager')
    await lastNedPdf(tilbudstekst, input, firma)
    setPdfStatus('idle')
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
          {lagretStatus === 'lagrer' && 'Lagrer...'}
          {lagretStatus === 'lagret' && 'Lagret i historikk'}
          {lagretStatus === 'feil' && 'Kunne ikke lagre — prøv igjen'}
          {lagretStatus === 'idle' && 'Lagre i historikk'}
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
          </div>
        </Card>
      )}
    </div>
  )
}
