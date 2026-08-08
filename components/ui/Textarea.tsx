import { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  id: string
}

export default function Textarea({ label, id, className = '', ...rest }: TextareaProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-bold mb-2" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={[
          'w-full text-base px-4 py-3 border-2 border-black/10 rounded-md bg-white',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
    </div>
  )
}
