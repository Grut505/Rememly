interface FloatingActionButtonProps {
  onClick: () => void
  icon?: React.ReactNode
  className?: string
}

export function FloatingActionButton({
  onClick,
  icon,
  className = '',
}: FloatingActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-16 h-16 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 active:bg-blue-800 flex items-center justify-center text-3xl touch-manipulation ${className}`}
      aria-label="Create new article"
    >
      {icon || '+'}
    </button>
  )
}
