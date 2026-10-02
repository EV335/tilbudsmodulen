import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const FAG = ['Malere', 'Snekkere', 'Gulvleggere', 'Flisleggere', 'Rørleggere', 'Elektrikere']

export default function Home() {
  return (
    <Section size="xl" spacing="roomy">
      <div className="max-w-2xl">
        <h1 className="text-4xl md:text-6xl font-black leading-tight">
          Riktig pris. Profesjonelt tilbud. <span className="text-gold">Sekunder</span>, ikke timer.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-white/70 leading-relaxed">
          TilbudsMaskinen regner ut pris, tidsbruk, materialer og margin for deg — og skriver tilbudet ferdig.
          Ingen gjetting. Ingen regneark.
        </p>
        <Button href="/logg-inn" className="mt-8">
          Start beregning
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
        <Card padding="md">
          <div className="text-2xl font-black mb-2">Riktig pris hver gang</div>
          <p className="text-black/70 leading-relaxed">
            Slutt å bomme på prisen. Få et regnestykke du kan stå bak, basert på reelle tall.
          </p>
        </Card>
        <Card padding="md">
          <div className="text-2xl font-black mb-2">Tidsestimat på sekunder</div>
          <p className="text-black/70 leading-relaxed">
            Ingen mer gjetting på timer og materialforbruk. Fyll inn jobben, få svaret.
          </p>
        </Card>
        <Card padding="md">
          <div className="text-2xl font-black mb-2">Ferdig tilbudstekst</div>
          <p className="text-black/70 leading-relaxed">
            Profesjonell tilbudstekst klar til å sendes til kunden. Ingen skriving nødvendig.
          </p>
        </Card>
      </div>

      <div className="mt-20 border-t border-white/10 pt-10">
        <div className="text-sm font-bold text-white/40 uppercase tracking-wide mb-4">Laget for</div>
        <div className="flex flex-wrap gap-3">
          {FAG.map((fag) => (
            <span
              key={fag}
              className="border border-white/20 text-white/80 px-4 py-2 rounded-md text-sm font-medium"
            >
              {fag}
            </span>
          ))}
        </div>
      </div>
    </Section>
  )
}
