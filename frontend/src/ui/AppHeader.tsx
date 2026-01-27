import { useNavigate } from 'react-router-dom'

interface AppHeaderProps {
  onMenuClick?: () => void
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const navigate = useNavigate()

  return (
    <>
      <header className="bg-primary-600 text-white px-4 h-14 flex items-center fixed top-0 left-0 right-0 z-30 shadow-md max-w-content mx-auto">
        {/* Empty spacer for centering */}
        <div className="w-10"></div>

        {/* Centered title */}
        <h1 className="flex-1 text-xl font-bold leading-none text-center">Rememly</h1>

        <div className="relative flex items-center gap-2">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-primary-700 rounded-lg transition-colors touch-manipulation flex items-center justify-center"
            aria-label="Settings"
          >
            <svg className="w-6 h-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
          </button>
        </div>
      </header>
      {/* Spacer to offset fixed header */}
      <div className="h-14 flex-shrink-0" />
    </>
  )
}
