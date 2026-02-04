import { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProfileProvider } from './contexts/ProfileContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { GoogleAuth } from './auth/GoogleAuth'
import { Timeline } from './screens/Timeline/Timeline'
import { ArticleEditor } from './screens/Editor/ArticleEditor'
import { Statistics } from './screens/Stats/Statistics'
import { LoadingScreen } from './ui/Spinner'
const PhotoAssemblyScreen = lazy(() =>
  import('./screens/PhotoAssembly/PhotoAssemblyScreen').then((module) => ({
    default: module.PhotoAssemblyScreen,
  }))
)
import { Profile } from './screens/Profile/Profile'
import { FamileoBrowser } from './screens/Famileo/FamileoBrowser'
import { PdfExport } from './screens/PdfExport/PdfExport'
import { Settings } from './screens/Settings/Settings'
import { UpdatePrompt } from './components/UpdatePrompt'
import { PdfGenerationNotification } from './components/PdfGenerationNotification'
import { UnsavedChangesGuard } from './components/UnsavedChangesGuard'
import { BottomNav } from './ui/BottomNav'

function App() {
  const [landscapeBlocked, setLandscapeBlocked] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(orientation: landscape)')
    const update = () => {
      const isLandscape = media.matches
      const isSmallScreen = window.innerWidth <= 1024
      setLandscapeBlocked(isLandscape && isSmallScreen)
    }
    update()
    if (media.addEventListener) {
      media.addEventListener('change', update)
    } else {
      media.addListener(update)
    }
    window.addEventListener('resize', update)
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', update)
      } else {
        media.removeListener(update)
      }
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
    const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent)

    if (!isStandalone || !isIOS) return

    const measure = document.createElement('div')
    measure.style.position = 'fixed'
    measure.style.top = '0'
    measure.style.left = '0'
    measure.style.width = '0'
    measure.style.height = 'env(safe-area-inset-top)'
    measure.style.pointerEvents = 'none'
    measure.style.visibility = 'hidden'
    document.body.appendChild(measure)

    const maxSafeArea = 70
    const clampSafeArea = (value: number) => Math.min(Math.max(value, 0), maxSafeArea)
    const updateSafeArea = () => {
      const height = clampSafeArea(Math.round(measure.getBoundingClientRect().height))
      let nextValue = height

      if (!nextValue) {
        const vvOffset = clampSafeArea(Math.round(window.visualViewport?.offsetTop || 0))
        if (vvOffset > 0) nextValue = vvOffset
      }

      const appliedValue = nextValue
      document.documentElement.style.setProperty('--safe-area-top', `${appliedValue}px`)
    }

    const scheduleUpdate = () => {
      requestAnimationFrame(updateSafeArea)
      setTimeout(updateSafeArea, 300)
      setTimeout(updateSafeArea, 1000)
    }

    scheduleUpdate()
    window.addEventListener('orientationchange', scheduleUpdate)
    window.addEventListener('resize', scheduleUpdate)
    window.visualViewport?.addEventListener('resize', scheduleUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleUpdate)

    return () => {
      window.removeEventListener('orientationchange', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleUpdate)
      measure.remove()
    }
  }, [])

  return (
    <AuthProvider>
      <ProfileProvider>
        <UpdatePrompt />
        <PdfGenerationNotification />
        <UnsavedChangesGuard />
        {landscapeBlocked ? (
          <div className="min-h-screen bg-white flex items-center justify-center text-center px-6">
            <div className="max-w-md">
              <div className="text-lg font-semibold text-gray-900">Not compatible with landscape mode</div>
              <div className="text-sm text-gray-500 mt-2">Please rotate your device to portrait.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-screen bg-white">
              <div className="max-w-content mx-auto w-full">
                <Routes>
                  <Route path="/auth" element={<GoogleAuth />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Timeline />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/editor"
                    element={
                      <ProtectedRoute>
                        <ArticleEditor />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/editor/:id"
                    element={
                      <ProtectedRoute>
                        <ArticleEditor />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/stats"
                    element={
                      <ProtectedRoute>
                        <Statistics />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/photo-assembly"
                    element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingScreen message="Loading photo assembly..." />}>
                          <PhotoAssemblyScreen />
                        </Suspense>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/famileo"
                    element={
                      <ProtectedRoute>
                        <FamileoBrowser />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pdf-export"
                    element={
                      <ProtectedRoute>
                        <PdfExport />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <Settings />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </div>
            <BottomNav />
          </>
        )}
      </ProfileProvider>
    </AuthProvider>
  )
}

export default App
