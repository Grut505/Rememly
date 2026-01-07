import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { GoogleAuth } from './auth/GoogleAuth'
import { Timeline } from './screens/Timeline/Timeline'
import { ArticleEditor } from './screens/Editor/ArticleEditor'
import { FiltersPanel } from './screens/Filters/FiltersPanel'
import { Statistics } from './screens/Stats/Statistics'
import { PhotoAssemblyScreen } from './screens/PhotoAssembly/PhotoAssemblyScreen'

function App() {
  return (
    <AuthProvider>
      <div className="h-full max-w-mobile mx-auto bg-white shadow-lg">
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
            path="/filters"
            element={
              <ProtectedRoute>
                <FiltersPanel />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  )
}

export default App
