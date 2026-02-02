import { Suspense, lazy, useEffect } from 'react'
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
import { OrientationLockOverlay } from './components/OrientationLockOverlay'
import { BottomNav } from './ui/BottomNav'

function App() {
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

    const storageKey = 'safe_area_top'
    let lastValue = Number(localStorage.getItem(storageKey) || 0)
    if (lastValue > 0) {
      document.documentElement.style.setProperty('--safe-area-top', `${lastValue}px`)
    }
    const updateSafeArea = () => {
      const height = Math.round(measure.getBoundingClientRect().height)
      let nextValue = height

      const isPortrait = window.matchMedia?.('(orientation: portrait)').matches || window.innerHeight >= window.innerWidth
      if ((!nextValue || nextValue <= 0) && isPortrait) {
        const screenDiff = Math.round(window.screen.height - window.innerHeight)
        if (screenDiff > 0 && screenDiff < 200) {
          nextValue = screenDiff
        }
      }

      if (nextValue > 0) {
        lastValue = nextValue
        localStorage.setItem(storageKey, String(lastValue))
      }

      if (lastValue > 0) {
        document.documentElement.style.setProperty('--safe-area-top', `${lastValue}px`)
      }
    }

    const scheduleUpdate = () => {
      requestAnimationFrame(updateSafeArea)
      setTimeout(updateSafeArea, 300)
      setTimeout(updateSafeArea, 1000)
    }

    scheduleUpdate()
    window.addEventListener('orientationchange', scheduleUpdate)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.removeEventListener('orientationchange', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      measure.remove()
    }
  }, [])

  return (
    <AuthProvider>
      <ProfileProvider>
        <UpdatePrompt />
        <PdfGenerationNotification />
        <UnsavedChangesGuard />
        <OrientationLockOverlay />
        <div className="min-h-screen max-w-content mx-auto bg-white">
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
      <BottomNav />
      </ProfileProvider>
    </AuthProvider>
  )
}

export default App
