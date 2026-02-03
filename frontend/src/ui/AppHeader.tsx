import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Modal } from './Modal'
import { ABOUT_INFO } from '../data/about'
import { useUiStore } from '../state/uiStore'

interface AppHeaderProps {
  onMenuClick?: () => void
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const hasUnsavedChanges = useUiStore((state) => state.hasUnsavedChanges)
  const setPendingNavigationPath = useUiStore((state) => state.setPendingNavigationPath)
  const [showAbout, setShowAbout] = useState(false)
  const appVersion = import.meta.env.VITE_APP_VERSION || 'unknown'
  const backendVersion = import.meta.env.VITE_BACKEND_VERSION || 'unknown'
  const isSettingsActive = location.pathname.startsWith('/settings')

  return (
    <>
      <header className="bg-primary-600 text-white fixed left-0 right-0 z-30 shadow-md app-safe-top app-safe-top-height">
        <div className="max-w-content mx-auto w-full h-14 flex items-center px-4 relative">
          {/* True centered title across full app width */}
          <h1 className="absolute left-1/2 -translate-x-1/2 text-xl font-bold leading-none text-center pointer-events-none">
            Rememly
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowAbout(true)}
              className="p-2 hover:bg-primary-700 rounded-lg transition-colors touch-manipulation flex items-center justify-center"
              aria-label="About"
            >
            <svg className="w-6 h-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M12 18h.01"></path>
              <path d="M9.09 9a3 3 0 015.82 1c0 2-3 2-3 4"></path>
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
          </button>
          <button
            onClick={() => {
              if (isSettingsActive) return
              if (hasUnsavedChanges) {
                setPendingNavigationPath('/settings')
                return
              }
              navigate('/settings')
            }}
            className={`p-2 rounded-lg transition-colors touch-manipulation flex items-center justify-center ${
              isSettingsActive ? 'bg-primary-700' : 'hover:bg-primary-700'
            }`}
            aria-label="Settings"
          >
            <svg className="w-6 h-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            </button>
          </div>
        </div>
      </header>
      {/* Spacer to offset fixed header */}
      <div className="app-safe-top-height flex-shrink-0" />

      <Modal
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        title="About"
        align="center"
      >
        <div className="px-4 py-4 space-y-4 text-sm text-gray-700">
          <div className="space-y-2">
            <div className="font-semibold text-gray-900">Rememly</div>
            <div className="text-gray-600">Personal memory book generator</div>
          </div>

          <dl className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-gray-500">Developer</dt>
              <dd className="text-right text-gray-900">{ABOUT_INFO.developerName}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-gray-500">Versions</dt>
              <dd className="text-right text-gray-900">
                v{appVersion} / backend @{backendVersion}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-gray-500">Last publish</dt>
              <dd className="text-right text-gray-900">{ABOUT_INFO.lastPublished}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-gray-500">Project</dt>
              <dd className="text-right">
                <a
                  href={ABOUT_INFO.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-600 hover:text-primary-700 underline"
                >
                  GitHub (README)
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </Modal>
    </>
  )
}
