import Link from 'next/link'
import { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'link'
type ButtonSize = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  href?: string
  children: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue hover:bg-blue-hover text-white disabled:opacity-60',
  secondary: 'bg-white/10 hover:bg-white/20 text-white disabled:opacity-60',
  gold: 'bg-gold hover:opacity-90 text-dark disabled:opacity-60',
  link: 'text-blue hover:underline text-sm font-medium',
}

export default function Button({
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  href,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes =
    variant === 'link'
      ? [VARIANT_CLASSES.link, className].filter(Boolean).join(' ')
      : [
          'font-bold rounded-md text-center',
          fullWidth ? 'w-full' : 'inline-block',
          size === 'lg' ? 'text-lg py-4' : 'text-base py-3',
          fullWidth ? '' : size === 'lg' ? 'px-8' : 'px-6',
          VARIANT_CLASSES[variant],
          className,
        ]
          .filter(Boolean)
          .join(' ')

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
