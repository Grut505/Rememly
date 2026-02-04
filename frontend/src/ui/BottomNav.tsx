import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUiStore } from '../state/uiStore'

const NAV_ITEMS = [
  {
    label: 'Articles',
    path: '/',
    icon: (
      <svg className="w-8 h-8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
        <path d="M5 6h14M5 12h14M5 18h10"></path>
      </svg>
    ),
  },
  {
    label: 'Stats',
    path: '/stats',
    icon: (
      <svg className="w-8 h-8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
      </svg>
    ),
  },
  {
    label: 'Famileo',
    path: '/famileo',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5.5" r="2.7" />
        <rect x="10.5" y="8.5" width="3" height="7.5" rx="1.5" />
        <rect x="2.5" y="10" width="6" height="9.5" rx="2" />
        <rect x="15.5" y="4" width="6" height="15.5" rx="2" />
        <circle cx="5.5" cy="14.5" r="0.9" />
        <circle cx="18.5" cy="12" r="0.9" />
        <path d="M12 15.5v4.5m0 0l-2-2m2 2l2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    label: 'PDF',
    path: '/pdf-export',
    icon: (
      <svg className="w-8 h-8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
        <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
      </svg>
    ),
  },
  {
    label: 'Profile',
    path: '/profile',
    icon: (
      <svg className="w-8 h-8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
        <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
      </svg>
    ),
  },
]

const HIDDEN_PATHS = ['/auth', '/editor', '/photo-assembly']

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const hasUnsavedChanges = useUiStore((state) => state.hasUnsavedChanges)
  const setPendingNavigationPath = useUiStore((state) => state.setPendingNavigationPath)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)')
    const update = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean }
      setIsStandalone(media.matches || nav.standalone === true)
    }
    update()
    if (media.addEventListener) {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  if (HIDDEN_PATHS.some((p) => location.pathname.startsWith(p))) {
    return null
  }

  return (
    <>
      <div className={isStandalone ? 'h-20' : 'h-16'} aria-hidden="true" />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-primary-600 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
        <div className="max-w-content mx-auto w-full">
          <div className={`flex items-center justify-between px-2 ${isStandalone ? 'pt-0.5 pb-6' : 'py-1'}`}>
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path
            const handleClick = () => {
              if (location.pathname === item.path) return
              if (hasUnsavedChanges) {
                setPendingNavigationPath(item.path)
                return
              }
              navigate(item.path)
            }

            return (
              <button
                key={item.path}
                onClick={handleClick}
              className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all ${
                isActive
                  ? 'text-white'
                  : 'text-primary-100 hover:text-white'
              }`}
              aria-label={item.label}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                isActive ? 'bg-white shadow-sm' : 'bg-transparent'
              }`}>
                <span className={`${isActive ? 'text-primary-700' : 'text-primary-100'}`}>
                  {item.icon}
                </span>
              </div>
            </button>
          )
        })}
          </div>
        </div>
      </div>
    </>
  )
}
