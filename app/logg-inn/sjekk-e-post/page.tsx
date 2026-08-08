import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'

export default function SjekkEpostPage() {
  return (
    <Section size="sm" spacing="roomy">
      <h1 className="text-3xl md:text-4xl font-black mb-2">Sjekk e-posten din</h1>
      <Card>
        <p className="text-black/70">
          Vi har sendt deg en innloggingslenke. Klikk på lenken i e-posten for å logge inn.
        </p>
      </Card>
    </Section>
  )
}
