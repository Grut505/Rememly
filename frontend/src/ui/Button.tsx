import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseClasses = 'px-6 py-3 rounded-lg font-medium transition-colors touch-manipulation'

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400 disabled:bg-gray-100',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-gray-300',
  }

  const widthClass = fullWidth ? 'w-full' : ''

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${widthClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
