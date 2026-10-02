import { SelectHTMLAttributes } from 'react'

interface Option {
  value: string
  label: string
}

/**
 * Gruppert nedtrekksliste. Fagene har vokst — bilpleie har elleve operasjoner
 * fordelt på tre bilstørrelser — og en flat liste på elleve punkter er noe man
 * leter i, ikke velger fra. Én gruppe rendres uten overskrift, slik at fagene
 * som ikke trenger inndeling ser ut nøyaktig som før.
 */
interface OptionGroup {
  label: string
  options: Option[]
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  id: string
  options?: Option[]
  grupper?: OptionGroup[]
}

export default function Select({ label, id, options, grupper, className = '', ...rest }: SelectProps) {
  const klasser = [
    'w-full text-lg px-4 py-3 border-2 border-black/10 rounded-md bg-white',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  // Én gruppe trenger ingen overskrift — den skiller ingenting fra noe.
  const flat = grupper && grupper.length === 1 ? grupper[0].options : options

  return (
    <div>
      <label className="block text-sm font-bold mb-2" htmlFor={id}>
        {label}
      </label>
      <select id={id} className={klasser} {...rest}>
        {flat
          ? flat.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          : grupper?.map((gruppe) => (
              <optgroup key={gruppe.label} label={gruppe.label}>
                {gruppe.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
      </select>
    </div>
  )
}
