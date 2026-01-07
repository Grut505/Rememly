import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { LoadingScreen } from '../ui/Spinner'
import { ErrorMessage } from '../ui/ErrorMessage'

declare global {
  interface Window {
    google: any
  }
}

export function GoogleAuth() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  useEffect(() => {
    // Load Google Identity Services
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  const handleGoogleSignIn = () => {
    setIsLoading(true)
    setError(null)

    const client = window.google?.accounts?.oauth2?.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      callback: (response: any) => {
        if (response.access_token) {
          // Get user info
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
              Authorization: `Bearer ${response.access_token}`,
            },
          })
            .then((res) => res.json())
            .then((data) => {
              login(response.access_token, {
                email: data.email,
                name: data.name,
              })
              setIsLoading(false)
            })
            .catch((err) => {
              setError('Failed to get user information')
              setIsLoading(false)
            })
        } else {
          setError('Failed to authenticate with Google')
          setIsLoading(false)
        }
      },
      error_callback: () => {
        setError('Google Sign-In failed')
        setIsLoading(false)
      },
    })

    client?.requestAccessToken()
  }

  if (isLoading) {
    return <LoadingScreen message="Signing in..." />
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Rememly</h1>
        <p className="text-gray-600">Family photo journal</p>
      </div>

      {error && (
        <div className="mb-6 w-full max-w-sm">
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        </div>
      )}

      <Button onClick={handleGoogleSignIn} className="w-full max-w-sm">
        Sign in with Google
      </Button>
    </div>
  )
}
