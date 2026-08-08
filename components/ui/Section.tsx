import { HTMLAttributes, ReactNode } from 'react'

type SectionSize = 'sm' | 'md' | 'lg' | 'xl'
type SectionSpacing = 'none' | 'compact' | 'roomy'

interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  size?: SectionSize
  spacing?: SectionSpacing
  children: ReactNode
}

const SIZE_CLASSES: Record<SectionSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

const SPACING_CLASSES: Record<SectionSpacing, string> = {
  none: '',
  compact: 'py-12 md:py-16',
  roomy: 'py-16 md:py-24',
}

export default function Section({ size = 'md', spacing = 'compact', className = '', children, ...rest }: SectionProps) {
  const classes = [SIZE_CLASSES[size], 'mx-auto px-6', SPACING_CLASSES[spacing], className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
