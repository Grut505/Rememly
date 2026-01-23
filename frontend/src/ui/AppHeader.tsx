import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface AppHeaderProps {
  onMenuClick?: () => void
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleMenuItemClick = (path: string) => {
    setShowMenu(false)
    navigate(path)
  }

  return (
    <header className="bg-primary-600 text-white px-4 h-14 flex items-center sticky top-0 z-30 shadow-md">
      {/* Empty spacer for centering */}
      <div className="w-10"></div>

      {/* Centered title */}
      <h1 className="flex-1 text-xl font-bold leading-none text-center">Rememly</h1>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-2 hover:bg-primary-700 rounded-lg transition-colors touch-manipulation flex items-center justify-center"
          aria-label="Menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg py-2 text-gray-800 z-30">
            <button
              onClick={() => handleMenuItemClick('/profile')}
              className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
              </svg>
              <span>Profile</span>
            </button>
            <button
              onClick={() => handleMenuItemClick('/stats')}
              className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
              <span>Statistics</span>
            </button>
            <button
              onClick={() => handleMenuItemClick('/famileo')}
              className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3 transition-colors"
            >
              <svg className="w-5 h-5 text-orange-500" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
              <span>Famileo Scraper</span>
            </button>
            <button
              onClick={() => handleMenuItemClick('/pdf-export')}
              className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3 transition-colors"
            >
              <svg className="w-5 h-5 text-red-500" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span>PDF Export</span>
            </button>
            <button
              onClick={() => handleMenuItemClick('/settings')}
              className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              <span>Paramètres</span>
            </button>
            <div className="border-t border-gray-200 mt-2 pt-2 px-4 py-2">
              <p className="text-xs text-gray-400">
                v{import.meta.env.VITE_APP_VERSION || 'dev'} / backend @{import.meta.env.VITE_BACKEND_VERSION || '?'}
              </p>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
