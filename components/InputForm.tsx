'use client'

import { useState } from 'react'
import { TilbudInput } from '@/lib/ai'
import { foreslaMaterialkost } from '@/lib/priser'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'

const JOBBTYPER = ['Maler', 'Snekker', 'Rørlegger', 'Elektriker', 'Murer', 'Bilpleie', 'Annet']
const JOBBTYPE_OPTIONS = JOBBTYPER.map((type) => ({ value: type, label: type }))

interface InputFormProps {
  onSubmit: (input: TilbudInput) => void
  loading: boolean
  error?: string | null
}

export default function InputForm({ onSubmit, loading, error }: InputFormProps) {
  const [jobbType, setJobbType] = useState('Maler')
  const [romstorrelseM2, setRomstorrelseM2] = useState('')
  const [timepris, setTimepris] = useState('')
  const [materialkost, setMaterialkost] = useState('')
  const [beskrivelse, setBeskrivelse] = useState('')
  const [kundenavn, setKundenavn] = useState('')

  const forslag = foreslaMaterialkost(jobbType, Number(romstorrelseM2))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      jobbType,
      romstorrelseM2: Number(romstorrelseM2),
      timepris: Number(timepris),
      materialkost: Number(materialkost || 0),
      beskrivelse,
      kundenavn,
    })
  }

  return (
    <Card as="form" onSubmit={handleSubmit} className="space-y-6">
      <Select id="jobbType" label="Type jobb" value={jobbType} onChange={(e) => setJobbType(e.target.value)} options={JOBBTYPE_OPTIONS} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          id="romstorrelse"
          label="Romstørrelse (m²)"
          type="number"
          min="1"
          step="any"
          required
          value={romstorrelseM2}
          onChange={(e) => setRomstorrelseM2(e.target.value)}
          placeholder="f.eks. 25"
        />

        <Input
          id="timepris"
          label="Timepris (kr)"
          type="number"
          min="1"
          step="any"
          required
          value={timepris}
          onChange={(e) => setTimepris(e.target.value)}
          placeholder="f.eks. 750"
        />
      </div>

      <div>
        <Input
          id="materialkost"
          label="Estimert materialkostnad (kr)"
          type="number"
          min="0"
          step="any"
          value={materialkost}
          onChange={(e) => setMaterialkost(e.target.value)}
          placeholder="f.eks. 4000"
        />
        {forslag > 0 && (
          <Button type="button" variant="link" className="mt-2" onClick={() => setMaterialkost(String(forslag))}>
            Bruk forslag fra prisbiblioteket: kr {forslag.toLocaleString('nb-NO')},-
          </Button>
        )}
      </div>

      <Input
        id="kundenavn"
        label="Kundenavn (valgfritt)"
        type="text"
        value={kundenavn}
        onChange={(e) => setKundenavn(e.target.value)}
        placeholder="f.eks. Ola Nordmann"
      />

      <Textarea
        id="beskrivelse"
        label="Beskrivelse (valgfritt)"
        value={beskrivelse}
        onChange={(e) => setBeskrivelse(e.target.value)}
        placeholder="F.eks. omfang, overflate, spesielle forhold på jobben"
        rows={4}
      />

      {error && (
        <div className="text-red-700 bg-red-100 border-2 border-red-300 rounded-md px-4 py-3 font-medium">
          {error}
        </div>
      )}

      <Button type="submit" fullWidth disabled={loading}>
        {loading ? 'Beregner...' : 'Beregn tilbud'}
      </Button>
    </Card>
  )
}
