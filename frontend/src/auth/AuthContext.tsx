import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

interface AuthContextType {
  user: { email: string; name: string } | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string, user: { email: string; name: string }) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('google_id_token')
    const savedUser = localStorage.getItem('user')

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem('google_id_token')
        localStorage.removeItem('user')
      }
    }

    setIsLoading(false)
  }, [])

  const login = (token: string, userData: { email: string; name: string }) => {
    localStorage.setItem('google_id_token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    navigate('/')
  }

  const logout = () => {
    localStorage.removeItem('google_id_token')
    localStorage.removeItem('user')
    setUser(null)
    navigate('/auth')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
