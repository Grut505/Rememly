interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizes = {
    sm: { width: 16, height: 16, border: 2 },
    md: { width: 32, height: 32, border: 3 },
    lg: { width: 48, height: 48, border: 4 },
  }

  const s = sizes[size]

  return (
    <div
      className={`rounded-full animate-spin ${className}`}
      style={{
        width: s.width,
        height: s.height,
        borderWidth: s.border,
        borderStyle: 'solid',
        borderColor: '#2563eb',
        borderTopColor: 'transparent',
      }}
    />
  )
}

export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Spinner size="lg" />
      <p className="mt-4 text-gray-600">{message}</p>
    </div>
  )
}
