import { ElementType, HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  padding?: 'md' | 'lg'
  children: ReactNode
}

export default function Card({ as: Tag = 'div', padding = 'lg', className = '', children, ...rest }: CardProps) {
  const paddingClass = padding === 'lg' ? 'p-6 md:p-8' : 'p-6'
  const classes = ['bg-card text-dark rounded-md', paddingClass, className].filter(Boolean).join(' ')

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  )
}
