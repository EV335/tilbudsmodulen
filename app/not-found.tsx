import Section from '@/components/ui/Section'
import Button from '@/components/ui/Button'

export default function NotFound() {
  return (
    <Section spacing="none" className="py-16 text-center">
      <h1 className="text-2xl font-black mb-4">Siden ble ikke funnet</h1>
      <p className="text-white/70 mb-8">Siden du leter etter finnes ikke, eller har blitt flyttet.</p>
      <Button href="/" size="md">
        Gå til forsiden
      </Button>
    </Section>
  )
}
