import { InputHTMLAttributes } from 'react'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  id: string
  hint?: string
}

// Input-komponenten legger etiketten OVER feltet, som blir feil for en
// avkryssingsboks — der hører etiketten ved siden av, og hele den skal være
// klikkbar.
export default function Checkbox({ label, id, hint, className = '', ...rest }: CheckboxProps) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          className={['mt-1 h-5 w-5 shrink-0 accent-blue cursor-pointer', className].filter(Boolean).join(' ')}
          {...rest}
        />
        <span className="text-sm font-bold leading-6">{label}</span>
      </label>
      {hint && <p className="mt-2 ml-8 text-sm text-black/50">{hint}</p>}
    </div>
  )
}
