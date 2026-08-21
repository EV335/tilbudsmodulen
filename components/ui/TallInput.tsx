import { InputHTMLAttributes } from 'react'
import Input from '@/components/ui/Input'

/**
 * Tallfelt for et norsk grensesnitt.
 *
 * Bevisst `type="text"` og ikke `type="number"`. Med `number` er det nettleserens
 * språkinnstilling som avgjør om «7,5» er gyldig — og er den engelsk, tømmer
 * nettleseren feltverdien i det brukeren skriver komma. Han ser tallet sitt stå
 * der, mens React har fått tom streng og lagre-knappen er deaktivert.
 *
 * `inputMode="decimal"` gir tastatur med tall og desimaltegn på mobil, så det
 * eneste som går tapt er piltastene opp/ned — som ingen av disse feltene har
 * bruk for.
 *
 * Tolkning skjer med tilTall() i lib/tall.ts. Feltet og tolkeren hører sammen:
 * bruker du det ene uten det andre, er du tilbake til å gjette på skilletegn.
 */
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'step' | 'min' | 'max'
> & {
  label: string
  id: string
  hint?: string
}

export default function TallInput(props: Props) {
  return <Input {...props} type="text" inputMode="decimal" autoComplete="off" />
}
