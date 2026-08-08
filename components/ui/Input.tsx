import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  hint?: string
}

export default function Input({ label, id, hint, className = '', ...rest }: InputProps) {
  return (
    <div>
      <label className="block text-sm font-bold mb-2" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={[
          'w-full text-lg px-4 py-3 border-2 border-black/10 rounded-md bg-white',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {hint && <p className="mt-2 text-sm text-black/50">{hint}</p>}
    </div>
  )
}
