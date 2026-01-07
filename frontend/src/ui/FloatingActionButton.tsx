interface FloatingActionButtonProps {
  onClick: () => void
  icon?: React.ReactNode
}

export function FloatingActionButton({
  onClick,
  icon,
}: FloatingActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 active:bg-blue-800 flex items-center justify-center text-2xl touch-manipulation z-50"
      aria-label="Create new article"
    >
      {icon || '+'}
    </button>
  )
}
