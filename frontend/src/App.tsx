import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProfileProvider } from './contexts/ProfileContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { GoogleAuth } from './auth/GoogleAuth'
import { Timeline } from './screens/Timeline/Timeline'
import { ArticleEditor } from './screens/Editor/ArticleEditor'
import { Statistics } from './screens/Stats/Statistics'
import { PhotoAssemblyScreen } from './screens/PhotoAssembly/PhotoAssemblyScreen'
import { Profile } from './screens/Profile/Profile'
import { FamileoBrowser } from './screens/Famileo/FamileoBrowser'
import { PdfExport } from './screens/PdfExport/PdfExport'
import { Settings } from './screens/Settings/Settings'
import { UpdatePrompt } from './components/UpdatePrompt'
import { PdfGenerationNotification } from './components/PdfGenerationNotification'
import { BottomNav } from './ui/BottomNav'

function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <UpdatePrompt />
        <PdfGenerationNotification />
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
                <PhotoAssemblyScreen />
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
