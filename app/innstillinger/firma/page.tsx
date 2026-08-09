'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface Firma {
  firmanavn: string
  orgnr?: string | null
  adresse?: string | null
  logo_url?: string | null
  bankkonto?: string | null
  betalingsbetingelser_dager?: number | null
}

export default function InnstillingerFirmaPage() {
  const { status } = useSession()
  const [firmanavn, setFirmanavn] = useState('')
  const [orgnr, setOrgnr] = useState('')
  const [adresse, setAdresse] = useState('')
  const [bankkonto, setBankkonto] = useState('')
  const [betalingsbetingelserDager, setBetalingsbetingelserDager] = useState('14')
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined)
  const [eksisterendeLogoUrl, setEksisterendeLogoUrl] = useState<string | null>(null)
  const [lasterInn, setLasterInn] = useState(true)
  const [lagrerStatus, setLagrerStatus] = useState<'idle' | 'lagrer' | 'lagret' | 'feil'>('idle')

  useEffect(() => {
    if (status === 'loading') return

    if (status !== 'authenticated') {
      setLasterInn(false)
      return
    }

    fetch('/api/firma')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Firma | null) => {
        if (data) {
          setFirmanavn(data.firmanavn ?? '')
          setOrgnr(data.orgnr ?? '')
          setAdresse(data.adresse ?? '')
          setBankkonto(data.bankkonto ?? '')
          setBetalingsbetingelserDager(String(data.betalingsbetingelser_dager ?? 14))
          setEksisterendeLogoUrl(data.logo_url ?? null)
        }
      })
      .finally(() => setLasterInn(false))
  }, [status])

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0]
    if (!fil) return
    const reader = new FileReader()
    reader.onload = () => setLogoDataUrl(reader.result as string)
    reader.readAsDataURL(fil)
  }

  async function handleLagre(e: React.FormEvent) {
    e.preventDefault()
    setLagrerStatus('lagrer')
    try {
      const res = await fetch('/api/firma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmanavn,
          orgnr,
          adresse,
          logoDataUrl,
          bankkonto,
          betalingsbetingelserDager: Number(betalingsbetingelserDager) || 14,
        }),
      })
      if (!res.ok) throw new Error('Lagring feilet')
      setLagrerStatus('lagret')
      setTimeout(() => setLagrerStatus('idle'), 2500)
    } catch {
      setLagrerStatus('feil')
    }
  }

  if (status === 'loading' || lasterInn) {
    return (
      <Section spacing="none" className="py-16 text-center">
        <p className="text-white/50">Laster...</p>
      </Section>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <Section spacing="none" className="py-16 text-center">
        <h1 className="text-2xl font-black mb-4">Du må logge inn</h1>
        <p className="text-white/70 mb-8">Firmaoppsett krever innlogging.</p>
        <Button href="/logg-inn" size="md">
          Logg inn
        </Button>
      </Section>
    )
  }

  const visLogo = logoDataUrl ?? eksisterendeLogoUrl

  return (
    <Section>
      <h1 className="text-3xl md:text-4xl font-black mb-2">Mitt firma</h1>
      <p className="text-white/70 mb-8">
        Firmaopplysningene brukes som avsender på tilbud, fakturaer og PDF-eksport, og lagres på kontoen din.
      </p>

      <Card as="form" onSubmit={handleLagre} className="space-y-6">
        <Input
          id="firmanavn"
          label="Firmanavn"
          type="text"
          required
          value={firmanavn}
          onChange={(e) => setFirmanavn(e.target.value)}
          placeholder="f.eks. Ola Nordmann Maler AS"
        />

        <Input
          id="orgnr"
          label="Org.nr (valgfritt)"
          type="text"
          value={orgnr}
          onChange={(e) => setOrgnr(e.target.value)}
          placeholder="f.eks. 923 456 789"
        />

        <Input
          id="adresse"
          label="Adresse (valgfritt)"
          type="text"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="f.eks. Storgata 1, 0155 Oslo"
        />

        <div>
          <Input id="logo" label="Logo (valgfritt)" type="file" accept="image/*" onChange={handleLogoChange} className="text-base" />
          {visLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={visLogo} alt="Firmalogo" className="mt-4 h-16 object-contain" />
          )}
        </div>

        <div className="border-t border-black/10 pt-6">
          <div className="text-sm font-bold text-black/50 uppercase tracking-wide mb-4">Faktura-innstillinger</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              id="bankkonto"
              label="Kontonummer (valgfritt)"
              type="text"
              value={bankkonto}
              onChange={(e) => setBankkonto(e.target.value)}
              placeholder="f.eks. 1234.56.78901"
              hint="Vises på fakturaer som ikke er betalt via Stripe."
            />

            <Input
              id="betalingsbetingelser"
              label="Betalingsfrist (dager)"
              type="number"
              min="1"
              value={betalingsbetingelserDager}
              onChange={(e) => setBetalingsbetingelserDager(e.target.value)}
              hint="Standard forfallsdato på nye fakturaer, med mindre annet velges."
            />
          </div>
        </div>

        <Button type="submit" fullWidth disabled={lagrerStatus === 'lagrer'}>
          {lagrerStatus === 'lagrer' ? 'Lagrer...' : 'Lagre'}
        </Button>

        {lagrerStatus === 'lagret' && <p className="text-green-700 font-medium">Firmaopplysninger lagret.</p>}
        {lagrerStatus === 'feil' && <p className="text-red-700 font-medium">Klarte ikke å lagre. Prøv igjen.</p>}
      </Card>
    </Section>
  )
}
