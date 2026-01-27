import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { LoadingScreen } from '../ui/Spinner'
import { ErrorMessage } from '../ui/ErrorMessage'
import { isStandalonePWA } from '../utils/constants'

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
  const [isStandalone] = useState(isStandalonePWA())
  const [showStandaloneHelp, setShowStandaloneHelp] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  // Check for stored auth error on mount
  useEffect(() => {
    const authError = localStorage.getItem('auth_error')
    if (authError) {
      setError(authError)
      localStorage.removeItem('auth_error')
    }
  }, [])

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
            .catch(() => {
              setError('Failed to get user information')
              setIsLoading(false)
              if (isStandalone) {
                setShowStandaloneHelp(true)
              }
            })
        } else {
          setError('Failed to authenticate with Google')
          setIsLoading(false)
          if (isStandalone) {
            setShowStandaloneHelp(true)
          }
        }
      },
      error_callback: () => {
        setError('Google Sign-In failed')
        setIsLoading(false)
        if (isStandalone) {
          setShowStandaloneHelp(true)
        }
      },
    })

    client?.requestAccessToken()
  }

  if (isLoading) {
    return <LoadingScreen message="Signing in..." />
  }

  // Show special help message if in standalone PWA mode and login failed
  if (isStandalone && showStandaloneHelp) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Rememly</h1>
          <p className="text-gray-600">Family photo journal</p>
        </div>

        <div className="mb-6 w-full max-w-md">
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-900 mb-3">
              Safari login required
            </h2>
            <p className="text-blue-800 text-sm mb-4">
              Google sign-in doesn't work in app mode. Please login from Safari:
            </p>
            <ol className="text-blue-800 text-sm space-y-2 mb-4 list-decimal list-inside">
              <li>Open Safari on your iPhone</li>
              <li>Go to <span className="font-mono bg-blue-100 px-1 rounded">grut505.github.io</span></li>
              <li>Sign in with your Google account</li>
              <li>Add the app to your home screen again</li>
            </ol>
            <p className="text-blue-700 text-xs italic">
              Important: you must re-add the app to your home screen after signing in from Safari.
            </p>
          </div>
        </div>

        <Button
          onClick={() => {
            // Open in Safari
            window.location.href = 'https://grut505.github.io/auth'
          }}
          className="w-full max-w-sm"
        >
          Open in Safari
        </Button>

        <button
          onClick={() => setShowStandaloneHelp(false)}
          className="mt-4 text-sm text-gray-600 underline"
        >
          Try sign-in again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Rememly</h1>
        <p className="text-gray-600">Family photo journal</p>
      </div>

      {error && (
        <div className="mb-6 w-full max-w-sm">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-600 text-center text-sm">{error}</div>
          </div>
        </div>
      )}

      <Button onClick={handleGoogleSignIn} className="w-full max-w-sm">
        {error ? 'Try another account' : 'Sign in with Google'}
      </Button>
    </div>
  )
}
