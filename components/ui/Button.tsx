import Link from 'next/link'
import { ButtonHTMLAttributes, ReactNode } from 'react'

// Appen har to underlag: den mørke sidebakgrunnen og de lyse kortene (Card).
// En dempet knapp må vite hvilket den står på — `secondary` var hvit tekst på
// bg-white/10, som ga kontrast 1.1 mot kortbakgrunnen (kravet er 4.5). Seks av
// åtte dempede knapper i appen står inne i kort, så `secondary` er nå
// lys-underlag-varianten, og den mørke har fått sitt eget navn.
type ButtonVariant = 'primary' | 'secondary' | 'secondaryDark' | 'gold' | 'link'
type ButtonSize = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  href?: string
  children: ReactNode
}

// `border-2 border-transparent` på de fylte variantene så de får nøyaktig
// samme høyde som `secondary`, som trenger en synlig kant for å lese som en
// knapp mot det lyse kortet. Uten dette ble "Lagre" og "Avbryt" 4 px ulike.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue hover:bg-blue-hover text-white border-2 border-transparent disabled:opacity-60',
  // På lyse kort (Card): mørk tekst, kontrast 12.6 mot kortbakgrunnen.
  secondary: 'bg-black/5 hover:bg-black/10 text-dark border-2 border-black/15 disabled:opacity-60',
  // På den mørke sidebakgrunnen.
  secondaryDark: 'bg-white/10 hover:bg-white/20 text-white border-2 border-transparent disabled:opacity-60',
  gold: 'bg-gold hover:opacity-90 text-dark border-2 border-transparent disabled:opacity-60',
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
