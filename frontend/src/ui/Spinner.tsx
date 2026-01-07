interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }

  return (
    <div
      className={`${sizeClasses[size]} border-blue-600 border-t-transparent rounded-full animate-spin ${className}`}
    />
  )
}

export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Spinner size="lg" />
      <p className="mt-4 text-gray-600">{message}</p>
    </div>
  )
}
