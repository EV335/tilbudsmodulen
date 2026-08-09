'use client'

import { useState } from 'react'
import type { Faktura } from '@/lib/payments'
import { FAKTURA_STATUS_LABEL, FAKTURA_STATUS_FARGE } from '@/lib/fakturaStatus'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import CheckoutButton from '@/components/payments/CheckoutButton'
import PaymentIntentForm from '@/components/payments/PaymentIntentForm'

function formatKr(beløp: number) {
  return `kr ${Math.round(beløp).toLocaleString('nb-NO')},-`
}

function formatDato(iso: string) {
  return new Date(iso).toLocaleDateString('nb-NO')
}

interface InvoiceViewProps {
  faktura: Faktura
}

export default function InvoiceView({ faktura: initial }: InvoiceViewProps) {
  const [faktura, setFaktura] = useState(initial)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sender' | 'sendt' | 'feil'>('idle')
  const [lenkeKopiert, setLenkeKopiert] = useState(false)

  function kopierBetalingslenke() {
    const lenke = `${window.location.origin}/betal/${faktura.public_token}`
    navigator.clipboard.writeText(lenke)
    setLenkeKopiert(true)
    setTimeout(() => setLenkeKopiert(false), 2000)
  }

  async function handleGenererEllerResend() {
    setResendStatus('sender')
    try {
      const res = await fetch(`/api/invoices/${faktura.id}/resend`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Klarte ikke å sende faktura.')
      setFaktura((f) => ({ ...f, pdf_url: data.pdfUrl }))
      setResendStatus('sendt')
    } catch {
      setResendStatus('feil')
    }
  }

  const kanBetale = faktura.status === 'pending' || faktura.status === 'draft'

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div>
            <div className="text-sm font-bold text-black/50 uppercase tracking-wide">{faktura.invoice_number}</div>
            <div className={`text-lg font-black ${FAKTURA_STATUS_FARGE[faktura.status]}`}>
              {FAKTURA_STATUS_LABEL[faktura.status]}
            </div>
          </div>
          <div className="text-3xl font-black text-blue">{formatKr(faktura.amount)}</div>
        </div>
        <div className="text-black/70 border-t border-black/10 pt-4">
          <div className="font-medium">{faktura.kunde?.navn ?? 'Ukjent kunde'}</div>
          {faktura.kunde?.epost && <div className="text-sm">{faktura.kunde.epost}</div>}
          <div className="text-sm text-black/50 mt-2">Opprettet {formatDato(faktura.created_at)}</div>
          {faktura.due_date && <div className="text-sm text-black/50">Forfall {formatDato(faktura.due_date)}</div>}
          {faktura.paid_at && <div className="text-sm text-green-700 mt-1">Betalt {formatDato(faktura.paid_at)}</div>}
        </div>
      </Card>

      <Card padding="md" className="flex flex-wrap items-center justify-between gap-4">
        <span className="font-medium">{faktura.pdf_url ? 'Faktura-PDF er klar' : 'Ingen PDF generert ennå'}</span>
        <div className="flex flex-wrap gap-4">
          {faktura.pdf_url && (
            <Button href={faktura.pdf_url} variant="secondary" size="md">
              Last ned PDF
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={handleGenererEllerResend} disabled={resendStatus === 'sender'}>
            {resendStatus === 'sender' && 'Sender...'}
            {resendStatus === 'sendt' && 'Sendt på nytt'}
            {resendStatus === 'feil' && 'Feilet — prøv igjen'}
            {resendStatus === 'idle' && (faktura.pdf_url ? 'Send på nytt' : 'Generer og send')}
          </Button>
        </div>
      </Card>

      {kanBetale && (
        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="text-sm font-bold text-black/50 uppercase tracking-wide">Betaling</div>
            <Button variant="secondary" size="md" onClick={kopierBetalingslenke}>
              {lenkeKopiert ? 'Lenke kopiert!' : 'Kopier betalingslenke til kunden'}
            </Button>
          </div>
          {faktura.kunde?.type === 'bedrift' ? (
            <PaymentIntentForm invoiceId={faktura.id} />
          ) : (
            <CheckoutButton invoiceId={faktura.id} />
          )}
        </Card>
      )}
    </div>
  )
}
