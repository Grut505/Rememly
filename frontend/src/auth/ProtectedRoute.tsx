import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { LoadingScreen } from '../ui/Spinner'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingScreen message="Checking authentication..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />
  }

  return <>{children}</>
}
