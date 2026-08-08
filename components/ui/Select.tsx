import { SelectHTMLAttributes } from 'react'

interface Option {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  id: string
  options: Option[]
}

export default function Select({ label, id, options, className = '', ...rest }: SelectProps) {
  return (
    <div>
      <label className="block text-sm font-bold mb-2" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={[
          'w-full text-lg px-4 py-3 border-2 border-black/10 rounded-md bg-white',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
