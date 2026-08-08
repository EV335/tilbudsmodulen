'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import type { Faktura, FakturaStatus } from '@/lib/payments'
import { FAKTURA_STATUS_LABEL, FAKTURA_STATUS_FARGE, FAKTURA_STATUS_OPTIONS } from '@/lib/fakturaStatus'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'

function formatKr(beløp: number) {
  return `kr ${Math.round(beløp).toLocaleString('nb-NO')},-`
}

function formatDato(iso: string) {
  return new Date(iso).toLocaleDateString('nb-NO')
}

export default function FakturaOversiktPage() {
  const { status: sessionStatus } = useSession()
  const [fakturaer, setFakturaer] = useState<Faktura[] | null>(null)
  const [filter, setFilter] = useState<FakturaStatus | ''>('')
  const [feil, setFeil] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return

    let aktiv = true
    setFeil(null)
    const url = filter ? `/api/invoices?status=${filter}` : '/api/invoices'
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Henting feilet')
        return res.json()
      })
      .then((data) => {
        if (aktiv) setFakturaer(data)
      })
      .catch(() => {
        if (aktiv) setFeil('Klarte ikke å hente fakturaer.')
      })
    return () => {
      aktiv = false
    }
  }, [sessionStatus, filter])

  if (sessionStatus === 'loading') {
    return (
      <Section spacing="none" className="py-16 text-center">
        <p className="text-white/50">Laster...</p>
      </Section>
    )
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <Section spacing="none" className="py-16 text-center">
        <h1 className="text-2xl font-black mb-4">Du må logge inn</h1>
        <p className="text-white/70 mb-8">Fakturaoversikt krever innlogging.</p>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  return (
    <Section size="lg">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black mb-2">Fakturaer</h1>
          <p className="text-white/70">Oversikt over utsendte fakturaer og betalingsstatus.</p>
        </div>
        <div className="w-full sm:w-64">
          <Select
            id="statusfilter"
            label="Filtrer på status"
            options={FAKTURA_STATUS_OPTIONS}
            value={filter}
            onChange={(e) => setFilter(e.target.value as FakturaStatus | '')}
          />
        </div>
      </div>

      {feil && <p className="text-red-400 mb-6">{feil}</p>}
      {fakturaer === null && !feil && <p className="text-white/60">Laster fakturaer...</p>}

      {fakturaer && fakturaer.length === 0 && (
        <Card padding="md">
          <p className="text-black/60">Ingen fakturaer funnet. Opprett en faktura fra et lagret tilbud i historikken.</p>
        </Card>
      )}

      <div className="space-y-3">
        {fakturaer?.map((faktura) => (
          <Link key={faktura.id} href={`/historikk/invoices/${faktura.id}`}>
            <Card padding="md" className="flex items-center justify-between hover:opacity-90 cursor-pointer">
              <div>
                <div className="font-bold text-lg">{faktura.invoice_number}</div>
                <div className="text-sm text-black/50">
                  {faktura.kunde?.navn ?? 'Ukjent kunde'} · {formatDato(faktura.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-sm font-bold ${FAKTURA_STATUS_FARGE[faktura.status]}`}>
                  {FAKTURA_STATUS_LABEL[faktura.status]}
                </span>
                <div className="text-xl font-black text-blue">{formatKr(faktura.amount)}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Section>
  )
}
